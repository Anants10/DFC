from flask import Blueprint, current_app, jsonify
health_bp = Blueprint("health", __name__)

def _check_tf():
    try:
        import tensorflow as tf
        kv = tf.keras.__version__
        km = int(kv.split(".")[0]) if kv[0].isdigit() else 0
        return {"available": True, "tf_version": tf.__version__,
                "keras_version": kv, "keras_ok": km >= 3,
                "error": None if km >= 3 else f"Keras {kv} too old",
                "hint": None if km >= 3 else "pip install tensorflow==2.18.0"}
    except ImportError:
        return {"available": False, "tf_version": None, "keras_version": None,
                "keras_ok": False, "error": "TensorFlow not installed",
                "hint": "py -3.10 -m pip install tensorflow==2.18.0"}

@health_bp.get("/health")
def health():
    ms  = current_app.model_state
    env = _check_tf()
    return jsonify({
        "ok": True,
        "service": "DFCCIL Flask ML Server",
        "loaded": ms.is_loaded,
        "model": ms.loaded_filename,
        "tf_available": env["available"],
        "tf_version": env.get("tf_version"),
        "keras_version": env.get("keras_version"),
        "keras_ok": env.get("keras_ok", False),
        "env_error": env.get("error"),
        "env_hint": env.get("hint"),
    })
