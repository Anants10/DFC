# flask-ml/routes/flir_routes.py
#
# GPS SOURCE: FLIR T1020 camera built-in GPS hardware ONLY.
# No browser GPS fallback.
#
# GPS data path:
#   thermalImage.GpsInformation (C# SDK, CameraService.cs)
#   → FrameStore → C# bridge /api/frame
#   → here (frame_data['lat'], frame_data['lon'], frame_data['gpsIsValid'])
#   → JSON response to VideoLive.jsx (d.lat, d.lon, d.gpsIsValid)
#   → crack photo metadata → PDF report
#
# GPS is null when:
#   - Camera indoors (no satellite fix)
#   - GPS module disabled (camera menu → Settings → GPS → Enable)
#   - GpsInformation is NULL on this connection type
#
# GPS is valid when:
#   - Camera outdoors with clear sky, satellite fix acquired (1-5 min after power-on)
#   - gpsIsValid=True (thermalImage.GpsInformation.IsValid)

import base64
import requests
from flask import Blueprint, jsonify, request, current_app

flir_bp = Blueprint('flir', __name__, url_prefix='/flir')

BRIDGE_URL      = 'http://localhost:7654'
BRIDGE_TIMEOUT  = 5
CONNECT_TIMEOUT = 20
FRAME_TIMEOUT   = 3

_frame_log_counter = 0
GPS_LOG_EVERY_N    = 10


def _bridge_get(path, timeout=BRIDGE_TIMEOUT):
    try:
        r = requests.get(f'{BRIDGE_URL}{path}', timeout=timeout)
        r.raise_for_status()
        return r.json(), None
    except requests.exceptions.ConnectionError:
        return None, 'FLIR Bridge not running. Start: cd flir-service && dotnet run'
    except requests.exceptions.Timeout:
        return None, f'FLIR Bridge timed out after {timeout}s.'
    except Exception as e:
        return None, str(e)


def _bridge_post(path, timeout=BRIDGE_TIMEOUT):
    try:
        r = requests.post(f'{BRIDGE_URL}{path}', timeout=timeout)
        r.raise_for_status()
        return r.json(), None
    except requests.exceptions.ConnectionError:
        return None, 'FLIR Bridge not running. Start: cd flir-service && dotnet run'
    except requests.exceptions.Timeout:
        return None, f'FLIR Bridge timed out after {timeout}s.'
    except Exception as e:
        return None, str(e)


@flir_bp.route('/status', methods=['GET'])
def flir_status():
    data, err = _bridge_get('/api/status')
    if err:
        return jsonify({'ok': False, 'bridgeOnline': False, 'connected': False, 'error': err}), 503
    return jsonify({
        'ok': True, 'bridgeOnline': True,
        'connected':      data.get('connected', False),
        'cameraName':     data.get('cameraName', ''),
        'connectionType': data.get('connectionType', ''),   # "Wi-Fi (AP)" | "USB" | "Ethernet" | ""
        'frameCount':     data.get('frameCount', 0),
        'hasFrame':       data.get('hasFrame', False),
        'lastFrame':      data.get('lastFrame'),
        'lastError':      data.get('lastError', ''),
    })


@flir_bp.route('/connect', methods=['POST'])
def flir_connect():
    data, err = _bridge_post('/api/connect', timeout=CONNECT_TIMEOUT)
    if err:
        return jsonify({'ok': False, 'error': err}), 503
    if not data.get('success'):
        return jsonify({'ok': False, 'error': data.get('message', 'Connect failed')}), 503
    return jsonify({
        'ok': True,
        'camera':         data.get('camera', ''),
        'connectionType': data.get('connectionType', ''),   # "Wi-Fi (AP)" | "USB" | "Ethernet" | ""
    })


@flir_bp.route('/disconnect', methods=['POST'])
def flir_disconnect():
    data, err = _bridge_post('/api/disconnect')
    if err:
        return jsonify({'ok': False, 'error': err}), 503
    return jsonify({'ok': True})


@flir_bp.route('/predict_frame', methods=['POST'])
def flir_predict_frame():
    global _frame_log_counter
    _frame_log_counter += 1
    should_log = (_frame_log_counter % GPS_LOG_EVERY_N == 1)

    # 1. Pull latest frame from C# bridge
    frame_data, err = _bridge_get('/api/frame', timeout=FRAME_TIMEOUT)
    if err:
        return jsonify({'ok': False, 'error': err}), 503
    jpeg_b64 = frame_data.get('jpeg')
    if not jpeg_b64:
        return jsonify({'ok': False, 'error': 'No frame from camera. Is camera streaming?'}), 503

    # 2. GPS — FLIR T1020 camera hardware ONLY (no browser fallback)
    lat          = frame_data.get('lat')        # from thermalImage.GpsInformation.Latitude
    lon          = frame_data.get('lon')        # from thermalImage.GpsInformation.Longitude
    gps_is_valid = frame_data.get('gpsIsValid', False)  # True = real satellite fix
    heading      = frame_data.get('heading')
    temp_min     = frame_data.get('tempMin', 0.0)
    temp_max     = frame_data.get('tempMax', 0.0)
    temp_avg     = frame_data.get('tempAvg', 0.0)
    frame_number = frame_data.get('frameNumber', 0)

    # Log GPS state in Flask terminal
    if should_log:
        if lat is not None and lon is not None:
            print(f'[FLIR GPS] Frame#{frame_number}: lat={lat}, lon={lon}, '
                  f'gpsIsValid={gps_is_valid}')
            if not gps_is_valid:
                print('[FLIR GPS]   No satellite fix yet — take camera outdoors with clear sky')
        else:
            print(f'[FLIR GPS] Frame#{frame_number}: lat=NULL lon=NULL')
            print('[FLIR GPS]   thermalImage.GpsInformation is NULL or has no coordinates')
            print('[FLIR GPS]   Fix: Camera menu → Settings → GPS → Enable, then go outdoors')

    # 3. Run TF inference
    model_state    = current_app.model_state
    upload_manager = current_app.upload_manager

    if not model_state.is_loaded:
        return jsonify({'ok': False, 'error': 'No model loaded.'}), 503

    body      = request.get_json(silent=True) or {}
    threshold = float(body.get('threshold', 0.5))
    img_size  = int(body.get('img_size', 224))

    try:
        img_bytes = base64.b64decode(jpeg_b64)
        img_bgr   = upload_manager.decode_bytes(img_bytes)
        if img_bgr is None:
            return jsonify({'ok': False, 'error': 'Could not decode JPEG from bridge.'}), 500
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Image decode error: {e}'}), 500

    try:
        result = model_state.predict(img_bgr, threshold=threshold, img_size=img_size)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Inference error: {e}'}), 500

    maps_link = None
    if lat is not None and lon is not None:
        maps_link = f'https://www.google.com/maps?q={lat},{lon}'

    if result.get('isCrack') and lat is not None:
        print(f'[FLIR GPS] *** CRACK at Frame#{frame_number}: '
              f'lat={lat}, lon={lon}, gpsIsValid={gps_is_valid}, '
              f'pCrack={result["pCrack"]:.3f} ***')
        print(f'[FLIR GPS]     Maps: {maps_link}')

    return jsonify({
        'ok':          True,
        'pCrack':      result['pCrack'],
        'pNormal':     result['pNormal'],
        'isCrack':     result['isCrack'],
        'label':       result['label'],
        'model':       result.get('model', ''),
        'threshold':   threshold,
        'jpeg':        jpeg_b64,
        # GPS from FLIR T1020 camera hardware only
        'lat':         lat,
        'lon':         lon,
        'gpsIsValid':  gps_is_valid,
        'heading':     heading,
        'mapsLink':    maps_link,
        # Thermal metadata
        'tempMin':     temp_min,
        'tempMax':     temp_max,
        'tempAvg':     temp_avg,
        'frameNumber': frame_number,
        'capturedAt':  frame_data.get('capturedAt', ''),
    })

@flir_bp.route('/snapshot', methods=['POST'])
def flir_snapshot():
    """
    Pull the current frame from the FLIR bridge and return it as raw JPEG
    (base64) with thermal/GPS metadata — WITHOUT running ML inference.
    Called by ImageAnalysis.jsx FlirCapturePanel when user clicks
    "Capture Frame for Analysis".
    """
    # Fetch status first to get connectionType (Wi-Fi/USB/Ethernet)
    status_data, _ = _bridge_get('/api/status', timeout=2)
    connection_type = status_data.get('connectionType', '') if status_data else ''

    frame_data, err = _bridge_get('/api/frame', timeout=FRAME_TIMEOUT)
    if err:
        return jsonify({'ok': False, 'error': err}), 503

    jpeg_b64 = frame_data.get('jpeg')
    if not jpeg_b64:
        return jsonify({'ok': False, 'error': 'No frame from camera. Is camera streaming?'}), 503

    lat          = frame_data.get('lat')
    lon          = frame_data.get('lon')
    gps_is_valid = frame_data.get('gpsIsValid', False)
    heading      = frame_data.get('heading')
    temp_min     = frame_data.get('tempMin', 0.0)
    temp_max     = frame_data.get('tempMax', 0.0)
    temp_avg     = frame_data.get('tempAvg', 0.0)
    frame_number = frame_data.get('frameNumber', 0)
    captured_at  = frame_data.get('capturedAt', '')

    print(f'[FLIR Snapshot] Frame#{frame_number}: '
          f'tempMin={temp_min} tempMax={temp_max} tempAvg={temp_avg} '
          f'gpsIsValid={gps_is_valid} lat={lat} lon={lon} '
          f'connectionType={connection_type}')

    return jsonify({
        'ok':            True,
        'jpeg':          jpeg_b64,
        'frameNumber':   frame_number,
        'capturedAt':    captured_at,
        'tempMin':       temp_min,
        'tempMax':       temp_max,
        'tempAvg':       temp_avg,
        'lat':           lat,
        'lon':           lon,
        'gpsIsValid':    gps_is_valid,
        'heading':       heading,
        'connectionType': connection_type,   # "Wi-Fi (AP)" | "USB" | "Ethernet" | ""
    })