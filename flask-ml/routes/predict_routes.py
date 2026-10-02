"""
Prediction routes:
  POST /predict_image — single image (multipart or JSON base64)
  POST /predict_frame — single video frame (JSON base64, low latency)
  POST /predict_video — full video file (multipart, returns summary)
"""
import os, tempfile, time
import cv2
import numpy as np
from flask import Blueprint, current_app, jsonify, request
from utils.gps_utils import get_gps_from_request, maps_link

predict_bp = Blueprint("predict", __name__)


def _decode_image(req):
    """Extract BGR image from multipart 'image' field or JSON base64."""
    um = current_app.upload_manager
    if req.files.get("image"):
        return um.decode_bytes(req.files["image"].read())
    if req.is_json:
        b64 = (req.json or {}).get("image", "")
        if b64:
            return um.decode_base64(b64)
    return None


def _get_params(req):
    try:
        thr = float(req.form.get("threshold") or (req.json or {}).get("threshold", 0.5))
    except Exception:
        thr = 0.5
    try:
        sz = int(req.form.get("img_size") or (req.json or {}).get("img_size", 224))
    except Exception:
        sz = 224
    return thr, sz


@predict_bp.post("/predict_image")
def predict_image():
    ms = current_app.model_state
    if not ms.is_loaded:
        return jsonify({"ok": False, "error": "No model loaded. Upload and load a model first."}), 400

    img_bgr = _decode_image(request)
    if img_bgr is None:
        return jsonify({"ok": False, "error": "No valid image provided (use 'image' field)"}), 400

    thr, sz = _get_params(request)
    try:
        result         = ms.predict(img_bgr, threshold=thr, img_size=sz)
        result["ok"]   = True
        if result["isCrack"]:
            lat, lon           = get_gps_from_request(request.form)
            result["lat"]      = lat
            result["lon"]      = lon
            result["mapsLink"] = maps_link(lat, lon)
            fname              = current_app.upload_manager.save_crack_image(img_bgr)
            result["savedAs"]  = fname
        return jsonify(result)
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@predict_bp.post("/predict_frame")
def predict_frame():
    ms = current_app.model_state
    if not ms.is_loaded:
        return jsonify({"ok": False, "error": "No model loaded"}), 400

    body = request.get_json(silent=True) or {}
    thr  = float(body.get("threshold", 0.5))
    sz   = int(body.get("img_size", 224))
    b64  = body.get("image", "")
    if not b64:
        return jsonify({"ok": False, "error": "No image provided"}), 400

    img_bgr = current_app.upload_manager.decode_base64(b64)
    if img_bgr is None:
        return jsonify({"ok": False, "error": "Image decode failed"}), 400

    # ── Try FLIR bridge for thermal metadata ─────────────────────────────────
    # When FLIR T1020 is the UVC webcam source (Live Camera tab), the bridge
    # runs alongside and provides temp/GPS from the SAME camera.
    # Use /api/status → lastFrame which is always cached (no timeout risk).
    # Fails silently when bridge is not running (regular webcam users unaffected).
    temp_min = temp_max = temp_avg = None
    lat = lon = None
    gps_is_valid = False
    heading = None
    frame_number = None

    try:
        import requests as _req
        # /api/status is always fast — returns the cached FrameStore snapshot
        sr = _req.get("http://localhost:7654/api/status", timeout=0.3)
        if sr.status_code == 200:
            sd = sr.json()
            lf = sd.get("lastFrame")
            if lf:
                temp_min     = lf.get("tempMin")
                temp_max     = lf.get("tempMax")
                temp_avg     = lf.get("tempAvg")
                lat          = lf.get("lat")
                lon          = lf.get("lon")
                gps_is_valid = lf.get("gpsIsValid", False)
                heading      = lf.get("heading")
                frame_number = lf.get("frameNumber")
                print(f"[predict_frame] FLIR bridge: temp={temp_avg}°C lat={lat} lon={lon} frame={frame_number}")
    except Exception:
        pass  # Bridge not running — all fields stay None

    maps_url = maps_link(lat, lon) if (lat is not None and lon is not None) else None

    try:
        result       = ms.predict(img_bgr, threshold=thr, img_size=sz)
        result["ok"] = True
        result["tempMin"]     = temp_min
        result["tempMax"]     = temp_max
        result["tempAvg"]     = temp_avg
        result["lat"]         = lat
        result["lon"]         = lon
        result["gpsIsValid"]  = gps_is_valid
        result["heading"]     = heading
        result["mapsLink"]    = maps_url
        result["frameNumber"] = frame_number
        return jsonify(result)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@predict_bp.post("/predict_video")
def predict_video():
    """
    Full video prediction — safe temp file approach:
      1. Write video in 8 MB chunks with fsync
      2. Run frame-by-frame inference
      3. Delete temp file on exit
    """
    ms = current_app.model_state
    if not ms.is_loaded:
        return jsonify({"ok": False, "error": "No model loaded"}), 400

    if "video" not in request.files:
        return jsonify({"ok": False, "error": "No 'video' field"}), 400

    vfile     = request.files["video"]
    thr       = float(request.form.get("threshold", 0.5))
    sz        = int(request.form.get("img_size", 224))
    skip      = max(1, int(request.form.get("frame_skip", 6)))

    # Safe temp file write
    suffix = os.path.splitext(vfile.filename or "video")[1].lower() or ".mp4"
    tmp    = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        CHUNK = 8 * 1024 * 1024
        vfile.seek(0)
        while True:
            chunk = vfile.read(CHUNK)
            if not chunk:
                break
            tmp.write(chunk)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()

        cap = cv2.VideoCapture(tmp.name)
        if not cap.isOpened():
            return jsonify({"ok": False, "error": "Cannot open video. Try MP4/H.264."}), 422

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        fps_src      = cap.get(cv2.CAP_PROP_FPS) or 25

        timeline      = []
        crack_events  = []
        frame_idx     = 0
        t0            = time.time()

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            if frame_idx % skip != 0:
                continue

            pred = ms.predict(frame, threshold=thr, img_size=sz)
            t_s  = round(frame_idx / fps_src, 2)
            timeline.append({"frame": frame_idx, "time_s": t_s, "isCrack": pred["isCrack"], "pCrack": pred["pCrack"]})

            if pred["isCrack"]:
                lat, lon = get_gps_from_request(request.form)
                saved    = current_app.upload_manager.save_crack_image(frame)
                crack_events.append({
                    "frame":    frame_idx,
                    "time_s":   t_s,
                    "pCrack":   pred["pCrack"],
                    "lat":      lat,
                    "lon":      lon,
                    "mapsLink": maps_link(lat, lon),
                    "savedAs":  saved,
                })

        cap.release()
        analysed  = len(timeline)
        cracks    = len(crack_events)

        return jsonify({
            "ok":             True,
            "totalFrames":    total_frames,
            "analysedFrames": analysed,
            "crackFrames":    cracks,
            "normalFrames":   analysed - cracks,
            "crackRate":      round(cracks / max(analysed, 1) * 100, 2),
            "elapsed":        round(time.time() - t0, 2),
            "fpsSrc":         round(fps_src, 2),
            "timeline":       timeline,
            "crackEvents":    crack_events,
        })
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass