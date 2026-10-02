import React, { useState, useRef, useCallback, useEffect } from 'react';
import { jsPDF }  from 'jspdf';
import { useApp } from '../../context/AppContext.jsx';
import EmailModal        from '../../components/ui/EmailModal.jsx';
import PreRunEmailPrompt from '../../components/ui/PreRunEmailPrompt.jsx';
import { HelpInfoButton } from '../../components/ui/HelpModal.jsx';
import { api }    from '../../services/api.js';
import Card       from '../../components/ui/Card.jsx';
import Button     from '../../components/ui/Button.jsx';
import Spinner    from '../../components/ui/Spinner.jsx';

/* ══════════════════════════════════════════════════════════════════
   FLIR T1020 CAPTURE PANEL
   Connects to the flir-service bridge (port 7654, via Flask proxy),
   shows live connection status, lets the user capture a single frame,
   and injects it into the existing image analysis pipeline.
══════════════════════════════════════════════════════════════════ */

/** Pill badge for bridge / camera status */
function FlirStatusPill({ bridgeOnline, connected, cameraName, connectionType }) {
  if (!bridgeOnline) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
        background: 'var(--border-s)', color: 'var(--text-m)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9ca3af', display: 'inline-block' }} />
        Bridge offline
      </span>
    );
  }
  if (!connected) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
        background: 'var(--warn-bg)', color: 'var(--warn)',
        border: '1px solid var(--warn-br)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block' }} />
        Not connected
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: 'var(--success-bg)', color: 'var(--success)',
      border: '1px solid var(--success-br)',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', animation: 'flir-pulse 1.6s ease-in-out infinite' }} />
      {cameraName || 'FLIR T1020'}{connectionType ? ` · ${connectionType}` : ''}
    </span>
  );
}

/**
 * FlirCapturePanel
 * Shows LIVE frames at ~3fps from the FLIR bridge so the user can see
 * what the camera sees. When a frame is captured (button click OR physical
 * camera shutter press), it is injected into the existing analysis pipeline.
 */
function FlirCapturePanel({ onCapture, showToast }) {
  const [status,        setStatus]        = useState({ bridgeOnline: false, connected: false });
  const [connecting,    setConnecting]    = useState(false);
  const [capturing,     setCapturing]     = useState(false);
  const [capturedURL,   setCapturedURL]   = useState(null);
  const [capturedMeta,  setCapturedMeta]  = useState(null);

  // Live stream state
  const [liveFrameURL,  setLiveFrameURL]  = useState(null);
  const [liveFrameMeta, setLiveFrameMeta] = useState(null);
  const [streaming,     setStreaming]     = useState(false);

  // Camera-click popup (physical shutter detection) — 🔴 DISABLED
  // const [camClickPopup, setCamClickPopup] = useState(false);
  // const [pendingFrame,  setPendingFrame]  = useState(null);

  const pollRef      = useRef(null);
  const streamRef    = useRef(null);
  const lastFrameNum = useRef(0);
  const prevLiveURL  = useRef(null);

  /* ── Poll bridge status every 3s ── */
  const pollStatus = useCallback(async () => {
    try {
      const d = await api.flirStatus();
      const connected = d.connected ?? false;
      const hasFrame  = d.hasFrame  ?? false;
      setStatus({
        bridgeOnline:   d.bridgeOnline   ?? false,
        connected,
        cameraName:     d.cameraName     ?? '',
        connectionType: d.connectionType ?? '',
        frameCount:     d.frameCount     ?? 0,
        hasFrame,
      });
      if (connected && hasFrame) setStreaming(true);
      else { setStreaming(false); }
    } catch (_) {
      setStatus({ bridgeOnline: false, connected: false });
      setStreaming(false);
    }
  }, []);

  useEffect(() => {
    pollStatus();
    pollRef.current = setInterval(pollStatus, 3000);
    return () => clearInterval(pollRef.current);
  }, [pollStatus]);

  /* ── Live frame loop (~3fps) ── */
  useEffect(() => {
    if (!streaming) {
      clearInterval(streamRef.current);
      return;
    }
    const fetchFrame = async () => {
      try {
        const d = await api.flirCaptureSnapshot();
        if (!d.ok || !d.jpeg) return;

        // Detect physical camera shutter press: frame number jumped by > 5
        // 🔴 DISABLED: Automatic image loading on shutter press removed
        // const fn = d.frameNumber ?? 0;
        // if (lastFrameNum.current > 0 && fn > lastFrameNum.current + 5) {
        //   // Build popup preview
        //   const dURL = 'data:image/jpeg;base64,' + d.jpeg;
        //   setPendingFrame({ jpeg: d.jpeg, meta: buildMeta(d) });
        //   setCamClickPopup(true);
        // }
        // lastFrameNum.current = fn;

        // Update live preview (revoke old URL to avoid memory leak)
        const blob   = b64ToBlob(d.jpeg);
        const objURL = URL.createObjectURL(blob);
        if (prevLiveURL.current) URL.revokeObjectURL(prevLiveURL.current);
        prevLiveURL.current = objURL;
        setLiveFrameURL(objURL);
        setLiveFrameMeta(buildMeta(d));
      } catch (_) {}
    };
    fetchFrame();
    streamRef.current = setInterval(fetchFrame, 333);   // ~3fps
    return () => {
      clearInterval(streamRef.current);
      if (prevLiveURL.current) URL.revokeObjectURL(prevLiveURL.current);
    };
  }, [streaming]);  // eslint-disable-line

  /* ── Helpers ── */
  const buildMeta = (d) => ({
    frameNumber:    d.frameNumber,    capturedAt:  d.capturedAt,
    tempMin:        d.tempMin,        tempMax:     d.tempMax,    tempAvg: d.tempAvg,
    lat:            d.lat,            lon:         d.lon,
    gpsIsValid:     d.gpsIsValid,     heading:     d.heading,
    connectionType: d.connectionType,
  });

  const b64ToBlob = (b64) => {
    const bs = atob(b64), ab = new ArrayBuffer(bs.length), v = new Uint8Array(ab);
    for (let i = 0; i < bs.length; i++) v[i] = bs.charCodeAt(i);
    return new Blob([ab], { type: 'image/jpeg' });
  };

  const loadFrameForAnalysis = (jpeg, meta) => {
    if (capturedURL) URL.revokeObjectURL(capturedURL);
    const blob   = b64ToBlob(jpeg);
    const objURL = URL.createObjectURL(blob);
    const ts     = new Date().toISOString().replace(/[:.]/g, '-');
    const file   = new File([blob], `flir_snapshot_${ts}.jpg`, { type: 'image/jpeg' });
    setCapturedURL(objURL);
    setCapturedMeta(meta);
    onCapture(file, objURL, meta);
  };

  // GPS label shows coordinate source in brackets
  const gpsLabel = (meta) => {
    if (!meta?.lat || !meta?.lon) return null;
    const src = meta.gpsIsValid
      ? '(GPS satellite)'
      : `(FLIR camera · ${meta.connectionType || 'camera'})`;
    return `${meta.lat.toFixed(6)}, ${meta.lon.toFixed(6)} ${src}`;
  };

  /* ── Connect / disconnect ── */
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const d = await api.flirConnect();
      if (d.ok) { showToast(`✅ Connected to ${d.camera || 'FLIR T1020'}`, 'success', 4000); await pollStatus(); }
      else showToast(`❌ ${d.error || 'Connection failed'}`, 'error', 6000);
    } catch (e) { showToast(`❌ ${e.message}`, 'error'); }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setStreaming(false); clearInterval(streamRef.current);
    try { await api.flirDisconnect(); showToast('Disconnected from FLIR T1020', 'info', 3000); } catch (e) { showToast(`❌ ${e.message}`, 'error'); }
    setCapturedURL(null); setCapturedMeta(null); setLiveFrameURL(null); setLiveFrameMeta(null);
    lastFrameNum.current = 0; await pollStatus();
  };

  /* ── Manual capture ── */
  const handleCapture = async () => {
    if (!status.connected) return;
    setCapturing(true);
    try {
      const d = await api.flirCaptureSnapshot();
      if (!d.ok) throw new Error(d.error || 'Snapshot failed');
      loadFrameForAnalysis(d.jpeg, buildMeta(d));
      showToast('📸 Frame captured — click Run Prediction to analyse', 'success', 4000);
    } catch (e) { showToast(`❌ Capture failed: ${e.message}`, 'error'); }
    setCapturing(false);
  };

  const clearCapture = () => {
    if (capturedURL) URL.revokeObjectURL(capturedURL);
    setCapturedURL(null); setCapturedMeta(null);
  };

  const { bridgeOnline, connected, cameraName, connectionType, frameCount, hasFrame } = status;

  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)', overflow: 'hidden' }}>

      {/* Camera-click popup — physical shutter press detected */}
      {/* 🔴 DISABLED: Automatic image loading popup on shutter press removed */}
      {/* {camClickPopup && pendingFrame && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-md)', padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,.35)' }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>📷 Photo captured on FLIR T1020</p>
            <p style={{ fontSize: 13, color: 'var(--text-m)', marginBottom: 14, lineHeight: 1.5 }}>
              The camera shutter was pressed. Do you want to load this image for crack detection analysis?
            </p>
            <img src={'data:image/jpeg;base64,' + pendingFrame.jpeg} alt="Camera photo"
              style={{ width: '100%', borderRadius: 'var(--r-sm)', marginBottom: 14, border: '1px solid var(--border)', display: 'block' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="primary" onClick={() => { loadFrameForAnalysis(pendingFrame.jpeg, pendingFrame.meta); setCamClickPopup(false); setPendingFrame(null); showToast('📸 Camera photo loaded for analysis', 'success', 4000); }} fullWidth>
                ✅ Yes, Load for Analysis
              </Button>
              <Button variant="secondary" onClick={() => { setCamClickPopup(false); setPendingFrame(null); }} fullWidth>✕ Dismiss</Button>
            </div>
          </div>
        </div>
      )} */}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: connected ? 'linear-gradient(90deg,var(--navy) 0%,#0f4c8a 100%)' : 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌡</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-h)', color: connected ? '#fff' : 'var(--text)' }}>FLIR T1020 Live Capture</span>
        </div>
        <FlirStatusPill bridgeOnline={bridgeOnline} connected={connected} cameraName={cameraName} connectionType={connectionType} />
      </div>

      <div style={{ padding: 14 }}>
        {!bridgeOnline && (
          <div style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--border-s)', marginBottom: 12, fontSize: 12, color: 'var(--text-m)', lineHeight: 1.5 }}>
            <b>flir-service bridge is not running.</b><br />
            Start it: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>cd flir-service &amp;&amp; dotnet run</code>
          </div>
        )}

        {/* Connect / Disconnect */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {!connected
            ? <Button variant="primary" onClick={handleConnect} disabled={!bridgeOnline || connecting} fullWidth>
                {connecting ? <><Spinner size={13} color="#fff" />&nbsp;Connecting…</> : '🔌 Connect to FLIR T1020'}
              </Button>
            : <Button variant="secondary" onClick={handleDisconnect} fullWidth>⏏ Disconnect</Button>
          }
        </div>

        {/* Stats row */}
        {connected && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[['Frames received', frameCount], ['Live stream', hasFrame ? '✅ Active' : '⏳ Waiting'], ['Interface', connectionType || '—']].map(([k, v]) => (
              <div key={k} style={{ flex: 1, minWidth: 80, padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border-s)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-m)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--font-h)' }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIVE VIDEO FEED ── */}
        {connected && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: liveFrameURL ? 'var(--danger)' : 'var(--text-m)' }}>
                {liveFrameURL ? '🔴 LIVE' : '⏳ Waiting for stream…'}
                {liveFrameMeta?.frameNumber && <span style={{ fontWeight: 400, color: 'var(--text-m)', marginLeft: 6 }}>· Frame #{liveFrameMeta.frameNumber}</span>}
              </span>
              {liveFrameMeta?.tempAvg != null && (
                <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>🌡 {liveFrameMeta.tempAvg.toFixed(1)}°C avg</span>
              )}
            </div>
            {liveFrameURL
              ? (
                // Aspect-ratio wrapper ensures the live thermal frame always displays
                // at the FLIR T1020's exact 1024×768 (4:3) proportions — no distortion, no crop.
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', borderRadius: 'var(--r-sm)', border: '2px solid var(--navy)', overflow: 'hidden' }}>
                  <img src={liveFrameURL} alt="FLIR live feed"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block', objectFit: 'fill' }} />
                </div>
              )
              : <div style={{ width: '100%', height: 180, background: '#000', borderRadius: 'var(--r-sm)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={24} />
                </div>
            }
            {/* Live GPS below stream */}
            {liveFrameMeta?.lat != null && liveFrameMeta?.lon != null && (
              <p style={{ fontSize: 10, color: 'var(--success)', marginTop: 4, fontFamily: 'monospace', lineHeight: 1.4 }}>
                📡 {gpsLabel(liveFrameMeta)}
              </p>
            )}
            <p style={{ fontSize: 10, color: 'var(--text-m)', marginTop: 3, lineHeight: 1.4 }}>
              Live feed at ~3fps. Click <b>Capture Frame</b> to freeze one frame for crack detection.
              {/* If you press the physical shutter on the T1020, a popup will appear automatically. */}
            </p>
          </div>
        )}

        {/* Capture button */}
        {connected && (
          <Button variant="primary" onClick={handleCapture} disabled={!hasFrame || capturing} fullWidth style={{ marginBottom: 4 }}>
            {capturing ? <><Spinner size={13} color="#fff" />&nbsp;Capturing frame…</> : '📸 Capture Frame for Analysis'}
          </Button>
        )}

        {!connected && !connecting && bridgeOnline && (
          <p style={{ fontSize: 11, color: 'var(--text-m)', textAlign: 'center', marginTop: 4 }}>
            Connect the camera to see the live thermal feed and capture frames for crack detection
          </p>
        )}

        {/* Captured frame (frozen for analysis) */}
        {capturedURL && capturedMeta && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border-s)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>📌 Captured Frame</span>
              <button onClick={clearCapture} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-m)' }}>✕ Clear</button>
            </div>
            {/* Captured frame — 4:3 aspect-ratio wrapper matches FLIR T1020 1024×768 exactly */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', borderRadius: 'var(--r-sm)', border: '2px solid var(--success)', overflow: 'hidden', marginBottom: 8 }}>
              <img src={capturedURL} alt="FLIR captured frame"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block', objectFit: 'fill' }} />
            </div>
            {/* Thermal metadata badges */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {capturedMeta.tempMin != null && (
                <>
                  <ThermalBadge label="Min" value={`${capturedMeta.tempMin?.toFixed(1)}°C`} color="#3b82f6" />
                  <ThermalBadge label="Avg" value={`${capturedMeta.tempAvg?.toFixed(1)}°C`} color="#f59e0b" />
                  <ThermalBadge label="Max" value={`${capturedMeta.tempMax?.toFixed(1)}°C`} color="#ef4444" />
                </>
              )}
              {capturedMeta.heading != null && <ThermalBadge label="Heading" value={`${capturedMeta.heading}°`} color="#8b5cf6" />}
              {capturedMeta.lat != null && capturedMeta.lon != null && (
                <ThermalBadge
                  label={capturedMeta.gpsIsValid ? 'GPS (satellite)' : `GPS (${capturedMeta.connectionType || 'camera'})`}
                  value={`${capturedMeta.lat?.toFixed(5)}, ${capturedMeta.lon?.toFixed(5)}`}
                  color={capturedMeta.gpsIsValid ? '#22c55e' : '#64748b'}
                />
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--success)', marginTop: 8, fontWeight: 600 }}>
              ✅ Frame loaded — click <b>Run Prediction</b> above to analyse
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes flir-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </div>
  );
}

function ThermalBadge({ label, value, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: 11,
      background: `${color}18`, border: `1px solid ${color}55`,
      color,
    }}>
      <b>{label}:</b> {value}
    </span>
  );
}


/* ══════════════════════════════════════════════════════════════════
   EXISTING GAUGE + PDF HELPERS — unchanged from original
══════════════════════════════════════════════════════════════════ */

function Gauge({ value = 0, label, color }) {
  const r = 36, circ = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, value));
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={92} height={92} viewBox="0 0 92 92">
        <circle cx={46} cy={46} r={r} fill="none" stroke="var(--border-s)" strokeWidth={7} />
        <circle cx={46} cy={46} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
          transform="rotate(-90 46 46)" style={{ transition: 'stroke-dashoffset .6s ease' }} />
        <text x={46} y={52} textAnchor="middle" fontSize={14} fontWeight={700}
          fill={color} fontFamily="Rajdhani,sans-serif">
          {(pct * 100).toFixed(1)}%
        </text>
      </svg>
      <p style={{ fontSize: 12, color: 'var(--text-m)', marginTop: 4 }}>{label}</p>
    </div>
  );
}

async function generateImagePDF({ result, filename, modelName, threshold, imageDataURL, flirMeta }) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  const ts   = new Date().toLocaleString('en-IN');
  const isCrack = result.isCrack;

  doc.setFillColor(0, 48, 135);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(255, 102, 0);
  doc.rect(0, 28, W, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('DFCCIL  |  ECG Lab, IIT Roorkee  |  Ministry of Railways, Government of India', W / 2, 9, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Railway Track Crack Detection - Image Analysis Report', W / 2, 19, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${ts}`, W / 2, 25, { align: 'center' });

  const bannerY = 36;
  doc.setFillColor(...(isCrack ? [204, 31, 31] : [26, 122, 63]));
  doc.rect(10, bannerY, W - 20, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(isCrack ? '!! CRACK DETECTED' : 'NORMAL - NO CRACK FOUND', W / 2, bannerY + 7, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    isCrack ? 'Immediate inspection and maintenance recommended.' : 'Track appears safe for operation.',
    W / 2, bannerY + 13, { align: 'center' }
  );

  let y = 62;
  doc.setTextColor(15, 28, 63);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Confidence Scores', 10, y); y += 7;

  const drawBar = (label, value, color) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(74, 85, 104);
    doc.text(label, 10, y);
    doc.text(`${(value * 100).toFixed(2)}%`, W - 10, y, { align: 'right' });
    doc.setFillColor(228, 232, 240);
    doc.rect(10, y + 2, W - 20, 5, 'F');
    doc.setFillColor(...color);
    doc.rect(10, y + 2, (W - 20) * value, 5, 'F');
    y += 12;
  };

  drawBar('P (Crack)',  result.pCrack,  isCrack ? [204, 31, 31]  : [180, 180, 180]);
  drawBar('P (Normal)', result.pNormal, isCrack ? [180, 180, 180] : [26, 122, 63]);

  y += 4;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 28, 63);
  doc.text('Detection Details', 10, y); y += 6;

  const rows = [
    ['File Name',          filename || '—'],
    ['Model Used',         modelName || result.model || '—'],
    ['Decision Threshold', String(threshold ?? result.threshold ?? 0.5)],
    ['P(Crack)',           `${(result.pCrack * 100).toFixed(4)}%`],
    ['P(Normal)',          `${(result.pNormal * 100).toFixed(4)}%`],
    ['Classification',     result.label],
    ['Analysed At',        result.at || ts],
    ['Corridor',           'Western Dedicated Freight Corridor'],
    ['Lab',                'ECG Lab, IIT Roorkee'],
    ['Image Source',       flirMeta ? 'FLIR T1020 Thermal Camera' : 'Uploaded file'],
  ];

  if (flirMeta) {
    if (flirMeta.tempMin != null) rows.push(['Temp Min / Avg / Max', `${flirMeta.tempMin?.toFixed(1)} / ${flirMeta.tempAvg?.toFixed(1)} / ${flirMeta.tempMax?.toFixed(1)} °C`]);
    if (flirMeta.heading  != null) rows.push(['Compass Heading', `${flirMeta.heading}°`]);
    if (flirMeta.connectionType)   rows.push(['Connection Type', flirMeta.connectionType]);
  }

  if (result.lat && result.lon) {
    rows.push(['GPS', `${result.lat}, ${result.lon}`]);
    rows.push(['Maps Link', result.mapsLink || '—']);
  } else if (flirMeta?.gpsIsValid && flirMeta?.lat) {
    rows.push(['GPS (Camera)', `${flirMeta.lat?.toFixed(6)}, ${flirMeta.lon?.toFixed(6)}`]);
    rows.push(['Maps Link', `https://www.google.com/maps?q=${flirMeta.lat},${flirMeta.lon}`]);
  }

  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(240, 244, 248);
      doc.rect(10, y - 4, W - 20, 8, 'F');
    }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(74, 85, 104);
    doc.text(k, 14, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 28, 63);
    doc.text(String(v), 80, y);
    y += 9;
  });

  const fY = doc.internal.pageSize.getHeight() - 14;
  doc.setFillColor(240, 244, 248);
  doc.rect(0, fY - 4, W, 18, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text('DFCCIL Railway Track Crack Detection System   |   ECG Lab, IIT Roorkee   |   For Official Use Only', 10, fY + 2);
  doc.text(`Page 1 of 1`, W - 10, fY + 2, { align: 'right' });

  doc.setFillColor(255, 153, 51);  doc.rect(0, 0, W / 3, 2, 'F');
  doc.setFillColor(255, 255, 255); doc.rect(W / 3, 0, W / 3, 2, 'F');
  doc.setFillColor(19, 136, 8);    doc.rect((W / 3) * 2, 0, W / 3, 2, 'F');

  if (imageDataURL) {
    doc.addPage();
    const H2 = doc.internal.pageSize.getHeight();
    const W2 = doc.internal.pageSize.getWidth();

    doc.setFillColor(255, 153, 51);  doc.rect(0, 0, W2 / 3, 2, 'F');
    doc.setFillColor(255, 255, 255); doc.rect(W2 / 3, 0, W2 / 3, 2, 'F');
    doc.setFillColor(19, 136, 8);    doc.rect((W2 / 3) * 2, 0, W2 / 3, 2, 'F');

    doc.setFillColor(0, 48, 135);
    doc.rect(0, 2, W2, 16, 'F');
    doc.setFillColor(255, 102, 0);
    doc.rect(0, 18, W2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Analysed Thermal Photograph', W2 / 2, 12, { align: 'center' });

    doc.setFillColor(...(isCrack ? [204, 31, 31] : [26, 122, 63]));
    doc.rect(0, 20, W2, 5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(
      isCrack ? '!! CRACK DETECTED' : 'NORMAL - NO CRACK FOUND',
      W2 / 2, 24, { align: 'center' }
    );

    doc.setTextColor(74, 85, 104);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`File: ${filename || 'flir_snapshot.jpg'}`, 10, 32);
    doc.text(`P(Crack): ${(result.pCrack * 100).toFixed(2)}%   |   P(Normal): ${(result.pNormal * 100).toFixed(2)}%`, W2 - 10, 32, { align: 'right' });

    try {
      const imgX = 10, imgY = 36;
      const maxW = W2 - 20, maxH = H2 - 55;
      const fmt  = imageDataURL.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const ratio = img.naturalWidth / img.naturalHeight;
          let drawW = maxW, drawH = drawW / ratio;
          if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
          const cx = imgX + (maxW - drawW) / 2;
          doc.addImage(imageDataURL, fmt, cx, imgY, drawW, drawH);
          resolve();
        };
        img.onerror = resolve;
        img.src = imageDataURL;
      });
    } catch (_) {}

    doc.setDrawColor(...(isCrack ? [204, 31, 31] : [26, 122, 63]));
    doc.setLineWidth(0.6);
    doc.rect(8, 34, W2 - 16, H2 - 46, 'S');

    doc.setFillColor(240, 244, 248);
    doc.rect(0, H2 - 12, W2, 12, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    doc.text('DFCCIL Railway Track Crack Detection System   |   ECG Lab, IIT Roorkee   |   For Official Use Only', 10, H2 - 4);
    doc.text('Page 2 of 2', W2 - 10, H2 - 4, { align: 'right' });
  }

  const totalPages = doc.internal.getNumberOfPages();
  if (totalPages > 1) {
    doc.setPage(1);
    const pH = doc.internal.pageSize.getHeight();
    doc.setFillColor(240, 244, 248);
    doc.rect(W - 40, pH - 12, 40, 12, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    doc.text(`Page 1 of ${totalPages}`, W - 10, pH - 6, { align: 'right' });
  }

  const safe = (filename || 'image').replace(/[^a-z0-9]/gi, '_');
  doc.save(`crack_report_${safe}_${Date.now()}.pdf`);
}


/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   Tab switcher: "Upload Image" | "FLIR T1020 Capture"
   Both tabs feed into the exact same run() / result / PDF pipeline.
══════════════════════════════════════════════════════════════════ */
export default function ImageAnalysis({ showToast, openHelp }) {
  const { modelLoaded, modelName, threshold, setThreshold, imgSize, setImgSize, addEvent } = useApp();

  /* ── Shared image state (used by both tabs) ── */
  const [file,     setFile]     = useState(null);
  const [fileURL,  setFileURL]  = useState(null);
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [result,   setResult]   = useState(null);
  const fileRef = useRef(null);
  const timer   = useRef(null);

  /* ── FLIR-specific metadata (null for regular uploads) ── */
  const [flirMeta, setFlirMeta] = useState(null);

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'flir'

  /* ── Email / PDF ── */
  const [emailOpen,  setEmailOpen]  = useState(false);
  const [pdfBase64,  setPdfBase64]  = useState(null);
  const [preRunOpen, setPreRunOpen] = useState(false);
  const autoEmailsRef = useRef(null);

  /* ── Tab switch clears existing image ── */
  const switchTab = (tab) => {
    if (tab === activeTab) return;
    if (fileURL) URL.revokeObjectURL(fileURL);
    setFile(null); setFileURL(null); setResult(null);
    setProgress(0); setFlirMeta(null);
    setActiveTab(tab);
  };

  /* ── File picker (Upload tab) ── */
  const pickFile = useCallback(f => {
    if (!f || !f.type.startsWith('image/')) return;
    if (fileURL) URL.revokeObjectURL(fileURL);
    setFile(f);
    setFileURL(URL.createObjectURL(f));
    setResult(null);
    setProgress(0);
    setFlirMeta(null);
  }, [fileURL]);

  /* ── FLIR capture callback ── */
  const handleFlirCapture = useCallback((capturedFile, capturedURL, meta) => {
    if (fileURL) URL.revokeObjectURL(fileURL);
    setFile(capturedFile);
    setFileURL(capturedURL);
    setResult(null);
    setProgress(0);
    setFlirMeta(meta);
  }, [fileURL]);

  /* ── Run prediction (same for both sources) ── */
  const run = async (autoEmails = null) => {
    if (!modelLoaded || !file || running) return;
    setRunning(true); setProgress(0); setResult(null);
    let p = 0;
    timer.current = setInterval(() => {
      p = Math.min(p + Math.random() * 10 + 4, 88);
      setProgress(p);
    }, 130);
    try {
      const fd = new FormData();
      fd.append('image',     file);
      fd.append('threshold', String(threshold));
      fd.append('img_size',  String(imgSize));

      // GPS: prefer FLIR camera GPS if valid, else browser GPS
      if (flirMeta?.gpsIsValid && flirMeta?.lat != null) {
        fd.append('lat', String(flirMeta.lat));
        fd.append('lon', String(flirMeta.lon));
      } else if (navigator.geolocation) {
        await new Promise(resolve => {
          navigator.geolocation.getCurrentPosition(
            pos => {
              fd.append('lat', String(+pos.coords.latitude.toFixed(6)));
              fd.append('lon', String(+pos.coords.longitude.toFixed(6)));
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 3000, maximumAge: 10000 }
          );
        });
      }

      const data = await api.predictImage(fd);
      clearInterval(timer.current);
      setProgress(100);
      if (!data.ok) throw new Error(data.error || 'Prediction failed');
      const enriched = { ...data, at: new Date().toLocaleTimeString('en-IN') };
      setResult(enriched);

      if (data.eventId) {
        addEvent({
          eventId: data.eventId, source: flirMeta ? 'flir-image' : 'image',
          filename: file.name,
          model: data.model, pCrack: data.pCrack, pNormal: data.pNormal,
          confidence: data.isCrack ? data.pCrack : data.pNormal,
          status: data.label, isCrack: data.isCrack,
          lat: data.lat || flirMeta?.lat || null,
          lng: data.lon || flirMeta?.lon || null,
          mapsLink: data.mapsLink || null,
          timestamp: new Date().toISOString(),
          hasReport: true,
        });

        // Build the report PDF once (same jsPDF logic as Download/Email) and
        // save it on the event so Detection Log's "View Report" can open the
        // identical report later. This runs for EVERY saved detection, not
        // just when auto-email is on, so the report is always available.
        let builtPdfB64 = null;
        try {
          builtPdfB64 = await buildImagePDFBase64(data, file, fileURL, modelName, threshold, flirMeta);
          await api.attachEventReport(data.eventId, builtPdfB64);
        } catch (e3) {
          // Non-fatal: detection already saved successfully even if the
          // report attach fails (e.g. backend temporarily unreachable).
          console.warn('Attach report failed:', e3);
        }

        if (autoEmails && autoEmails.length > 0) {
          try {
            const b64 = builtPdfB64 || await buildImagePDFBase64(data, file, fileURL, modelName, threshold, flirMeta);
            await api.sendEmail({
              recipients: autoEmails,
              pdfBase64:  b64,
              data: {
                source:    flirMeta ? 'flir-image' : 'image',
                filename:  file?.name,
                model:     data.model || modelName,
                threshold,
                pCrack:    data.pCrack,
                pNormal:   data.pNormal,
                label:     data.label,
                isCrack:   data.isCrack,
                lat:       data.lat || flirMeta?.lat,
                lon:       data.lon || flirMeta?.lon,
                mapsLink:  data.mapsLink,
                timestamp: new Date().toISOString(),
              },
            });
            showToast('📧 Report emailed to ' + autoEmails.join(', '), 'success', 5000);
          } catch (e2) { console.warn('Auto-email failed:', e2); }
        }
      }

      showToast(
        data.isCrack
          ? `⚠ CRACK — ${(data.pCrack * 100).toFixed(1)}%`
          : `✓ Normal — ${(data.pNormal * 100).toFixed(1)}%`,
        data.isCrack ? 'error' : 'success'
      );
    } catch (e) {
      clearInterval(timer.current);
      setProgress(0);
      showToast(`❌ ${e.message}`, 'error');
    }
    setRunning(false);
  };

  const clear = () => {
    if (fileURL) URL.revokeObjectURL(fileURL);
    setFile(null); setFileURL(null); setResult(null);
    setProgress(0); setFlirMeta(null);
  };

  /* ── PDF helpers (identical logic to original, flirMeta now passed through) ── */
  const buildImagePDFBase64 = async (resultData, imgFile, imgFileURL, mdlName, thr, fMeta) => {
    let imageDataURL = null;
    if (imgFileURL) {
      const resp  = await fetch(imgFileURL);
      const blob  = await resp.blob();
      imageDataURL = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
    }

    const { jsPDF } = await import('jspdf');
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W     = doc.internal.pageSize.getWidth();
    const ts    = new Date().toLocaleString('en-IN');
    const isCrack = resultData.isCrack;

    doc.setFillColor(0,48,135); doc.rect(0,0,W,28,'F');
    doc.setFillColor(255,102,0); doc.rect(0,28,W,2.5,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('DFCCIL  |  ECG Lab, IIT Roorkee  |  Ministry of Railways, Government of India', W/2, 9, {align:'center'});
    doc.setFontSize(14); doc.setFont('helvetica','bold');
    doc.text('Railway Track Crack Detection - Image Analysis Report', W/2, 19, {align:'center'});
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text('Generated: '+ts, W/2, 25, {align:'center'});

    doc.setFillColor(...(isCrack?[204,31,31]:[26,122,63]));
    doc.rect(10,36,W-20,18,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16); doc.setFont('helvetica','bold');
    doc.text(isCrack?'!! CRACK DETECTED':'NORMAL - NO CRACK FOUND', W/2, 43, {align:'center'});
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text(isCrack?'Immediate inspection and maintenance recommended.':'Track appears safe for operation.', W/2, 49, {align:'center'});

    let y=62;
    doc.setTextColor(15,28,63); doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Confidence Scores', 10, y); y+=7;
    const drawBar=(label,value,color)=>{
      doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(74,85,104);
      doc.text(label, 10, y); doc.text((value*100).toFixed(2)+'%', W-10, y, {align:'right'});
      doc.setFillColor(228,232,240); doc.rect(10,y+2,W-20,5,'F');
      doc.setFillColor(...color); doc.rect(10,y+2,(W-20)*value,5,'F');
      y+=12;
    };
    drawBar('P (Crack)',  resultData.pCrack,  isCrack?[204,31,31]:[180,180,180]);
    drawBar('P (Normal)', resultData.pNormal, isCrack?[180,180,180]:[26,122,63]);

    y+=4; doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(15,28,63);
    doc.text('Detection Details', 10, y); y+=6;
    const rows=[
      ['File Name',          imgFile?.name||'—'],
      ['Model Used',         mdlName||resultData.model||'—'],
      ['Decision Threshold', String(thr)],
      ['P(Crack)',           (resultData.pCrack*100).toFixed(4)+'%'],
      ['P(Normal)',          (resultData.pNormal*100).toFixed(4)+'%'],
      ['Classification',     resultData.label],
      ['Image Source',       fMeta ? 'FLIR T1020 Thermal Camera' : 'Uploaded file'],
      ['Corridor',           'Western Dedicated Freight Corridor'],
      ['Lab',                'ECG Lab, IIT Roorkee'],
    ];
    if (fMeta?.tempMin != null) rows.push(['Temp Min/Avg/Max', `${fMeta.tempMin?.toFixed(1)} / ${fMeta.tempAvg?.toFixed(1)} / ${fMeta.tempMax?.toFixed(1)} °C`]);
    if (fMeta?.connectionType) rows.push(['Connection Type', fMeta.connectionType]);
    const lat = resultData.lat || fMeta?.lat;
    const lon = resultData.lon || fMeta?.lon;
    if(lat&&lon) rows.push(['GPS',lat+', '+lon]);
    rows.forEach(([k,v],i)=>{
      if(i%2===0){doc.setFillColor(240,244,248);doc.rect(10,y-4,W-20,8,'F');}
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(74,85,104); doc.text(k,14,y);
      doc.setFont('helvetica','normal'); doc.setTextColor(15,28,63); doc.text(String(v),80,y);
      y+=9;
    });

    const fY=doc.internal.pageSize.getHeight()-14;
    doc.setFillColor(240,244,248); doc.rect(0,fY-4,W,18,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(100);
    doc.text('DFCCIL Railway Track Crack Detection System  |  ECG Lab, IIT Roorkee  |  For Official Use Only',10,fY+2);
    doc.text('Page 1 of '+(imageDataURL?2:1), W-10, fY+2, {align:'right'});
    doc.setFillColor(255,153,51); doc.rect(0,0,W/3,2,'F');
    doc.setFillColor(255,255,255); doc.rect(W/3,0,W/3,2,'F');
    doc.setFillColor(19,136,8); doc.rect(W*2/3,0,W/3,2,'F');

    if(imageDataURL){
      doc.addPage();
      const H2=doc.internal.pageSize.getHeight(), W2=doc.internal.pageSize.getWidth();
      doc.setFillColor(255,153,51);doc.rect(0,0,W2/3,2,'F');
      doc.setFillColor(255,255,255);doc.rect(W2/3,0,W2/3,2,'F');
      doc.setFillColor(19,136,8);doc.rect(W2*2/3,0,W2/3,2,'F');
      doc.setFillColor(0,48,135);doc.rect(0,2,W2,16,'F');
      doc.setTextColor(255,255,255);doc.setFontSize(11);doc.setFont('helvetica','bold');
      doc.text('Analysed Thermal Photograph', W2/2, 12, {align:'center'});
      const fmt=imageDataURL.startsWith('data:image/png')?'PNG':'JPEG';
      await new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>{
          const maxW=W2-20, maxH=H2-30;
          const ratio=img.naturalWidth/img.naturalHeight;
          let dW=maxW,dH=dW/ratio;
          if(dH>maxH){dH=maxH;dW=dH*ratio;}
          try{doc.addImage(imageDataURL,fmt,10+(maxW-dW)/2,22,dW,dH);}catch(_){}
          resolve();
        };
        img.onerror=resolve; img.src=imageDataURL;
      });
    }

    return doc.output('datauristring');
  };

  const openEmailModal = async () => {
    setPdfBase64(null);
    setEmailOpen(true);
    try {
      const b64 = await buildImagePDFBase64(result, file, fileURL, modelName, threshold, flirMeta);
      setPdfBase64(b64);
    } catch(e) {
      console.error('PDF generation failed:', e);
      setPdfBase64(null);
    }
  };

  const downloadPDF = async () => {
    let imageDataURL = null;
    if (fileURL) {
      try {
        const resp  = await fetch(fileURL);
        const blob  = await resp.blob();
        imageDataURL = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload  = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      } catch (_) { imageDataURL = null; }
    }
    await generateImagePDF({ result, filename: file?.name, modelName, threshold, imageDataURL, flirMeta });
    showToast('PDF report downloaded', 'success');
  };

  /* ── Tab styles helper ── */
  const tabStyle = (key) => ({
    flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600,
    fontFamily: 'var(--font-h)',
    border: 'none', cursor: 'pointer', borderRadius: 'var(--r-sm)',
    transition: 'all .15s',
    background: activeTab === key ? 'var(--navy)' : 'transparent',
    color: activeTab === key ? '#fff' : 'var(--text-m)',
  });

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

      {/* ── LEFT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: 4, padding: 4,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
        }}>
          <button style={tabStyle('upload')} onClick={() => switchTab('upload')}>
            🖼 Upload Image
          </button>
          <button style={tabStyle('flir')} onClick={() => switchTab('flir')}>
            🌡 FLIR T1020
          </button>
        </div>

        {/* ── Upload Tab ── */}
        {activeTab === 'upload' && (
          <Card
            title="Upload Image"
            subtitle="Drag & drop or click to select"
            headerRight={openHelp && <HelpInfoButton featureKey="image" openHelp={openHelp} label="Image Analysis"/>}
          >
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => pickFile(e.target.files?.[0])} />

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
              style={{
                border: `2px dashed ${file ? 'var(--success)' : 'var(--border)'}`,
                borderRadius: 'var(--r-md)', padding: 24, textAlign: 'center',
                cursor: 'pointer', background: file ? 'var(--success-bg)' : 'var(--bg)',
                minHeight: 160, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', transition: 'all .2s',
              }}
            >
              {file && fileURL ? (
                <div>
                  <img src={fileURL} alt="preview"
                    style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 'var(--r-sm)', marginBottom: 8 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{file.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-m)' }}>{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 10, opacity: .4 }}>🖼</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                    Click or drag &amp; drop your IR image
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-m)' }}>JPG · PNG · JPEG · BMP</p>
                </>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              {!modelLoaded && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--warn-bg)', border: '1px solid var(--warn-br)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--warn)' }}>
                  ⚠ Go to <b>Model Manager</b> to upload and load a model first
                </div>
              )}
              {running && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>Analysing with <b>{modelName}</b>…</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-s)', borderRadius: 3 }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--navy)', borderRadius: 3, transition: 'width .1s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="primary" onClick={() => setPreRunOpen(true)} disabled={!modelLoaded || !file || running} fullWidth>
                  {running ? <><Spinner size={14} color="#fff" />&nbsp;Analysing…</> : '▶ Run Prediction'}
                </Button>
                {file && <Button variant="secondary" onClick={clear}>Clear</Button>}
              </div>
            </div>
          </Card>
        )}

        {/* ── FLIR Tab ── */}
        {activeTab === 'flir' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FlirCapturePanel onCapture={handleFlirCapture} showToast={showToast} />

            {/* Run prediction controls — shown once a frame is captured */}
            {file && (
              <Card title="Run Analysis">
                {!modelLoaded && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--warn-bg)', border: '1px solid var(--warn-br)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--warn)' }}>
                    ⚠ Go to <b>Model Manager</b> to upload and load a model first
                  </div>
                )}
                {running && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span>Analysing with <b>{modelName}</b>…</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border-s)', borderRadius: 3 }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'var(--navy)', borderRadius: 3, transition: 'width .1s' }} />
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="primary" onClick={() => setPreRunOpen(true)} disabled={!modelLoaded || !file || running} fullWidth>
                    {running ? <><Spinner size={14} color="#fff" />&nbsp;Analysing…</> : '▶ Run Prediction'}
                  </Button>
                  <Button variant="secondary" onClick={clear}>Clear</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Inference Settings (always shown) ── */}
        <Card title="Inference Settings">
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Crack Threshold</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-h)', color: 'var(--navy)' }}>{threshold.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.01} value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--navy)', cursor: 'pointer' }} />
            <p style={{ fontSize: 11, color: 'var(--text-m)', marginTop: 4 }}>
              P(crack) ≥ {threshold.toFixed(2)} → CRACK &nbsp;·&nbsp; Recommended: 0.38 – 0.50
            </p>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Image Resize</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-h)', color: 'var(--navy)' }}>{imgSize} × {imgSize}</span>
            </div>
            <input type="range" min={128} max={512} step={32} value={imgSize}
              onChange={e => setImgSize(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--navy)', cursor: 'pointer' }} />
            <p style={{ fontSize: 11, color: 'var(--text-m)', marginTop: 4 }}>Default 224 × 224. Must match your model's training size.</p>
          </div>
        </Card>
      </div>

      {/* ── RIGHT: Result panel (unchanged from original) ── */}
      <Card title="Prediction Result" subtitle="Confidence scores and classification verdict">
        {!result ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-m)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p>
              {activeTab === 'flir'
                ? 'Connect to FLIR T1020, capture a frame, then click Run Prediction'
                : 'Upload an image and click Run Prediction'}
            </p>
          </div>
        ) : (
          <div>
            {/* Verdict banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 20px', borderRadius: 'var(--r-md)', marginBottom: 20,
              background: result.isCrack ? 'var(--danger-bg)' : 'var(--success-bg)',
              border: `2px solid ${result.isCrack ? 'var(--danger-br)' : 'var(--success-br)'}`,
            }}>
              <span style={{ fontSize: 40 }}>{result.isCrack ? '⚠' : '✓'}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 800, fontSize: 20, fontFamily: 'var(--font-h)', margin: '0 0 2px', color: result.isCrack ? 'var(--danger)' : 'var(--success)' }}>
                  {result.label} DETECTED
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                  {result.isCrack ? 'Immediate maintenance recommended' : 'Track is safe for operation'}
                </p>
              </div>
              <Button variant={result.isCrack ? 'danger' : 'success'} size="sm" onClick={downloadPDF}>
                🖨 Download Report
              </Button>
            </div>

            {/* Source badge for FLIR captures */}
            {flirMeta && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                padding: '8px 12px', borderRadius: 'var(--r-sm)',
                background: 'var(--bg)', border: '1px solid var(--border)',
                fontSize: 12, color: 'var(--text-m)',
              }}>
                <span>🌡</span>
                <span>
                  <b>FLIR T1020 Thermal Frame</b>
                  {flirMeta.connectionType && ` · ${flirMeta.connectionType}`}
                  {flirMeta.tempAvg != null && ` · Avg ${flirMeta.tempAvg?.toFixed(1)}°C`}
                  {flirMeta.frameNumber && ` · Frame #${flirMeta.frameNumber}`}
                </span>
              </div>
            )}

            {/* Gauges */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 40, padding: 16,
              background: 'var(--bg)', borderRadius: 'var(--r-md)', marginBottom: 20,
            }}>
              <Gauge value={result.pCrack}  label="P(Crack)"  color="var(--danger)"  />
              <div style={{ width: 1, background: 'var(--border)' }} />
              <Gauge value={result.pNormal} label="P(Normal)" color="var(--success)" />
            </div>

            {/* Details table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[
                  ['Model',      result.model || '—'],
                  ['Threshold',  (result.threshold || 0).toFixed(2)],
                  ['P(Crack)',   result.pCrack?.toFixed(6)],
                  ['P(Normal)',  result.pNormal?.toFixed(6)],
                  ['Decision',   result.label],
                  ['Time',       result.at || '—'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)', color: 'var(--text-m)', width: '38%' }}>{k}</td>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)', fontWeight: 600, color: k === 'Decision' ? (result.isCrack ? 'var(--danger)' : 'var(--success)') : 'var(--text)' }}>{v}</td>
                  </tr>
                ))}
                {/* FLIR thermal metadata — only when capture came from FLIR T1020 */}
                {flirMeta?.tempMin != null && (
                  <tr>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)', color: 'var(--text-m)' }}>Thermal (Min/Avg/Max)</td>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)', fontWeight: 600 }}>
                      {flirMeta.tempMin?.toFixed(1)} / {flirMeta.tempAvg?.toFixed(1)} / {flirMeta.tempMax?.toFixed(1)} °C
                    </td>
                  </tr>
                )}
                {/* GPS from prediction result (sent by backend when lat/lon in FormData) */}
                {result.lat && result.lon && (
                  <tr>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)', color: 'var(--text-m)' }}>GPS</td>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)' }}>
                      <a href={result.mapsLink} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', fontSize: 12 }}>
                        📡 {result.lat?.toFixed(6)}, {result.lon?.toFixed(6)}&nbsp;
                        <span style={{ fontSize: 10, color: 'var(--text-m)', fontWeight: 400 }}>
                          {flirMeta?.gpsIsValid ? '(GPS satellite)' : flirMeta ? `(FLIR camera · ${flirMeta.connectionType || 'camera'})` : ''}
                        </span>
                      </a>
                    </td>
                  </tr>
                )}
                {/* GPS from flirMeta when backend didn't echo it back — always show for FLIR, with source label */}
                {!result.lat && flirMeta?.lat != null && flirMeta?.lon != null && (
                  <tr>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)', color: 'var(--text-m)' }}>
                      GPS {flirMeta.gpsIsValid ? '(satellite)' : `(FLIR · ${flirMeta.connectionType || 'camera'})`}
                    </td>
                    <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border-s)' }}>
                      <a href={`https://www.google.com/maps?q=${flirMeta.lat},${flirMeta.lon}`} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', fontSize: 12 }}>
                        📡 {flirMeta.lat?.toFixed(6)}, {flirMeta.lon?.toFixed(6)}
                      </a>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Button variant="primary" onClick={downloadPDF}
                  style={{ padding: '7px 18px', fontSize: 13, minWidth: 0 }}>
                  🖨 Download PDF
                </Button>
                <Button variant="secondary" onClick={openEmailModal}
                  style={{ padding: '7px 18px', fontSize: 13, minWidth: 0 }}>
                  📧 Email Report
                </Button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-m)', textAlign: 'center', marginTop: 6 }}>
                Includes verdict, confidence scores, GPS, model info and institutional header
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>

    <PreRunEmailPrompt
      isOpen={preRunOpen}
      onClose={() => setPreRunOpen(false)}
      context="image"
      onConfirm={(emails) => {
        autoEmailsRef.current = emails;
        setPreRunOpen(false);
        run(emails);
      }}
    />
    <EmailModal
      isOpen={emailOpen}
      onClose={() => setEmailOpen(false)}
      data={{
        source: flirMeta ? 'flir-image' : 'image',
        filename: file?.name,
        model: result?.model || modelName,
        threshold,
        pCrack: result?.pCrack,
        pNormal: result?.pNormal,
        label: result?.label,
        isCrack: result?.isCrack,
        lat: result?.lat || flirMeta?.lat,
        lon: result?.lon || flirMeta?.lon,
        mapsLink: result?.mapsLink,
        timestamp: new Date().toISOString(),
      }}
      pdfBase64={pdfBase64}
      showToast={showToast}
    />
    </>
  );
}