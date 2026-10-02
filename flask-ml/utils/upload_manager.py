"""
UploadManager — handles safe model and image uploads.

Model files are saved in chunks with os.fsync() to guarantee
the file is fully flushed to disk before any read/load.
After saving, the .keras file is validated as a proper ZIP
with config.json inside — catching corruption immediately.

This prevents the 'corrupted .keras file' problem that occurred
when large files were written with open('w','wb') without flushing.
"""
import os, zipfile, json, uuid, datetime
from pathlib import Path

import cv2
import numpy as np


SCRIPT_DIR = Path(__file__).parent.parent.resolve()


class UploadManager:
    def __init__(self):
        self.models_dir = SCRIPT_DIR / "uploads" / "models"
        self.cracks_dir = SCRIPT_DIR / "uploads" / "detected_cracks"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.cracks_dir.mkdir(parents=True, exist_ok=True)

    # ── Model saving ──────────────────────────────────────────────
    def save_model_file(self, file_storage, filename: str) -> Path:
        """
        Save an uploaded model file safely:
          1. Write in 8 MB chunks
          2. fsync() to force OS buffer flush
          3. Validate as proper Keras ZIP
        Returns the saved Path on success, raises on failure.
        """
        dest = self.models_dir / filename
        CHUNK = 8 * 1024 * 1024  # 8 MB

        # Write in chunks
        file_storage.seek(0)
        with open(str(dest), "wb") as fout:
            while True:
                chunk = file_storage.read(CHUNK)
                if not chunk:
                    break
                fout.write(chunk)
            fout.flush()
            os.fsync(fout.fileno())  # guarantee write to disk

        # Validate immediately after save
        valid, err = self.validate_keras_zip(dest)
        if not valid:
            dest.unlink(missing_ok=True)  # remove corrupted file
            raise ValueError(f"Model file invalid after save: {err}")

        return dest

    @staticmethod
    def validate_keras_zip(path: Path) -> tuple:
        """Check the .keras/.h5 file is a valid ZIP with config.json."""
        try:
            with zipfile.ZipFile(str(path)) as zf:
                names = zf.namelist()
                if "config.json" not in names:
                    return False, "Missing config.json — not a valid Keras archive"
                if "metadata.json" in names:
                    meta = json.loads(zf.read("metadata.json"))
                    kv   = meta.get("keras_version", "")
                    km   = int(kv.split(".")[0]) if kv and kv[0].isdigit() else 0
                    if km < 3:
                        return False, (
                            f"Model was saved with Keras {kv}. "
                            f"This server needs Keras ≥ 3.0. "
                            f"Upgrade: pip install tensorflow==2.18.0"
                        )
            return True, None
        except zipfile.BadZipFile as e:
            return False, f"Corrupted ZIP archive: {e}"
        except Exception as e:
            return False, str(e)

    def list_models(self) -> list:
        """List all model files in the uploads/models directory."""
        result = []
        for p in sorted(self.models_dir.iterdir()):
            if p.suffix.lower() not in (".keras", ".h5"):
                continue
            valid, err = self.validate_keras_zip(p)
            sz = p.stat().st_size
            result.append({
                "filename":  p.name,
                "fileSize":  f"{sz / 1e6:.0f} MB",
                "sizeMB":    round(sz / 1e6, 1),
                "format":    p.suffix,
                "valid":     valid,
                "error":     err,
                "path":      str(p),
            })
        return result

    # ── Crack image saving ─────────────────────────────────────────
    def save_crack_image(self, img_bgr: np.ndarray) -> str:
        """Save a crack frame. Returns the filename."""
        ts    = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        uid   = uuid.uuid4().hex[:6]
        fname = f"crack_{ts}_{uid}.jpg"
        cv2.imwrite(str(self.cracks_dir / fname), img_bgr)
        return fname

    def decode_bytes(self, raw: bytes) -> "np.ndarray | None":
        try:
            arr = np.frombuffer(raw, np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def decode_base64(self, b64: str) -> "np.ndarray | None":
        import base64
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        try:
            arr = np.frombuffer(base64.b64decode(b64), np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None
