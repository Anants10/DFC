"""
ModelState — holds exactly one loaded Keras model at a time.

PREDICTION DIRECTION — controlled by sidecar .meta.json:
  Softmax 2-class models (VGG16_E15_best.keras, best.keras):
    raw = [P(class_0), P(class_1)]
    crack_index in meta = which index is the CRACK class (default 0)
    p_crack = raw[crack_index]

  Sigmoid 1-unit models (best_model.keras):
    raw = [P(positive_class)]
    sigmoid_invert = True  → p_crack = 1.0 - raw[0]  (positive = normal)
    sigmoid_invert = False → p_crack = raw[0]          (positive = crack)

  The sidecar .meta.json persists these settings across Flask restarts.
  Users configure it ONCE in Model Manager → Prediction Direction card.
"""
import json
import traceback
from pathlib import Path

import numpy as np
import cv2


class ModelState:
    def __init__(self):
        self._model    = None
        self._filename = None
        self._path     = None
        self._meta     = {}   # loaded from / saved to sidecar .meta.json

    # ── Properties ───────────────────────────────────────────────────────────
    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def loaded_filename(self) -> "str | None":
        return self._filename

    @property
    def loaded_path(self) -> "str | None":
        return self._path

    # ── Sidecar helpers ───────────────────────────────────────────────────────
    @staticmethod
    def _sidecar_path(model_path: str) -> Path:
        p = Path(model_path)
        return p.parent / (p.stem + ".meta.json")

    @staticmethod
    def _load_meta(model_path: str) -> dict:
        sp = ModelState._sidecar_path(model_path)
        if sp.exists():
            try:
                return json.loads(sp.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    @staticmethod
    def _save_meta_to(model_path: str, meta: dict):
        sp = ModelState._sidecar_path(model_path)
        sp.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # ── Load ──────────────────────────────────────────────────────────────────
    def load(self, path: str, filename: str) -> dict:
        """Load a Keras model. Detects output type and reads/creates sidecar."""
        try:
            import tensorflow as tf
            kv = tf.keras.__version__
            km = int(kv.split(".")[0]) if kv[0].isdigit() else 0
            if km < 3:
                return {
                    "ok": False,
                    "error": f"Keras {kv} installed but model needs Keras ≥ 3.0.",
                    "hint": "Run: pip install tensorflow==2.18.0 then restart Flask.",
                }
        except ImportError:
            return {"ok": False, "error": "TensorFlow not installed.",
                    "hint": "Run: py -3.10 -m pip install tensorflow==2.18.0"}

        try:
            import tensorflow as tf
            print(f"Loading model: {path}")
            model = tf.keras.models.load_model(path, compile=False)

            # Warm-up + detect output shape
            dummy = np.zeros((1, 224, 224, 3), dtype=np.float32)
            out   = model.predict(dummy, verbose=0).ravel()

            output_units  = int(out.size)
            is_sigmoid    = output_units == 1
            activation    = "sigmoid" if is_sigmoid else "softmax"

            # Load existing sidecar or create defaults
            meta = self._load_meta(path)

            if is_sigmoid:
                # Default: invert=True because most sigmoid models output
                # near 1.0 for NORMAL (positive class = normal).
                # User can toggle this in Model Manager if wrong.
                if "sigmoid_invert" not in meta:
                    meta["sigmoid_invert"] = True
            else:
                # Softmax: default crack_index=0
                if "crack_index" not in meta:
                    meta["crack_index"] = 0

            # Save sidecar with defaults
            self._save_meta_to(path, meta)

            self._model    = model
            self._filename = filename
            self._path     = path
            self._meta     = meta

            print(f"✅ Loaded '{filename}'. Units={output_units}, "
                  f"activation={activation}, meta={meta}")
            return {
                "ok":           True,
                "filename":     filename,
                "outputShape":  list(out.shape),
                "outputUnits":  output_units,
                "activation":   activation,
                "kerasVersion": tf.keras.__version__,
                "meta":         meta,
                "message":      (f"'{filename}' loaded. "
                                 f"{'Sigmoid' if is_sigmoid else 'Softmax'} output. "
                                 f"Check Prediction Direction below."),
            }
        except Exception as e:
            traceback.print_exc()
            err = str(e)
            if "Functional" in err or "cannot be imported" in err:
                return {
                    "ok": False,
                    "error": "Keras version mismatch. Your model needs Keras ≥ 3.",
                    "hint": "pip install tensorflow==2.18.0 then restart Flask.",
                }
            return {"ok": False, "error": err}

    # ── Unload ────────────────────────────────────────────────────────────────
    def unload(self):
        self._model    = None
        self._filename = None
        self._path     = None
        self._meta     = {}

    # ── Predict ───────────────────────────────────────────────────────────────
    def predict(self, img_bgr: np.ndarray, threshold: float = 0.5,
                img_size: int = 224) -> dict:
        """
        Run inference on a BGR image.
        Applies prediction direction from sidecar meta.
        """
        if self._model is None:
            raise RuntimeError("No model loaded. Upload and load a model first.")

        import tensorflow as tf

        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
        img_res = cv2.resize(img_rgb, (img_size, img_size),
                             interpolation=cv2.INTER_AREA)
        x   = np.expand_dims(img_res, 0)
        raw = self._model.predict(x, verbose=0).ravel()

        # ── Output interpretation using sidecar meta ──────────────────────────
        if raw.size == 1:
            # Sigmoid single-output model
            sigmoid_invert = self._meta.get("sigmoid_invert", True)
            if sigmoid_invert:
                # raw[0] near 1 = NORMAL → invert so high value = CRACK
                p_crack  = float(1.0 - raw[0])
            else:
                p_crack  = float(raw[0])
            p_normal = 1.0 - p_crack

        elif raw.size == 2:
            # Softmax 2-class model
            crack_index = int(self._meta.get("crack_index", 0))
            normal_index = 1 - crack_index
            p_crack  = float(raw[crack_index])
            p_normal = float(raw[normal_index])

        else:
            # Multi-class — use crack_index from meta
            probs       = tf.nn.softmax(raw).numpy()
            crack_index = int(self._meta.get("crack_index", 0))
            p_crack     = float(probs[crack_index])
            p_normal    = 1.0 - p_crack

        # Clamp to [0,1]
        p_crack  = max(0.0, min(1.0, p_crack))
        p_normal = max(0.0, min(1.0, p_normal))
        is_crack = p_crack >= threshold

        return {
            "pCrack":    round(p_crack,  6),
            "pNormal":   round(p_normal, 6),
            "label":     "CRACK" if is_crack else "NORMAL",
            "isCrack":   bool(is_crack),
            "model":     self._filename,
            "threshold": threshold,
        }

    # ── Meta management ───────────────────────────────────────────────────────
    def get_meta(self) -> dict:
        """Return copy of current sidecar metadata."""
        return dict(self._meta)

    def update_meta(self, updates: dict) -> dict:
        """Merge updates into meta and persist to sidecar file."""
        self._meta.update(updates)
        if self._path:
            self._save_meta_to(self._path, self._meta)
        return dict(self._meta)
