/**
 * HelpModal.jsx
 *
 * Full-featured help centre modal for the DFCCIL Crack Detection System.
 *
 * STRUCTURE:
 *   - Left sidebar: list of all features with ℹ button per feature
 *   - Right panel: overview OR detailed step-by-step guide for selected feature
 *   - Each feature has: icon, title, description, steps[], tips[]
 *
 * HOW TO OPEN:
 *   Navbar → "?" button opens overview
 *   Each feature's ℹ button opens that feature's guide directly
 */
import React, { useState, useEffect } from 'react';

// ── All feature help content ──────────────────────────────────────────────────
const FEATURES = [
  {
    key: 'overview',
    icon: '🏠',
    title: 'System Overview',
    color: '#003087',
    short: 'What this system does and how to get started.',
    description:
      'The DFCCIL Railway Track Crack Detection System uses deep learning (VGG16 / EfficientNet) to detect cracks in railway tracks from Infrared (IR) thermography images and video footage. It provides real-time detection, GPS-tagged reports, and email notifications.',
    steps: [
      {
        n: 1,
        title: 'Start all three servers',
        detail: 'Run MongoDB, then Flask ML (py -3.10 run.py), then Express (node src/server.js), then React (npm run dev). All four status pills in the header must show green.',
      },
      {
        n: 2,
        title: 'Load a detection model',
        detail: 'Go to Model Manager tab. Upload a .keras or .h5 model file, select it, and click "Load Selected Model". The header pill changes to show the model name in green.',
      },
      {
        n: 3,
        title: 'Run a detection',
        detail: 'Use Image Analysis for a single IR photo, Video / Camera for video files or live camera feed. Results appear instantly with confidence scores.',
      },
      {
        n: 4,
        title: 'Download or email the report',
        detail: 'After every detection, click "Download PDF" for an instant report, or "Email Report" to send it to one or more recipients.',
      },
      {
        n: 5,
        title: 'Review all past detections',
        detail: 'The Detection Log tab shows every inspection event with timestamps, GPS, confidence scores. Filter, export to CSV, or delete records.',
      },
    ],
    tips: [
      'Allow location permission in the browser for real GPS coordinates on reports.',
      'Use best_model.keras (33 MB) for fastest inference; VGG16_E15_best.keras (116 MB) for highest accuracy.',
      'The system works without internet — all processing is local.',
    ],
  },
  {
    key: 'model',
    icon: '🧠',
    title: 'Model Manager',
    color: '#003087',
    short: 'Upload, load, and configure Keras AI models.',
    description:
      'The Model Manager lets you upload .keras or .h5 deep learning model files to the Flask ML server, load them into GPU/CPU memory for inference, and configure the prediction direction (sigmoid inversion / crack index) per model.',
    steps: [
      {
        n: 1,
        title: 'Upload a model file',
        detail: 'Click the upload area (or drag and drop) and select a .keras or .h5 model file. Files up to 1 GB are supported. The server validates the format and rejects corrupt files automatically.',
      },
      {
        n: 2,
        title: 'Select and load the model',
        detail: 'After uploading, the model appears in the list. Click it to select it (highlighted in blue), then click the "Load Selected Model" button. Loading a 116 MB model takes about 10–30 seconds.',
      },
      {
        n: 3,
        title: 'Verify the header status',
        detail: 'The top header shows "Model: [filename]" in a green pill once the model is in memory. All detection pages will now be active.',
      },
      {
        n: 4,
        title: 'Configure Prediction Direction (if needed)',
        detail: 'After loading, a "Prediction Direction" card appears. For sigmoid models: if cracks show as NORMAL, click "Toggle" to enable Inversion. For softmax models: choose Index 0 or Index 1 based on which is P(crack). This setting is saved permanently.',
      },
      {
        n: 5,
        title: 'Unload when done',
        detail: 'Click "Unload Model" to free GPU/CPU memory. Models remain on disk and can be reloaded anytime.',
      },
    ],
    tips: [
      'Uploaded models are stored permanently — you never need to re-upload after a server restart.',
      'Only one model can be loaded at a time. Unload the current model before loading a different one.',
      'The ℹ button in Model Manager shows a quick usage guide.',
    ],
  },
  {
    key: 'image',
    icon: '🖼',
    title: 'Image Analysis',
    color: '#1A7A3F',
    short: 'Upload an IR image or capture a live frame from FLIR T1020 for instant crack detection.',
    description:
      'Image Analysis supports two sources: (1) Upload a single IR thermography image file, or (2) Connect to the FLIR T1020 thermal camera and capture a live frame. Both paths run the same crack detection ML model and produce a downloadable PDF report.',
    steps: [
      {
        n: 1,
        title: 'Load a model first',
        detail: 'Go to Model Manager and ensure a model is loaded. The header must show a green model pill. Image Analysis is disabled until a model is active.',
      },
      {
        n: 2,
        title: 'Choose your image source',
        detail: 'Two tabs appear at the top: "🖼 Upload Image" (for any saved IR image file) and "🌡 FLIR T1020" (for a live thermal camera frame). Click the tab for the source you want.',
      },
      {
        n: 3,
        title: 'Upload tab: select an image',
        detail: 'Click the dashed upload area or drag and drop your IR thermography image (.jpg, .png, .jpeg). A preview appears immediately. Supported formats: JPG, PNG, JPEG.',
      },
      {
        n: 4,
        title: 'FLIR T1020 tab: start the bridge',
        detail: 'Before connecting, start the FLIR bridge service in a separate terminal: cd flir-service && dotnet run. The status pill changes from "Bridge offline" to "Not connected" when the bridge is running.',
      },
      {
        n: 5,
        title: 'FLIR T1020 tab: connect the camera',
        detail: 'Click "🔌 Connect to FLIR T1020". The bridge discovers the camera via Wi-Fi AP (192.168.16.1), USB, or Ethernet. The status pill turns green with the camera name and connection type (e.g. "FLIR T1020 · Wi-Fi (AP)").',
      },
      {
        n: 6,
        title: 'FLIR T1020 tab: watch the live feed',
        detail: 'Once connected, a live thermal video stream appears at ~3fps using the Iron palette. You can see what the camera is capturing in real-time — min/avg temperature and GPS coordinates (with source label) are shown below the stream.',
      },
      {
        n: 7,
        title: 'FLIR T1020 tab: capture a frame',
        detail: 'Click "📸 Capture Frame for Analysis" to freeze the current thermal frame for crack detection. Alternatively, pressing the physical shutter button on the FLIR T1020 triggers a popup asking "Do you want to load this image for crack detection?" — click Yes to load it automatically.',
      },
      {
        n: 8,
        title: 'Run Prediction',
        detail: 'Click "▶ Run Prediction". For uploaded images, a pre-run prompt asks about email preferences. The image is sent to the Flask ML server. Results appear in 1–5 seconds.',
      },
      {
        n: 9,
        title: 'Read the results',
        detail: 'A verdict banner shows CRACK DETECTED (red) or NORMAL (green). Gauges show P(crack)% and P(normal)%. For FLIR captures, thermal metadata (min/avg/max temperature) and GPS coordinates with source label (satellite or FLIR camera · USB/Wi-Fi) are shown in the details table.',
      },
      {
        n: 10,
        title: 'Download PDF or Email Report',
        detail: 'Click "🖨 Download PDF" for a 2-page institutional report including thermal metadata and GPS. Click "📧 Email Report" to send the full PDF to one or more recipients.',
      },
    ],
    tips: [
      'For best results, use thermal images at the same resolution as the model training data.',
      'GPS source is always labelled: "(GPS satellite)" for outdoor satellite fix, or "(FLIR camera · USB/Wi-Fi)" for camera-embedded coordinates.',
      'Temperature (Min/Avg/Max) is shown only for FLIR T1020 captures — not for uploaded images or laptop webcam.',
      'The physical camera shutter on the FLIR T1020 is detected automatically — a popup appears asking to load the captured photo.',
      'The bridge service (flir-service) must be running before clicking Connect. Start it with: cd flir-service && dotnet run',
    ],
  },
  {
    key: 'video',
    icon: '🎥',
    title: 'Video Analysis',
    color: '#7B2D8B',
    short: 'Analyse a full video file frame by frame for crack detection.',
    description:
      'Upload any video file (MP4, AVI, MPG, MKV, WMV, MOV) for automatic crack detection across all frames. Native formats play in the browser during analysis. Non-native formats (MPG, AVI) are converted to MP4 via FFmpeg for preview while OpenCV analyses the original.',
    steps: [
      {
        n: 1,
        title: 'Load a model first',
        detail: 'Go to Model Manager and ensure a model is loaded. The Video / Camera tab is disabled until a model is active.',
      },
      {
        n: 2,
        title: 'Select "Upload Video" tab',
        detail: 'Click the "Upload Video" tab at the top of the Video / Camera page.',
      },
      {
        n: 3,
        title: 'Upload the video file',
        detail: 'Click the upload area and select your video file. A badge shows whether the file will use "Browser-native playback" (MP4/MOV) or "Server-side: FFmpeg + OpenCV" (MPG/AVI/MKV). Any format is accepted.',
      },
      {
        n: 4,
        title: 'Click "Play & Detect" or "Convert & Analyse"',
        detail: 'For native formats: the video plays live in the browser while every 5th frame is sent to Flask for detection. For non-native: FFmpeg converts to MP4 (video plays) while OpenCV analyses the original simultaneously.',
      },
      {
        n: 5,
        title: 'Watch the live overlay',
        detail: 'While the video plays, a top bar shows CRACK DETECTED or NORMAL TRACK. The bottom panel shows P(crack)%, P(normal)%, and GPS. The P(crack) chart below the video updates in real time.',
      },
      {
        n: 6,
        title: 'Crack photos are captured automatically',
        detail: 'When a crack is detected, the current frame (with overlay) is captured as a photo. Maximum 1 photo per 2 seconds. Thumbnails appear in the "Crack Photos" grid below the chart.',
      },
      {
        n: 7,
        title: 'Download PDF or Email report',
        detail: 'After analysis completes, click "PDF Report" for a multi-page report with timeline chart and 4 photos per page (2×2 grid). Click "Email" to send the PDF to multiple recipients.',
      },
    ],
    tips: [
      'MPG and AVI files are supported — the system converts them automatically.',
      'The P(crack) line chart shows the full detection timeline after analysis.',
      'Crack photos are captured even if GPS permission is denied.',
    ],
  },
  {
    key: 'camera',
    icon: '📷',
    title: 'Live Camera Detection',
    color: '#CC1F1F',
    short: 'Use a connected webcam for real-time live crack detection.',
    description:
      'Live Camera mode uses your computer\'s camera (or an external USB webcam like HP w200) for continuous real-time crack detection. Every 5th frame is sent to Flask for inference. GPS is tracked continuously from the browser.',
    steps: [
      {
        n: 1,
        title: 'Load a model first',
        detail: 'Ensure a model is loaded in Model Manager. Then go to Video / Camera tab.',
      },
      {
        n: 2,
        title: 'Select "Live Camera" tab',
        detail: 'Click the "Live Camera" tab at the top of the Video / Camera page.',
      },
      {
        n: 3,
        title: 'Click "Detect Cameras"',
        detail: 'The system asks for camera permission in the browser, then lists all connected video devices. External webcams (HP w200, USB cameras) are automatically preferred over built-in laptop cameras.',
      },
      {
        n: 4,
        title: 'Select a camera (if multiple)',
        detail: 'A dropdown shows all detected cameras with "[Built-in]" or "[External]" labels. Select the camera you want to use.',
      },
      {
        n: 5,
        title: 'Click "Start Detection"',
        detail: 'The camera feed appears live. The overlay shows real-time P(crack)% and P(normal)% on the video. Red top bar means CRACK DETECTED, green means NORMAL.',
      },
      {
        n: 6,
        title: 'Crack photos captured automatically',
        detail: 'When a crack is detected during live feed, the current frame is automatically captured and shown in the Crack Photos grid.',
      },
      {
        n: 7,
        title: 'Click "Stop Detection" to end session',
        detail: 'The camera stops. A summary shows total frames analysed, crack count, and rate. The session is saved to Detection Log. Download or email the report.',
      },
    ],
    tips: [
      'If the HP w200 external webcam is connected, it is selected automatically.',
      'Click "Rescan Cameras" if you plug in a webcam after the page loads.',
      'Allow location permission for GPS-tagged crack photos.',
    ],
  },
  {
    key: 'report',
    icon: '📄',
    title: 'Download PDF Report',
    color: '#B45309',
    short: 'Download an institutional PDF report after any detection.',
    description:
      'After every image analysis or video analysis, a PDF report can be downloaded instantly from the browser — no server call required. Reports include the DFCCIL institutional header, verdict, confidence scores, GPS, and crack photographs.',
    steps: [
      {
        n: 1,
        title: 'Complete a detection first',
        detail: 'Run image analysis or video analysis. The "Download PDF" button appears only after a result is available.',
      },
      {
        n: 2,
        title: 'Click "Download PDF" or "PDF Report"',
        detail: 'The button is in the left sidebar (Video page) or below the result card (Image page). A PDF is generated instantly in the browser using jsPDF — no internet required.',
      },
      {
        n: 3,
        title: 'Image report (2 pages)',
        detail: 'Page 1: Institutional header, verdict banner, P(crack) and P(normal) confidence bars, detection details table, GPS map link. Page 2: The uploaded photograph.',
      },
      {
        n: 4,
        title: 'Video report (3+ pages)',
        detail: 'Page 1: Institutional header, verdict banner, summary statistics (total frames, crack count, rate, elapsed time, model), configuration, P(crack) bar chart timeline. Pages 2+: Crack photos in a 2×2 grid (4 per page), each with event number, P(crack)%, frame number, timestamp, and GPS.',
      },
    ],
    tips: [
      'Reports are generated client-side — they work even without an internet connection.',
      'All reports include the DFCCIL and ECG Lab IIT Roorkee institutional branding.',
      'GPS coordinates show as "—" if location permission is denied.',
    ],
  },
  {
    key: 'email',
    icon: '📧',
    title: 'Email Report',
    color: '#2563EB',
    short: 'Send the crack detection PDF report to one or more email addresses.',
    description:
      'After any detection, the full PDF report can be emailed to any number of recipients using the Email Report feature. The email includes a styled HTML body with verdict, confidence scores, GPS, and the PDF attached.',
    steps: [
      {
        n: 1,
        title: 'Complete a detection first',
        detail: 'Run image analysis or video/camera analysis. The "Email Report" button appears only after a result is available.',
      },
      {
        n: 2,
        title: 'Click "Email Report"',
        detail: 'The Email Report modal opens. It shows a summary of the detection result (verdict, P(crack)%, model, file). The PDF is generated automatically in the background.',
      },
      {
        n: 3,
        title: 'Enter the first recipient email',
        detail: 'Type an email address in the input field. The system validates the format in real time — a red error shows if the format is invalid.',
      },
      {
        n: 4,
        title: 'Add more recipients (optional)',
        detail: 'Click the "+ Add Recipient" button (or press Enter) to add another email field. You can add as many recipients as needed. Each has its own input and × remove button.',
      },
      {
        n: 5,
        title: 'Remove a recipient',
        detail: 'Click the × button on the right side of any email field to remove that recipient. The last field cannot be removed.',
      },
      {
        n: 6,
        title: 'Click "Send Report"',
        detail: 'The system sends the email with the HTML body and PDF attachment via the configured SMTP server (Gmail / Outlook). A success message shows how many recipients received the email.',
      },
      {
        n: 7,
        title: 'Send to more recipients',
        detail: 'After a successful send, click "Send to More" to enter a new list of recipients and send again without closing the modal.',
      },
    ],
    tips: [
      'Email requires EMAIL_USER and EMAIL_PASS to be configured in backend/.env.',
      'For Gmail: create an App Password at myaccount.google.com → Security → App passwords.',
      'The full PDF (with crack photos) is attached automatically.',
      'If "Email not configured" warning appears, contact the system administrator.',
    ],
  },
  {
    key: 'log',
    icon: '📋',
    title: 'Detection Log',
    color: '#4A5568',
    short: 'View, search, filter, and export all past detection events.',
    description:
      'The Detection Log shows every crack detection event stored in MongoDB — from image analysis, video sessions, and live camera sessions. You can search, filter by result or source, export to CSV, and delete individual records.',
    steps: [
      {
        n: 1,
        title: 'Open Detection Log tab',
        detail: 'Click "Detection Log" in the navigation bar. All past detections load automatically from the database.',
      },
      {
        n: 2,
        title: 'Read the summary cards',
        detail: 'Four cards at the top show: Total Events, Cracks detected, Normal results, and overall Crack Rate percentage.',
      },
      {
        n: 3,
        title: 'Search for a specific event',
        detail: 'Type in the search box to filter by Event ID, filename, or model name. Results update instantly without a page reload.',
      },
      {
        n: 4,
        title: 'Filter by result or source',
        detail: 'Use the "All Results" dropdown to show only CRACK or NORMAL events. Use the "All Sources" dropdown to show only image, video, or camera sessions.',
      },
      {
        n: 5,
        title: 'View event details',
        detail: 'Each row shows: Event ID, Timestamp, Source (image/video/camera), File, Model, Confidence bar, Result badge (CRACK/NORMAL), and GPS map link.',
      },
      {
        n: 6,
        title: 'Export to CSV',
        detail: 'Click the "CSV" button to download all currently-filtered events as a CSV file. Columns include: EventID, Timestamp, Source, File, Model, P(Crack)%, P(Normal)%, Status, GPS coordinates, Maps link.',
      },
      {
        n: 7,
        title: 'Delete an event',
        detail: 'Click the "Delete" button on any row. A confirmation prompt appears — click "Yes" to permanently remove the event from the database.',
      },
      {
        n: 8,
        title: 'Clear all events',
        detail: 'Click "Clear All" to permanently delete every event. A confirmation prompt appears before deletion.',
      },
    ],
    tips: [
      'Detection Log updates automatically after every new detection — no page refresh needed.',
      'Use CSV export for data analysis in Excel or other tools.',
      'GPS coordinates link directly to Google Maps.',
    ],
  },
  {
    key: 'dashboard',
    icon: '📊',
    title: 'Dashboard',
    color: '#003087',
    short: 'Real-time overview of all detection activity and statistics.',
    description:
      'The Dashboard provides a live summary of all crack detection activity — KPI cards, a 7-day bar chart, confidence trend line chart, and a recent events table.',
    steps: [
      {
        n: 1,
        title: 'Open the Dashboard tab',
        detail: 'Click "Dashboard" in the navigation bar. Data loads automatically from the database.',
      },
      {
        n: 2,
        title: 'Read the KPI cards',
        detail: 'Six metric cards: Total Inspections, Cracks Detected, Normal Tracks, Crack Rate %, Avg Confidence, Today\'s Events.',
      },
      {
        n: 3,
        title: 'Weekly Activity bar chart',
        detail: 'Stacked bar chart showing the last 7 days. Red bars = crack detections, green bars = normal detections. Hover over bars to see exact counts.',
      },
      {
        n: 4,
        title: 'Confidence trend line chart',
        detail: 'Line chart of the last 20 detection events. Shows how confidence scores have changed over time.',
      },
      {
        n: 5,
        title: 'Recent Events table',
        detail: 'Shows the most recent detection events with source, file, model, confidence, and result. Click "Detection Log" for the full list.',
      },
    ],
    tips: [
      'Dashboard refreshes automatically whenever a new detection is made.',
      'The crack rate card turns red when the overall rate exceeds 30%.',
    ],
  },
];

// ── Step component ────────────────────────────────────────────────────────────
function StepCard({ step }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 0',
      borderBottom: '1px solid var(--border-s)',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: 'var(--navy)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-h)',
      }}>
        {step.n}
      </div>
      <div>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
          {step.title}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {step.detail}
        </p>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function HelpModal({ isOpen, onClose, initialFeature = 'overview' }) {
  const [selected, setSelected] = useState(initialFeature);

  useEffect(() => {
    if (isOpen) setSelected(initialFeature);
  }, [isOpen, initialFeature]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const feature = FEATURES.find(f => f.key === selected) || FEATURES[0];

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 2001,
        transform: 'translate(-50%,-50%)',
        width: '88vw', maxWidth: 940,
        height: '85vh', maxHeight: 680,
        background: 'var(--surface)',
        borderRadius: 'var(--r-md)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modalIn .22s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 22px',
          background: 'var(--navy)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#fff', fontFamily: 'var(--font-h)' }}>
              ❓ Help & User Guide
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,.6)' }}>
              DFCCIL Railway Track Crack Detection System · ECG Lab, IIT Roorkee
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)',
            borderRadius: 6, color: '#fff', cursor: 'pointer',
            fontSize: 18, width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{
            width: 210, flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg)',
            overflowY: 'auto',
            padding: '8px 0',
          }}>
            {FEATURES.map(f => (
              <button key={f.key} onClick={() => setSelected(f.key)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '10px 16px',
                  border: 'none', cursor: 'pointer',
                  background: selected === f.key ? 'rgba(0,48,135,.1)' : 'transparent',
                  borderLeft: `3px solid ${selected === f.key ? f.color : 'transparent'}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'all .15s',
                }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <p style={{
                    margin: 0, fontSize: 12, fontWeight: selected === f.key ? 700 : 600,
                    color: selected === f.key ? f.color : 'var(--text)',
                  }}>{f.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-m)', lineHeight: 1.3 }}>
                    {f.short}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Content panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>

            {/* Feature header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              marginBottom: 18,
              paddingBottom: 16,
              borderBottom: `2px solid ${feature.color}`,
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 12, flexShrink: 0,
                background: feature.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26,
              }}>{feature.icon}</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: feature.color, fontFamily: 'var(--font-h)' }}>
                  {feature.title}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                  {feature.description}
                </p>
              </div>
            </div>

            {/* Step-by-step guide */}
            <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              How to use — Step by step
            </h3>
            <div>
              {feature.steps.map(s => <StepCard key={s.n} step={s} />)}
            </div>

            {/* Tips */}
            {feature.tips?.length > 0 && (
              <div style={{
                marginTop: 20, padding: '14px 18px',
                background: 'rgba(0,48,135,.06)',
                border: '1px solid rgba(0,48,135,.14)',
                borderRadius: 'var(--r-sm)',
              }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>
                  💡 Tips
                </p>
                {feature.tips.map((t, i) => (
                  <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                    • {t}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 22px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-m)' }}>
            Press <kbd style={{ padding: '1px 5px', border: '1px solid var(--border)', borderRadius: 3, fontSize: 10 }}>Esc</kbd> to close
          </p>
          <button onClick={onClose} style={{
            padding: '6px 18px', borderRadius: 'var(--r-sm)',
            background: 'var(--navy)', color: '#fff',
            border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
    </>
  );
}

// ── Inline ℹ button for use beside any feature heading ────────────────────────
export function HelpInfoButton({ featureKey, openHelp, label = '' }) {
  return (
    <button
      onClick={() => openHelp(featureKey)}
      title={`Help: ${label || featureKey}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%',
        background: 'rgba(0,48,135,.12)', border: '1px solid rgba(0,48,135,.25)',
        color: 'var(--navy)', fontSize: 11, fontWeight: 800,
        cursor: 'pointer', flexShrink: 0,
        transition: 'all .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background='var(--navy)'; e.currentTarget.style.color='#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background='rgba(0,48,135,.12)'; e.currentTarget.style.color='var(--navy)'; }}
    >
      ℹ
    </button>
  );
}