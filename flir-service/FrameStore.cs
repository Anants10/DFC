// FrameStore.cs — Thread-safe latest-frame storage for FLIR bridge

namespace FlirBridge;

/// <summary>
/// One complete frame extracted from the FLIR T1020.
/// All fields are value-safe copies — the FLIR image lock is NOT held here.
/// </summary>
public sealed class FlirFrame
{
    /// <summary>JPEG bytes of the false-colour thermal image (fed to Flask/TensorFlow).</summary>
    public required byte[] JpegBytes { get; init; }

    /// <summary>Latitude from camera GPS. Null if no satellite fix or camera GPS unavailable.</summary>
    public double? Latitude { get; init; }

    /// <summary>Longitude from camera GPS. Null if no satellite fix or camera GPS unavailable.</summary>
    public double? Longitude { get; init; }

    /// <summary>
    /// True only when the camera's internal GPS receiver has an active satellite fix.
    /// False when GPS hardware is present but no outdoor fix (e.g. indoor USB testing).
    /// The frontend should fall back to browser geolocation when this is false.
    /// </summary>
    public bool GpsIsValid { get; init; }

    /// <summary>Compass heading in degrees (0-360). Null if compass unavailable.</summary>
    public double? Heading { get; init; }

    /// <summary>Minimum temperature in the full frame (°C).</summary>
    public double TempMin { get; init; }

    /// <summary>Maximum temperature in the full frame (°C).</summary>
    public double TempMax { get; init; }

    /// <summary>Average temperature in the full frame (°C).</summary>
    public double TempAvg { get; init; }

    /// <summary>UTC timestamp when this frame was captured.</summary>
    public DateTime CapturedAt { get; init; }

    /// <summary>Sequential frame counter since camera connected.</summary>
    public long FrameNumber { get; init; }
}

/// <summary>
/// Thread-safe single-slot frame buffer.
/// Writers: CameraService (ImageReceived callback, camera thread).
/// Readers: ASP.NET Core /api/frame handler (HTTP thread pool).
/// </summary>
public sealed class FrameStore
{
    private readonly object _lock = new();
    private FlirFrame? _latest;

    public void Update(FlirFrame frame)
    {
        lock (_lock) { _latest = frame; }
    }

    public FlirFrame? GetLatest()
    {
        lock (_lock) { return _latest; }
    }

    public void Clear()
    {
        lock (_lock) { _latest = null; }
    }
}
