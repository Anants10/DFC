"""
Model management routes:
  GET  /models          — list uploaded model files
  POST /upload_model    — upload a new .keras/.h5 file (safe chunked write)
  POST /load_model      — load an uploaded model into memory
  POST /unload_model    — unload current model
"""
from werkzeug.utils import secure_filename
from flask import Blueprint, current_app, jsonify, request

model_bp = Blueprint("models", __name__)


@model_bp.get("/models")
def list_models():
    return jsonify({"models": current_app.upload_manager.list_models()})


@model_bp.post("/upload_model")
def upload_model():
    if "model" not in request.files:
        return jsonify({"ok": False, "error": "No file field 'model' found"}), 400

    file  = request.files["model"]
    fname = secure_filename(file.filename or "")
    if not fname.lower().endswith((".keras", ".h5")):
        return jsonify({"ok": False, "error": "Only .keras / .h5 files are accepted"}), 400

    try:
        saved = current_app.upload_manager.save_model_file(file, fname)
        sz    = saved.stat().st_size
        return jsonify({
            "ok":       True,
            "filename": fname,
            "fileSize": f"{sz / 1e6:.0f} MB",
            "path":     str(saved),
            "message":  f"'{fname}' uploaded and validated successfully.",
        })
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 422
    except Exception as e:
        return jsonify({"ok": False, "error": f"Upload failed: {e}"}), 500


@model_bp.post("/load_model")
def load_model():
    body     = request.get_json(silent=True) or {}
    filename = body.get("filename", "").strip()
    if not filename:
        return jsonify({"ok": False, "error": "filename is required"}), 400

    um   = current_app.upload_manager
    path = um.models_dir / filename
    if not path.exists():
        return jsonify({
            "ok":    False,
            "error": f"'{filename}' not found. Upload it first via the Model Manager.",
        }), 404

    valid, err = um.validate_keras_zip(path)
    if not valid:
        return jsonify({"ok": False, "error": f"Model invalid: {err}"}), 422

    result = current_app.model_state.load(str(path), filename)
    return jsonify(result), 200 if result["ok"] else 422


@model_bp.post("/unload_model")
def unload_model():
    current_app.model_state.unload()
    return jsonify({"ok": True, "message": "Model unloaded."})


@model_bp.get("/model_meta")
def get_model_meta():
    ms = current_app.model_state
    if not ms.is_loaded:
        return jsonify({"ok": False, "error": "No model loaded"}), 400
    return jsonify({"ok": True, "filename": ms.loaded_filename, "meta": ms.get_meta()})


@model_bp.post("/model_meta")
def set_model_meta():
    ms      = current_app.model_state
    if not ms.is_loaded:
        return jsonify({"ok": False, "error": "No model loaded"}), 400
    updates = request.get_json(silent=True) or {}
    meta    = ms.update_meta(updates)
    return jsonify({"ok": True, "meta": meta, "message": "Prediction direction saved."})
