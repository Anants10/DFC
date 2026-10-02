# flask-ml/utils/gps_utils.py
# Real GPS from browser navigator.geolocation.watchPosition()
# No hardcoded or simulated coordinates.

def get_gps_from_request(request_form):
    """Read lat/lon sent by browser from the request form dict."""
    try:
        lat = float(request_form.get('lat', ''))
        lon = float(request_form.get('lon', ''))
        return lat, lon
    except (TypeError, ValueError):
        return None, None

def maps_link(lat, lon):
    """Return Google Maps URL or None."""
    if lat is None or lon is None:
        return None
    return f"https://www.google.com/maps?q={lat},{lon}"
