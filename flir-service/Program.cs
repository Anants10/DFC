// Program.cs — FLIR Bridge Service
// ASP.NET Core 10 minimal API
// Exposes HTTP endpoints consumed by Flask ML server and Express backend.
//
// Endpoints:
//   GET  /api/status           → camera connection state, frame count, GPS, temp
//   POST /api/connect          → discover and connect to FLIR T1020
//   POST /api/disconnect       → stop grabbing and disconnect
//   GET  /api/frame            → latest frame as JSON {jpeg:base64, lat, lon, ...}
//   GET  /api/frame/raw        → latest frame as raw JPEG bytes (Content-Type: image/jpeg)
//
// Port: 7654 (configured in appsettings.json)
// The service runs on localhost — Flask calls http://localhost:7654/api/frame

// Program.cs — FLIR Bridge Service (port 7654)
using FlirBridge;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<FrameStore>();
builder.Services.AddSingleton<CameraService>();
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5001","http://localhost:5000",
                  "http://127.0.0.1:5001","http://127.0.0.1:5000")
     .AllowAnyMethod().AllowAnyHeader()));
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var app = builder.Build();
app.UseCors();

// ── GET /api/status ───────────────────────────────────────────────────────
app.MapGet("/api/status", (CameraService cam, FrameStore store) =>
{
    var frame = store.GetLatest();
    return Results.Ok(new
    {
        connected      = cam.IsConnected,
        cameraName     = cam.CameraName,
        connectionType = cam.ConnectionType,   // "Wi-Fi (AP)" | "USB" | "Ethernet" | ""
        frameCount     = cam.FrameCount,
        lastError      = cam.LastError,
        hasFrame       = frame != null,
        lastFrame      = frame == null ? null : (object)new
        {
            frameNumber = frame.FrameNumber,
            capturedAt  = frame.CapturedAt.ToString("O"),
            lat         = frame.Latitude,
            lon         = frame.Longitude,
            gpsIsValid  = frame.GpsIsValid,
            heading     = frame.Heading,
            tempMin     = frame.TempMin,
            tempMax     = frame.TempMax,
            tempAvg     = frame.TempAvg,
        }
    });
});

// ── POST /api/connect ─────────────────────────────────────────────────────
app.MapPost("/api/connect", async (CameraService cam) =>
{
    if (cam.IsConnected)
        return Results.Ok(new { success = true, message = "Already connected", camera = cam.CameraName, connectionType = cam.ConnectionType });

    var ok = await cam.ConnectAsync();
    if (ok)
        return Results.Ok(new { success = true, message = "Connected", camera = cam.CameraName, connectionType = cam.ConnectionType });

    return Results.Problem(
        title:      "Connection failed",
        detail:     cam.LastError,
        statusCode: 503);
});

// ── POST /api/disconnect ──────────────────────────────────────────────────
app.MapPost("/api/disconnect", (CameraService cam) =>
{
    cam.Disconnect();
    return Results.Ok(new { success = true, message = "Disconnected" });
});

// ── GET /api/frame  (JSON — consumed by Flask /flir/predict_frame) ────────
app.MapGet("/api/frame", (FrameStore store) =>
{
    var frame = store.GetLatest();
    if (frame == null)
        return Results.Problem(
            title:      "No frame available",
            detail:     "Camera not connected or no frame received yet.",
            statusCode: 503);

    return Results.Ok(new
    {
        jpeg        = Convert.ToBase64String(frame.JpegBytes),
        lat         = frame.Latitude,
        lon         = frame.Longitude,
        gpsIsValid  = frame.GpsIsValid,   // true = real satellite fix, false = no fix (fallback to browser GPS)
        heading     = frame.Heading,
        tempMin     = frame.TempMin,
        tempMax     = frame.TempMax,
        tempAvg     = frame.TempAvg,
        frameNumber = frame.FrameNumber,
        capturedAt  = frame.CapturedAt.ToString("O"),
    });
});

// ── GET /api/frame/raw  (binary JPEG for debugging) ───────────────────────
app.MapGet("/api/frame/raw", (FrameStore store) =>
{
    var frame = store.GetLatest();
    if (frame == null)
        return Results.Problem(
            title:      "No frame available",
            detail:     "Camera not connected or no frame received yet.",
            statusCode: 503);
    return Results.Bytes(frame.JpegBytes, contentType: "image/jpeg");
});

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("FLIR Bridge starting on port 7654");
logger.LogInformation("Scanning both USB (Interface.Default) and Wi-Fi (Interface.Network)");

app.Run("http://localhost:7654");