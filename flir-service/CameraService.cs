// CameraService.cs — FLIR Atlas-Cronos SDK 7.7.0
//
// KEY FIXES in this version:
//
//  Discovery Fix (v3):
//    Three-stage discovery strategy:
//      1. Direct IP via ThermalCameraScanner.Resolve() at 192.168.16.1 (Wi-Fi AP)
//         — This is the correct SDK pattern from the sample app's ShowStaticIpDialog().
//         — Broadcast/multicast discovery fails on the FLIR AP subnet, so we resolve by IP directly.
//      2. Broadcast scan on Interface.Default | Interface.Network | Interface.Emulator
//         — Covers USB (UVC) and any Ethernet-connected camera on a routed network.
//      3. If nothing found, logs a detailed error with next steps.
//
//  GPS Fix:
//    GPS data is always forwarded even when geo.IsValid == false.
//    The T1020's built-in GPS needs an outdoor satellite fix to set IsValid=true.
//    When connected via USB indoors, IsValid is always false.
//    A new 'gpsIsValid' field is included so callers know if it's a real fix.
//    The frontend falls back to browser GPS when gpsIsValid is false.
//
//  Reconnect-Stability Fix (v4) — NEW:
//    Symptom: after the camera silently drops mid-session
//    ("Camera connection status: Connecting" followed by
//     "Camera device error: timed out"), the live feed freezes on the
//    last frame and a subsequent /api/connect fails with SEHException
//    from FLIR_COMMUNICATIONS.Scanner.Resolve on BOTH Strategy 1 and
//    Strategy 2.
//
//    Root cause: the dropped ThermalCamera instance (_camera) was never
//    disposed. Its native FLIR SDK session/socket stayed bound to
//    192.168.16.1, so the native discovery layer threw SEHException on
//    every subsequent Resolve() call — even from a brand-new
//    ThermalCamera object.
//
//    Fix:
//      1. OnDeviceError now proactively calls Disconnect() (off the SDK
//         callback thread, via Task.Run) the moment a device error is
//         reported. This releases the native handles immediately and
//         clears the frame store, so the frontend stops showing a stale
//         frozen frame and /api/status correctly reports connected=false.
//      2. ConnectAsync now defensively cleans up any stale _camera
//         object (one that exists but is no longer IsConnected) before
//         starting a new discovery, and waits briefly afterwards to let
//         the native SDK fully release the socket before re-resolving.
//
//  Tag Fix (v5):
//    CameraDeviceInfo does not expose a Tag property in the FLIR Atlas SDK.
//    Connection-type labelling ("Wi-Fi (AP)", "USB", "Ethernet") is now stored
//    in the private field _discoveredTag instead of info.Tag.

using System.Drawing;
using SysImaging = System.Drawing.Imaging;
using Flir.Atlas.Image;
using Flir.Atlas.Live;
using Flir.Atlas.Live.Device;
using Flir.Atlas.Live.Discovery;
using Flir.Atlas.Live.Security;

namespace FlirBridge;

public sealed class CameraService : IDisposable
{
    private readonly FrameStore _store;
    private readonly ILogger<CameraService> _logger;

    private ThermalCamera? _camera;
    private CameraDeviceInfo? _deviceInfo;
    private long _frameCounter;
    private double[]? _tempBuffer;
    private bool _disposed;

    // Stores the connection-type label set during discovery
    // ("Wi-Fi (AP)" | "USB" | "Ethernet").
    // CameraDeviceInfo has no Tag property in the FLIR Atlas SDK, so we
    // carry this string ourselves instead of piggy-backing on info.Tag.
    private volatile string _discoveredTag = "";

    // Guards against overlapping ConnectAsync / Disconnect calls
    // (e.g. user clicks Connect while a stale-handle cleanup is in flight,
    // or OnDeviceError fires Disconnect() while ConnectAsync is running).
    private readonly SemaphoreSlim _lifecycleLock = new(1, 1);

    public bool   IsConnected => _camera?.IsConnected ?? false;
    public string CameraName     { get; private set; } = "Not connected";
    public string ConnectionType { get; private set; } = "";   // "Wi-Fi (AP)" | "USB" | "Ethernet"
    public string LastError      { get; private set; } = string.Empty;
    public long   FrameCount     => Interlocked.Read(ref _frameCounter);

    // The FLIR T1020 Wi-Fi AP always assigns itself 192.168.16.1
    private const string FlirWifiApIp = "192.168.16.1";

    public CameraService(FrameStore store, ILogger<CameraService> logger)
    {
        _store  = store;
        _logger = logger;
    }

    // ── Connect ──────────────────────────────────────────────────────────────
    public async Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        if (IsConnected) return true;

        await _lifecycleLock.WaitAsync(ct);
        try
        {
            if (IsConnected) return true;

            // ── Stale-handle cleanup ────────────────────────────────────────
            // If a previous camera object exists but is no longer connected
            // (e.g. it dropped mid-session with a "timed out" DeviceError),
            // its native FLIR SDK session/socket may still be bound to
            // 192.168.16.1. We MUST dispose it cleanly before attempting a
            // new discovery, otherwise ThermalCameraScanner.Resolve() throws
            // SEHException on every retry — even from a brand new
            // ThermalCamera instance.
            if (_camera != null)
            {
                _logger.LogInformation(
                    "Stale camera handle detected (not connected) — " +
                    "cleaning up before reconnecting...");
                DisconnectInternal();
                // Give the native SDK time to fully release the socket/handle.
                // 4s is needed when a "Failed to connect" DeviceError left a
                // partially-initialized native session bound to 192.168.16.1.
                await Task.Delay(8000, ct);  // 8s: native socket needs longer after "Failed to connect"
            }

            try
            {
                _logger.LogInformation(
                    "Attempting FLIR T1020 connection. " +
                    "Strategy: (1) Direct Wi-Fi IP {Ip}, (2) USB/Network broadcast scan.",
                    FlirWifiApIp);

                _deviceInfo = await DiscoverCameraAsync(ct);

                if (_deviceInfo == null)
                {
                    LastError =
                        "No FLIR camera found after all discovery methods. " +
                        "Wi-Fi: ensure PC is connected to FLIR AP and camera IP 192.168.16.1 is reachable. " +
                        "USB: ensure camera is powered on and Atlas SDK USB drivers are installed.";
                    _logger.LogWarning(LastError);
                    return false;
                }

                _logger.LogInformation("Found camera: {Name}", _deviceInfo.Name);

                _camera = new ThermalCamera();
                _camera.DeviceError             += OnDeviceError;
                _camera.ConnectionStatusChanged += OnConnectionStatusChanged;
                _camera.ImageReceived           += OnImageReceived;
                _camera.ImageInitialized        += OnImageInitialized;

                // Detect USB from DeviceIdentifier path (UVC devices have a "usb#" path)
                bool isUsb = _deviceInfo.DeviceIdentifier != null &&
                    _deviceInfo.DeviceIdentifier.Contains("usb", StringComparison.OrdinalIgnoreCase);

                if (!isUsb && _deviceInfo.StreamingFormats != null &&
                    _deviceInfo.StreamingFormats.Count > 0)
                {
                    // Wi-Fi / Ethernet only — set the streaming format.
                    // For USB/UVC the SDK auto-negotiates; setting this silently
                    // breaks the USB handshake.
                    var formats   = _deviceInfo.StreamingFormats;
                    var preferred = formats.Contains(ImageFormat.FlirFileFormat)
                        ? ImageFormat.FlirFileFormat
                        : formats[0];
                    _deviceInfo.SelectedStreamingFormat = preferred;
                    _logger.LogInformation("Selected streaming format: {Format}", preferred);
                }
                else if (isUsb)
                {
                    _logger.LogInformation(
                        "USB connection — NOT setting SelectedStreamingFormat (SDK auto-negotiates).");
                }

                _camera.Connect(_deviceInfo, new SecurityParameters());

                // USB ONLY: call StartGrabbing() after Connect() to start the
                // frame pipeline.  Wi-Fi/Ethernet cameras stream automatically
                // after Connect() — calling StartGrabbing() on Wi-Fi BEFORE
                // IsConnected=true causes "Failed to connect" DeviceError loops.
                if (isUsb)
                {
                    try
                    {
                        _camera.StartGrabbing();
                        _logger.LogInformation("StartGrabbing() OK (USB).");
                    }
                    catch (Exception sgEx)
                    {
                        _logger.LogWarning("StartGrabbing() non-fatal: {Msg}", sgEx.Message);
                    }
                }

                // Poll until connected OR first frame arrives (USB sends frames
                // before IsConnected becomes true on some SDK versions).
                var deadline = DateTime.UtcNow.AddSeconds(30);
                while (!IsConnected && _frameCounter == 0 && DateTime.UtcNow < deadline)
                    await Task.Delay(200, ct);

                if (!IsConnected && _frameCounter == 0)
                {
                    LastError = "Connection timed out after 30 seconds.";
                    _logger.LogWarning(LastError);
                    // Clean up so the NEXT /api/connect doesn't get the
                    // poisoned-session Approved+null-info bug.
                    DisconnectInternal();
                    // Extra delay after a failed Wi-Fi connect — the native
                    // FLIR_COMMUNICATIONS layer needs ~8s to fully release
                    // the socket before Resolve() can succeed again.
                    if (!isUsb)
                    {
                        _logger.LogInformation(
                            "Waiting 8s for native Wi-Fi socket to release after failed connect...");
                        await Task.Delay(8000, ct);
                    }
                    return false;
                }

                CameraName     = _deviceInfo.Name ?? "FLIR T1020";
                ConnectionType = _discoveredTag;
                _frameCounter  = 0;
                _logger.LogInformation("Connected to {Name}", CameraName);
                return true;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                _logger.LogError(ex, "Connect failed");
                // Ensure a failed Connect() doesn't leave a half-wired _camera
                // around to poison the next attempt.
                DisconnectInternal();
                return false;
            }
        }
        finally
        {
            _lifecycleLock.Release();
        }
    }

    // ── Disconnect (public — used by /api/disconnect and external callers) ──
    public void Disconnect()
    {
        _lifecycleLock.Wait();
        try
        {
            DisconnectInternal();
        }
        finally
        {
            _lifecycleLock.Release();
        }
    }

    // ── Disconnect (internal — assumes _lifecycleLock is already held) ───────
    private void DisconnectInternal()
    {
        if (_camera == null) return;
        try
        {
            _camera.ImageReceived           -= OnImageReceived;
            _camera.ImageInitialized        -= OnImageInitialized;
            _camera.DeviceError             -= OnDeviceError;
            _camera.ConnectionStatusChanged -= OnConnectionStatusChanged;
            _camera.StopGrabbing();
            _camera.Disconnect();
            _camera.Dispose();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Disconnect error (non-fatal)");
        }
        finally
        {
            _camera        = null;
            _deviceInfo    = null;
            _tempBuffer    = null;
            _discoveredTag = "";
            _store.Clear();
            CameraName     = "Not connected";
            ConnectionType = "";
            _logger.LogInformation("Camera disconnected.");
        }
    }

    // ── Camera discovery — three strategies ──────────────────────────────────
    //
    // Strategy 1: Direct IP resolve (Wi-Fi AP at 192.168.16.1)
    //   Identical to the SDK sample's ShowStaticIpDialog():
    //     var di = new DeviceIdentifier { Source = ip, Interface = Interface.Network };
    //     ThermalCameraScanner.Resolve(di, securityParams, out CameraDeviceInfo info);
    //   This bypasses multicast discovery which fails on the camera's own AP subnet.
    //
    // Strategy 2: Broadcast scan on Default | Network
    //   Covers USB (UVC via Interface.Default) and Ethernet/routed Wi-Fi.
    //
    private async Task<CameraDeviceInfo?> DiscoverCameraAsync(CancellationToken ct)
    {
        // ── Strategy 1: Direct IP resolve (Wi-Fi AP) ─────────────────────────
        // Try TWICE — the first attempt may throw SEHException if the native
        // FLIR_COMMUNICATIONS layer has a stale socket from a previous failed
        // attempt. A 3s delay lets the native layer fully release, after which
        // a second attempt at the fixed IP succeeds reliably.
        for (int attempt = 1; attempt <= 2; attempt++)
        {
            _logger.LogInformation(
                "Strategy 1 (attempt {A}/2): Direct IP resolve at {Ip} (Interface.Network)...",
                attempt, FlirWifiApIp);
            try
            {
                var di = new DeviceIdentifier
                {
                    Source    = FlirWifiApIp,
                    Interface = Interface.Network,
                };

                var status = ThermalCameraScanner.Resolve(
                    di,
                    new SecurityParameters(),
                    out CameraDeviceInfo? info);

                if (status == AuthenticationStatus.Approved && info != null)
                {
                    _logger.LogInformation(
                        "Strategy 1 SUCCESS: Found {Name} via direct IP {Ip}.",
                        info.Name, FlirWifiApIp);
                    _discoveredTag = "Wi-Fi (AP)";
                    return info;
                }

                _logger.LogWarning(
                    "Strategy 1 attempt {A}: Resolve returned status={Status}, info={Info}.",
                    attempt, status, info == null ? "null" : "non-null");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Strategy 1 attempt {A} exception (non-fatal). " +
                    (attempt < 2 ? "Waiting 3s for native socket to release, then retrying..." : "Falling through to broadcast scan."),
                    attempt);

                if (attempt < 2)
                {
                    // Wait for the native FLIR_COMMUNICATIONS layer to release the
                    // stale socket from the previous failed attempt before retrying.
                    await Task.Delay(3000, ct);
                    continue;
                }
            }

            // If first attempt failed without exception (wrong status), don't retry
            if (attempt == 1)
            {
                _logger.LogInformation(
                    "Strategy 1 returned non-Approved status — skipping retry, going to broadcast scan.");
                break;
            }
        }

        // ── Strategy 2: Broadcast scan — USB + Network ───────────────────────
        _logger.LogInformation(
            "Strategy 2: Broadcast scan on Interface.Default (USB) | Interface.Network...");

        var tcs        = new TaskCompletionSource<CameraDeviceInfo?>();
        var usbScanner = new ThermalCameraScanner();
        var netScanner = new ThermalCameraScanner();

        void OnFound(object? sender, CameraDiscoveredEventArgs e)
        {
            if (tcs.Task.IsCompleted) return;
            // KEY FIX: Run Resolve() on a thread-pool thread, NOT the scanner's
            // native event thread.  Calling Resolve() synchronously inside
            // DeviceFound blocks the scanner's internal dispatch thread.
            // When tcs.Task completes and Stop() is called immediately after,
            // the SDK tries to join that blocked thread → deadlock → result lost.
            var deviceSnap = e.Device;
            _ = Task.Run(() =>
            {
                if (tcs.Task.IsCompleted) return;
                try
                {
                    var status = ThermalCameraScanner.Resolve(
                        deviceSnap,
                        new SecurityParameters(),
                        out CameraDeviceInfo? info);

                    if (status == AuthenticationStatus.Approved && info != null)
                    {
                        _logger.LogInformation(
                            "Strategy 2 found: {Name} on {Interface}",
                            deviceSnap.Name, deviceSnap.Interface);
                        _discoveredTag = deviceSnap.Interface == Interface.Default ? "USB" : "Ethernet";
                        tcs.TrySetResult(info);
                    }
                    else
                    {
                        // status=Approved but info=null means the native SDK session
                        // is poisoned from a previous failed Connect().  Log clearly.
                        _logger.LogWarning(
                            "Strategy 2: Resolve for {Name} returned status={Status}, info={InfoNull}. " +
                            "Native SDK session may be poisoned — will retry next connect attempt.",
                            deviceSnap.Name, status, info == null ? "null" : "non-null");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Strategy 2: Resolve exception for discovered device");
                }
            });
        }

        usbScanner.DeviceFound += OnFound;
        netScanner.DeviceFound += OnFound;

        usbScanner.Start(Interface.Default);
        netScanner.Start(Interface.Network);

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        ct.Register(           () => tcs.TrySetResult(null));
        timeout.Token.Register(() => tcs.TrySetResult(null));

        var result = await tcs.Task;

        // Give the Task.Run Resolve() thread a moment to fully complete
        // before we tear down the scanners.
        await Task.Delay(250);

        try { usbScanner.Stop(); usbScanner.Dispose(); } catch { }
        try { netScanner.Stop(); netScanner.Dispose(); } catch { }

        if (result != null)
            _logger.LogInformation("Strategy 2 SUCCESS: Found {Name}", result.Name);
        else
            _logger.LogWarning("Strategy 2 timed out. No camera found on USB or Network broadcast.");

        return result;
    }

    // ── ImageInitialized — fires once, allocate temp buffer ──────────────────
    private void OnImageInitialized(object? sender, EventArgs e)
    {
        if (_camera == null) return;
        try
        {
            var img = _camera.GetImage();
            img.EnterLock();
            int w = img.Width;
            int h = img.Height;
            img.ExitLock();
            _tempBuffer = new double[w * h];
            _logger.LogInformation(
                "Frame size: {W}x{H}. Temperature buffer allocated.", w, h);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OnImageInitialized error (non-fatal)");
        }
    }

    // ── ImageReceived — fires at ~30 fps ─────────────────────────────────────
    private void OnImageReceived(object? sender, EventArgs e)
    {
        if (_camera == null) return;
        try
        {
            var imageBase = _camera.GetImage();
            if (imageBase == null) return;

            if (imageBase is not ThermalImage thermalImage)
            {
                _logger.LogWarning("Frame is not ThermalImage (unexpected format).");
                return;
            }

            thermalImage.EnterLock();

            byte[]  jpegBytes  = Array.Empty<byte>();
            double  tempMin    = 0, tempMax = 0, tempAvg = 0;
            double? latitude   = null, longitude = null, heading = null;
            bool    gpsIsValid = false;

            try
            {
                int w = thermalImage.Width;
                int h = thermalImage.Height;

                // 1. Temperature: full-frame min/max/avg + per-pixel buffer.
                //    Computed FIRST because the hardcoded Iron-palette
                //    renderer below maps each pixel's temperature to a
                //    colour using tempMin/tempMax for normalization.
                if (_tempBuffer == null || _tempBuffer.Length < w * h)
                    _tempBuffer = new double[w * h];

                var rect = new Rectangle(0, 0, w, h);
                thermalImage.GetValues(rect, ref _tempBuffer);

                double sum = 0, min = double.MaxValue, max = double.MinValue;
                int    count = w * h;
                for (int i = 0; i < count; i++)
                {
                    double v = _tempBuffer[i];
                    if (v < min) min = v;
                    if (v > max) max = v;
                    sum += v;
                }
                tempMin = Math.Round(min, 2);
                tempMax = Math.Round(max, 2);
                tempAvg = Math.Round(sum / count, 2);

                // 2. Render the frame using a HARDCODED Iron palette LUT.
                //    This bypasses thermalImage.Image / thermalImage.Palette
                //    entirely (which were inconsistent over Wi-Fi vs USB and
                //    didn't reliably reflect the camera's on-board palette).
                //    Every pixel's raw temperature is normalized against
                //    [min,max] of THIS frame and mapped through IronLut —
                //    guaranteed Iron colouring on every connection type.
                using var bmp     = RenderIronBitmap(_tempBuffer, w, h, min, max);
                using var ms      = new MemoryStream();
                var jpegCodec      = GetJpegEncoder();
                var encParams      = new SysImaging.EncoderParameters(1);
                encParams.Param[0] = new SysImaging.EncoderParameter(
                    SysImaging.Encoder.Quality, 85L);
                bmp.Save(ms, jpegCodec, encParams);
                jpegBytes = ms.ToArray();

                // 3. GPS — read raw values regardless of IsValid.
                // 3. GPS — read from thermalImage.GpsInformation (FLIR T1020 hardware)
                var geo = thermalImage.GpsInformation;
                if (geo != null)
                {
                    double rawLat = geo.Latitude;
                    double rawLon = geo.Longitude;
                    gpsIsValid = geo.IsValid;

                    // Forward coordinates if non-zero (0,0 = no satellite fix)
                    if (Math.Abs(rawLat) > 0.0001 || Math.Abs(rawLon) > 0.0001)
                    {
                        latitude  = Math.Round(rawLat, 6);
                        longitude = Math.Round(rawLon, 6);
                    }
                }

                // ── Console logging (throttled) ──────────────────────────────────────
                // Temperature: every 30 frames (~10s at 3fps) — enough to confirm values are real
                // GPS: every 30 frames alongside temp
                // This prevents the terminal flooding when the bridge keeps running
                // after frontend detection is stopped.
                long nextFrame = _frameCounter + 1;

                if (nextFrame % 30 == 1)
                {
                    Console.WriteLine(
                        $"[FLIR #{nextFrame,4}] Temp: min={tempMin,6:F1}°C  avg={tempAvg,6:F1}°C  max={tempMax,6:F1}°C  | {w}x{h}");

                    if (geo == null)
                    {
                        Console.WriteLine(
                            $"[FLIR GPS #{nextFrame}] GpsInformation=NULL — " +
                            "T1020 not sending GPS. Check: camera menu → Settings → GPS → Enable");
                    }
                    else if (latitude.HasValue && longitude.HasValue)
                    {
                        Console.WriteLine(
                            $"[FLIR GPS #{nextFrame}] lat={latitude:F6}  lon={longitude:F6}  " +
                            $"IsValid={gpsIsValid}  heading={heading?.ToString("F0") ?? "null"}°  " +
                            (gpsIsValid ? "← SATELLITE FIX ✓" : "← no fix yet (go outdoors)"));
                    }
                    else
                    {
                        Console.WriteLine(
                            $"[FLIR GPS #{nextFrame}] IsValid={gpsIsValid}  " +
                            $"rawLat={(geo?.Latitude ?? 0):F6}  rawLon={(geo?.Longitude ?? 0):F6}  " +
                            "(coords = 0,0 — filtered out, no satellite fix)");
                    }
                }

                // 4. Compass heading
                var compass = thermalImage.CompassInformation;
                if (compass != null)
                {
                    heading = (double)compass.Degrees;
                }
            }
            finally
            {
                thermalImage.ExitLock();
            }

            long frameNum = Interlocked.Increment(ref _frameCounter);

            _store.Update(new FlirFrame
            {
                JpegBytes   = jpegBytes,
                Latitude    = latitude,
                Longitude   = longitude,
                GpsIsValid  = gpsIsValid,
                Heading     = heading,
                TempMin     = tempMin,
                TempMax     = tempMax,
                TempAvg     = tempAvg,
                CapturedAt  = DateTime.UtcNow,
                FrameNumber = frameNum,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OnImageReceived error");
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────────
    private void OnConnectionStatusChanged(object? sender, ConnectionStatusChangedEventArgs e)
    {
        _logger.LogInformation("Camera connection status: {Status}", e.Status);

        var statusText = e.Status.ToString();

        // Only treat as a dropped connection if:
        // 1. We were previously fully connected (CameraName is set, frames received)
        // 2. The new status is a terminal error/disconnect state — NOT "Connecting"
        //    or "Disconnecting" which fire during normal connect/disconnect flows.
        var isLostState = statusText.Equals("Disconnected",  StringComparison.OrdinalIgnoreCase)
                       || statusText.Equals("ConnectionLost", StringComparison.OrdinalIgnoreCase)
                       || statusText.Equals("Error",          StringComparison.OrdinalIgnoreCase)
                       || statusText.Equals("Failed",         StringComparison.OrdinalIgnoreCase);

        bool wasLive = _camera != null
                    && CameraName != "Not connected"
                    && Interlocked.Read(ref _frameCounter) > 0;

        if (wasLive && isLostState)
        {
            _logger.LogWarning(
                "Connection lost (status={Status}) — disconnecting to release native handles.",
                statusText);
            _ = Task.Run(() => Disconnect());
        }
    }

    private void OnDeviceError(object? sender, DeviceErrorEventArgs e)
    {
        LastError = e.ErrorMessage ?? "Unknown device error";
        _logger.LogError("Camera device error: {Error}", LastError);

        // A DeviceError (e.g. "timed out") almost always means the
        // connection has effectively died even if _camera.IsConnected
        // hasn't flipped to false yet. Proactively disconnect off-thread so
        // the native FLIR SDK session is released cleanly. This prevents:
        //   1. The frontend showing a frozen/stuck frame forever
        //      (FrameStore would otherwise keep returning the last frame).
        //   2. The next /api/connect failing with SEHException because the
        //      old session is still bound to 192.168.16.1.
        _ = Task.Run(() => Disconnect());
    }

    // ── Hardcoded Iron palette renderer ──────────────────────────────────────
    //
    // Symptom: thermalImage.Image / thermalImage.Palette rendered grayscale
    // over Wi-Fi (and were inconsistent across SDK/connection types in
    // general). To guarantee Iron colouring on EVERY connection (Wi-Fi or
    // USB), we no longer rely on the SDK's image rendering at all — instead
    // we take the raw per-pixel temperature buffer (already read via
    // thermalImage.GetValues) and map it through a hardcoded 256-entry Iron
    // colour lookup table (LUT), building the Bitmap ourselves.
    //
    // IronLut[i] = (R,G,B) for normalized temperature i/255, modeled on the
    // classic FLIR "Iron" palette: black → purple → red → orange → yellow → white.
    private static readonly (byte R, byte G, byte B)[] IronLut = BuildIronLut();

    private static (byte R, byte G, byte B)[] BuildIronLut()
    {
        // Control points: (position 0..1, R, G, B)
        var stops = new (double pos, byte r, byte g, byte b)[]
        {
            (0.00,   0,   0,   0),
            (0.13,  40,   0,  80),
            (0.25, 110,   0, 160),
            (0.38, 190,  20, 110),
            (0.50, 230,  60,   0),
            (0.64, 255, 140,   0),
            (0.77, 255, 200,  20),
            (0.90, 255, 245, 130),
            (1.00, 255, 255, 255),
        };

        var lut = new (byte R, byte G, byte B)[256];
        for (int i = 0; i < 256; i++)
        {
            double pos = i / 255.0;

            // Find the two stops surrounding 'pos'
            int j = 0;
            while (j < stops.Length - 2 && pos > stops[j + 1].pos) j++;
            var (p0, r0, g0, b0) = stops[j];
            var (p1, r1, g1, b1) = stops[j + 1];

            double t = (p1 > p0) ? (pos - p0) / (p1 - p0) : 0.0;
            t = Math.Clamp(t, 0.0, 1.0);

            byte r = (byte)Math.Round(r0 + (r1 - r0) * t);
            byte g = (byte)Math.Round(g0 + (g1 - g0) * t);
            byte b = (byte)Math.Round(b0 + (b1 - b0) * t);

            lut[i] = (r, g, b);
        }

        return lut;
    }

    /// <summary>
    /// Builds a 24bpp Bitmap from a per-pixel temperature buffer using the
    /// hardcoded Iron LUT. Each pixel is normalized against [tMin,tMax] of
    /// the CURRENT frame and mapped through IronLut — guaranteed Iron
    /// colouring regardless of camera/SDK/connection type.
    /// </summary>
    private static Bitmap RenderIronBitmap(double[] temps, int w, int h, double tMin, double tMax)
    {
        var bmp = new Bitmap(w, h, SysImaging.PixelFormat.Format24bppRgb);

        double range = tMax - tMin;
        bool flat = range < 1e-9; // avoid divide-by-zero on a perfectly uniform frame

        var data = bmp.LockBits(
            new Rectangle(0, 0, w, h),
            SysImaging.ImageLockMode.WriteOnly,
            SysImaging.PixelFormat.Format24bppRgb);

        try
        {
            int stride = data.Stride;
            int rowBytes = w * 3;
            byte[] row = new byte[stride];

            for (int y = 0; y < h; y++)
            {
                int rowOffset = y * w;
                for (int x = 0; x < w; x++)
                {
                    double v = temps[rowOffset + x];
                    int idx = flat
                        ? 128
                        : (int)Math.Round((v - tMin) / range * 255.0);
                    if (idx < 0) idx = 0;
                    if (idx > 255) idx = 255;

                    var (r, g, b) = IronLut[idx];

                    int px = x * 3;
                    // 24bppRgb is stored as BGR in memory
                    row[px + 0] = b;
                    row[px + 1] = g;
                    row[px + 2] = r;
                }

                // Zero any stride padding bytes beyond the pixel data
                for (int p = rowBytes; p < stride; p++) row[p] = 0;

                System.Runtime.InteropServices.Marshal.Copy(
                    row, 0, data.Scan0 + y * stride, stride);
            }
        }
        finally
        {
            bmp.UnlockBits(data);
        }

        return bmp;
    }

    // ── JPEG encoder — cached ─────────────────────────────────────────────────
    private static SysImaging.ImageCodecInfo? _jpegEncoder;
    private static SysImaging.ImageCodecInfo GetJpegEncoder()
    {
        if (_jpegEncoder != null) return _jpegEncoder;
        _jpegEncoder = SysImaging.ImageCodecInfo.GetImageEncoders()
            .First(c => c.FormatID == SysImaging.ImageFormat.Jpeg.Guid);
        return _jpegEncoder;
    }

    // ── IDisposable ───────────────────────────────────────────────────────────
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Disconnect();
        _lifecycleLock.Dispose();
    }
}