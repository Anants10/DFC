/**
 * VideoLive.jsx
 *
 * KEY BEHAVIOURS:
 * 1. Video plays visibly in browser — canvas shown ON TOP of the playing video
 *    so user sees live moving frames with overlaid predictions in real time.
 * 2. P(crack) and P(normal) bars update live in the sidebar as the video plays.
 * 3. Dynamic SVG line chart: x-axis = frame index, y-axis = P(crack) 0-100%.
 *    Line rises when crack probability is high, falls when normal.
 *    Red dots mark detected crack frames. Updates every analysed frame.
 * 4. After stop/done, session is saved to MongoDB via Express → Detection Log.
 * 5. PDF: 4 crack photos per page (2 rows × 2 columns).
 * 6. Non-native formats (mpg/avi/mkv etc.) → Flask+OpenCV server-side.
 * 7. Camera: enumerate devices, prefer HP w200 external webcam.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { jsPDF }  from 'jspdf';
import { useApp } from '../../context/AppContext.jsx';
import { api }    from '../../services/api.js';
import Card            from '../../components/ui/Card.jsx';
import Button          from '../../components/ui/Button.jsx';
import Spinner         from '../../components/ui/Spinner.jsx';
import EmailModal      from '../../components/ui/EmailModal.jsx';
import PreRunEmailPrompt from '../../components/ui/PreRunEmailPrompt.jsx';

/* ── Format helpers ──────────────────────────────────────────────────── */
const BROWSER_NATIVE = new Set(['mp4','m4v','webm','ogg','ogv','mov']);
const getExt = f => (f||'').split('.').pop().toLowerCase().trim();

/* ── GPS — FLIR T1020 camera hardware only ────────────────────────────
   GPS comes from thermalImage.GpsInformation via CameraService.cs → bridge
   → Flask flir_routes.py → d.lat / d.lon in flirFrameLoop.
   Browser geolocation is NOT used anywhere in this application.          */
const mapsLink = (lat,lon) => `https://www.google.com/maps?q=${lat},${lon}`;

/* ── Dynamic P(crack) line chart ─────────────────────────────────────── */
function ProbChart({ points }) {
  // points: [{f: frameIdx, p: pCrack 0-1, crack: bool}]
  const W = 700, H = 90, padL = 36, padR = 8, padT = 8, padB = 22;
  const iW = W - padL - padR, iH = H - padT - padB;

  if (!points.length) {
    return (
      <div style={{ textAlign:'center', padding:'18px 0', color:'var(--text-m)', fontSize:12 }}>
        P(crack) chart updates as the video plays
      </div>
    );
  }

  const n   = points.length;
  const xOf = (i) => padL + (i / Math.max(n-1,1)) * iW;
  const yOf = (p) => padT + iH - p * iH;

  // Build polyline
  const pts = points.map((pt,i) => `${xOf(i).toFixed(1)},${yOf(pt.p).toFixed(1)}`).join(' ');

  // Filled area under the curve
  const area = `${padL},${padT+iH} ` + points.map((pt,i) => `${xOf(i).toFixed(1)},${yOf(pt.p).toFixed(1)}`).join(' ') + ` ${xOf(n-1).toFixed(1)},${padT+iH}`;

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block', overflow:'visible' }}>
      {/* Grid lines */}
      {yLabels.map(v => {
        const y = yOf(v/100);
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W-padR} y2={y} stroke="var(--border-s)" strokeWidth={0.7} strokeDasharray={v===0||v===100?'none':'3 3'}/>
            <text x={padL-4} y={y+4} textAnchor="end" fontSize={8} fill="var(--text-m)">{v}%</text>
          </g>
        );
      })}

      {/* Threshold line at 50% (default) */}
      <line x1={padL} y1={yOf(0.5)} x2={W-padR} y2={yOf(0.5)} stroke="var(--saffron)" strokeWidth={1} strokeDasharray="5 3" opacity={0.7}/>
      <text x={W-padR+2} y={yOf(0.5)+4} fontSize={7} fill="var(--saffron)">thr</text>

      {/* Area fill */}
      <polygon points={area} fill="rgba(204,31,31,0.08)" />

      {/* Main line */}
      <polyline points={pts} fill="none" stroke="var(--danger)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"/>

      {/* Crack dots (red) */}
      {points.map((pt,i) => pt.crack ? (
        <circle key={i} cx={xOf(i)} cy={yOf(pt.p)} r={3} fill="var(--danger)" stroke="#fff" strokeWidth={0.8}/>
      ) : null)}

      {/* Last point indicator */}
      {points.length > 0 && (() => {
        const last = points[points.length-1];
        const lx = xOf(n-1), ly = yOf(last.p);
        return (
          <g>
            <circle cx={lx} cy={ly} r={4} fill={last.crack?'var(--danger)':'var(--success)'} stroke="#fff" strokeWidth={1.2}/>
            <rect x={lx+6} y={ly-10} width={46} height={14} rx={3} fill={last.crack?'var(--danger)':'var(--success)'} opacity={0.9}/>
            <text x={lx+29} y={ly+1} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#fff">
              {(last.p*100).toFixed(1)}%
            </text>
          </g>
        );
      })()}

      {/* X-axis */}
      <line x1={padL} y1={padT+iH} x2={W-padR} y2={padT+iH} stroke="var(--border)" strokeWidth={1}/>
      <text x={padL}    y={H-4} fontSize={8} fill="var(--text-m)">Frame 0</text>
      <text x={W-padR}  y={H-4} fontSize={8} fill="var(--text-m)" textAnchor="end">Frame {points[points.length-1]?.f||0}</text>

      {/* Y-axis */}
      <line x1={padL} y1={padT} x2={padL} y2={padT+iH} stroke="var(--border)" strokeWidth={1}/>
    </svg>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────── */
function Stat({ label, value, color }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderTop:`3px solid ${color}`, borderRadius:'var(--r-md)', padding:'10px 12px', textAlign:'center' }}>
      <div style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-h)', color }}>{value}</div>
      <div style={{ fontSize:11, color:'var(--text-m)', marginTop:2 }}>{label}</div>
    </div>
  );
}

/* ── PDF — 4 photos per page (2×2 grid) ─────────────────────────────── */
async function generateVideoPDF({ filename, modelName, threshold, chartPoints, crackPhotos, elapsed, totalFrames, crackFrames, returnBase64 = false }) {
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const ts  = new Date().toLocaleString('en-IN');
  const total = totalFrames || 0;
  const cracks = crackFrames || 0;
  const rate   = total > 0 ? ((cracks/total)*100).toFixed(1) : '0.0';
  const hasCrack = cracks > 0;

  const tricolour = () => {
    doc.setFillColor(255,153,51);  doc.rect(0,0,W/3,2.5,'F');
    doc.setFillColor(255,255,255); doc.rect(W/3,0,W/3,2.5,'F');
    doc.setFillColor(19,136,8);    doc.rect(W*2/3,0,W/3,2.5,'F');
  };
  const addFooter = (p, tot) => {
    const fH = doc.internal.pageSize.getHeight();
    doc.setFillColor(240,244,248); doc.rect(0,fH-10,W,10,'F');
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(100);
    doc.text('ECG Lab, IIT Roorkee  |  DFCCIL  |  For Official Use Only', 10, fH-3);
    doc.text(`Page ${p} of ${tot}`, W-10, fH-3, {align:'right'});
  };

  /* ── Page 1: Summary ── */
  tricolour();
  doc.setFillColor(0,48,135);  doc.rect(0,2.5,W,22,'F');
  doc.setFillColor(255,102,0); doc.rect(0,24.5,W,2,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(8);  doc.setFont('helvetica','normal');
  doc.text('DFCCIL  |  ECG Lab, IIT Roorkee  |  Ministry of Railways, Government of India', W/2, 10, {align:'center'});
  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('Railway Track Crack Detection - Video Analysis Report', W/2, 18.5, {align:'center'});
  doc.setFontSize(7);  doc.setFont('helvetica','normal');
  doc.text(`Generated: ${ts}`, W/2, 24, {align:'center'});

  doc.setFillColor(...(hasCrack ? [204,31,31] : [26,122,63]));
  doc.rect(10,30,W-20,14,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text(hasCrack ? `!! CRACKS DETECTED - ${cracks} frame(s) (${rate}%)` : 'NO CRACKS DETECTED', W/2, 38, {align:'center'});
  doc.setFontSize(8);  doc.setFont('helvetica','normal');
  doc.text(hasCrack ? 'Maintenance recommended. Crack photos on following pages.' : 'Track safe for operation.', W/2, 43, {align:'center'});

  let y = 52;
  const cw = (W-20)/6;
  [['Total',total,[0,48,135]],['Cracks',cracks,hasCrack?[204,31,31]:[26,122,63]],['Rate',`${rate}%`,hasCrack?[204,31,31]:[26,122,63]],['Normal',total-cracks,[26,122,63]],['Elapsed',`${elapsed}s`,[100,100,100]],['Model',modelName||'—',[60,80,120]]].forEach(([l,v,col],i) => {
    const cx = 10 + i*cw;
    doc.setFillColor(...col); doc.rect(cx,y,cw-2,12,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.text(String(v).slice(0,16), cx+(cw-2)/2, y+7.5, {align:'center'});
    doc.setFontSize(6); doc.setFont('helvetica','normal');
    doc.text(l, cx+(cw-2)/2, y+11.5, {align:'center'});
  });
  y += 17;

  // Config table
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(15,28,63);
  doc.text('Configuration', 10, y+4); y += 9;
  [['File',filename||'—'],['Model',modelName||'—'],['Threshold',String(threshold)],['Corridor','Western Dedicated Freight Corridor']].forEach(([k,v],i) => {
    if (i%2===0) { doc.setFillColor(240,244,248); doc.rect(10,y-3,W-20,7,'F'); }
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(74,85,104);
    doc.text(k, 14, y+1);
    doc.setFont('helvetica','normal'); doc.setTextColor(15,28,63);
    doc.text(String(v), 60, y+1);
    y += 8;
  });

  // P(crack) chart as simple rect-based bars
  y += 3;
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(15,28,63);
  doc.text('P(crack) vs Frame', 10, y); y += 5;
  const tlW = W-20, tlH = 18;
  doc.setFillColor(240,244,248); doc.rect(10,y,tlW,tlH,'F');
  doc.setDrawColor(200); doc.rect(10,y,tlW,tlH,'S');
  if (chartPoints.length > 0) {
    const sw2 = tlW / chartPoints.length;
    chartPoints.forEach((pt,i) => {
      const barH = pt.p * tlH;
      const col  = pt.crack ? [204,31,31] : [26,122,63];
      doc.setFillColor(...col);
      doc.rect(10 + i*sw2, y + tlH - barH, Math.max(sw2-0.2,0.3), barH, 'F');
    });
    // Threshold line
    doc.setDrawColor(255,102,0);
    doc.setLineWidth(0.4);
    doc.line(10, y + tlH*0.5, 10+tlW, y + tlH*0.5);
  }
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(100);
  y += tlH + 3;
  doc.text('Orange line = threshold   |   Green = Normal   |   Red = Crack', 10, y);

  // How many photo pages needed (4 per page)
  const photoPagesCount = Math.ceil(crackPhotos.length / 4);
  const totalPages = 1 + photoPagesCount;

  /* ── Pages 2+: 4 photos per page in a 2×2 grid ── */
  for (let pg = 0; pg < photoPagesCount; pg++) {
    doc.addPage();
    tricolour();
    doc.setFillColor(0,48,135); doc.rect(0,2.5,W,14,'F');
    doc.setFillColor(204,31,31); doc.rect(0,16.5,W,2,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    const startIdx = pg*4, endIdx = Math.min(startIdx+4, crackPhotos.length);
    doc.text(`Crack Photos — Events ${startIdx+1} to ${endIdx} of ${crackPhotos.length}`, W/2, 12, {align:'center'});

    // 2×2 grid — generous padding, smaller images, clear border around each cell
    const gridPad  = 12;           // outer margin from page edge
    const gap      = 8;            // gap between cells
    const headerH  = 22;           // header band height at top of page
    const infoH    = 22;           // info strip height at bottom of each cell
    const cellW    = (W - gridPad*2 - gap) / 2;
    const availH   = H - headerH - gridPad - gap;
    const cellH    = availH / 2;
    const imgMaxH  = cellH - infoH - 6;  // image area inside cell
    const imgMaxW  = cellW - 8;           // image width with padding

    const positions = [
      [gridPad,              headerH + 4],
      [gridPad + cellW + gap, headerH + 4],
      [gridPad,              headerH + 4 + cellH + gap],
      [gridPad + cellW + gap, headerH + 4 + cellH + gap],
    ];

    for (let ci = 0; ci < 4; ci++) {
      const photoIdx = startIdx + ci;
      if (photoIdx >= crackPhotos.length) break;
      const ph  = crackPhotos[photoIdx];
      const [cx, cy] = positions[ci];

      // White cell background
      doc.setFillColor(255,255,255);
      doc.rect(cx, cy, cellW, cellH, 'F');

      // Prominent border around the whole cell
      doc.setDrawColor(204,31,31);
      doc.setLineWidth(0.8);
      doc.rect(cx, cy, cellW, cellH, 'S');
      doc.setLineWidth(0.2); // reset

      // Photo area (top portion of cell, centred with padding)
      if (ph.dataURL) {
        const fmt = ph.dataURL.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        await new Promise(resolve => {
          const img = new Image();
          img.onload = () => {
            const ratio = img.naturalWidth / img.naturalHeight;
            let dW = imgMaxW, dH = dW/ratio;
            if (dH > imgMaxH) { dH = imgMaxH; dW = dH*ratio; }
            const ix = cx + (cellW - dW)/2;   // centre horizontally
            const iy = cy + 3;                  // small top padding
            try { doc.addImage(ph.dataURL, fmt, ix, iy, dW, dH); } catch(_) {}
            resolve();
          };
          img.onerror = resolve;
          img.src = ph.dataURL;
        });
      }

      // Info strip at the very bottom of the cell — dark red background
      const iy2 = cy + cellH - infoH;
      doc.setFillColor(180, 20, 20);
      doc.rect(cx, iy2, cellW, infoH, 'F');
      // White divider line between photo and info
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.3);
      doc.line(cx, iy2, cx+cellW, iy2);
      doc.setLineWidth(0.2);

      doc.setTextColor(255,255,255);
      doc.setFontSize(7.5); doc.setFont('helvetica','bold');
      doc.text(`Event #${photoIdx+1}  |  CRACK DETECTED`, cx+4, iy2+6);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
      doc.text(
        `P(crack): ${(ph.pCrack*100).toFixed(1)}%   Frame: ${ph.frame}   Time: ${ph.time_s}s`,
        cx+4, iy2+12
      );
      const gpsText = ph.lat!=null
        ? `GPS: ${ph.lat.toFixed(5)}, ${ph.lon.toFixed(5)}${ph.mapsLink?' | maps.google.com':''}`.slice(0,72)
        : 'GPS: Not available';
      doc.text(gpsText, cx+4, iy2+18);
    }
    // Reset draw color
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    addFooter(pg+2, totalPages);
  }

  doc.setPage(1);
  addFooter(1, totalPages);
  if (returnBase64) {
    return doc.output('datauristring');
  }
  const safe = (filename||'video').replace(/[^a-z0-9]/gi,'_');
  doc.save(`video_crack_report_${safe}_${Date.now()}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function VideoLive({ showToast }) {
  const { modelLoaded, modelName, threshold, setThreshold, imgSize, setImgSize, addEvent } = useApp();

  const [mode,          setMode]          = useState('upload');
  const [videoFile,     setVideoFile]     = useState(null);
  const [videoURL,      setVideoURL]      = useState(null);
  const [videoReady,    setVideoReady]    = useState(false);
  const [useServer,     setUseServer]     = useState(false);

  // Camera (webcam)
  const [camStatus,     setCamStatus]     = useState('idle');
  const [camError,      setCamError]      = useState('');
  const [deviceList,    setDeviceList]    = useState([]);
  const [selectedDevId, setSelectedDevId] = useState('');
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  // FLIR T1020
  const [flirStatus,    setFlirStatus]    = useState('idle');   // 'idle'|'connecting'|'connected'|'error'
  const [flirInfo,      setFlirInfo]      = useState(null);     // {cameraName, frameCount}
  const [liveTemp,      setLiveTemp]      = useState(null);     // {min,max,avg}
  const [liveHeading,   setLiveHeading]   = useState(null);     // compass degrees
  const flirRunRef     = useRef(false);
  const flirTimerRef   = useRef(null);

  // Session state
  const [running,       setRunning]       = useState(false);
  const [serverBusy,    setServerBusy]    = useState(false);
  const [done,          setDone]          = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [progress,      setProgress]      = useState(0);

  // Data
  const [chartPoints,   setChartPoints]   = useState([]); // {f,p,crack}
  const [frameEvents,   setFrameEvents]   = useState([]); // 0|1 per analysed frame
  const [crackPhotos,   setCrackPhotos]   = useState([]);
  const [totalFrames,   setTotalFrames]   = useState(0);

  // Live sidebar values
  const [livePCrack,    setLivePCrack]    = useState(null);
  const [livePNormal,   setLivePNormal]   = useState(null);
  const [liveLabel,     setLiveLabel]     = useState('');
  const [liveGPS,       setLiveGPS]       = useState(null);

  // Email modal state
  const [emailOpen,    setEmailOpen]    = useState(false);
  const [pdfBase64,    setPdfBase64]    = useState(null);
  const [preRunOpen,   setPreRunOpen]   = useState(false);
  const [preRunCtx,    setPreRunCtx]    = useState('video');
  const autoEmailsRef  = useRef(null);   // useRef prevents stale closure
  const preRunCbRef    = useRef(null);   // useRef prevents useState(fn) bug

  // Refs
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const flirCanvasRef  = useRef(null);   // FLIR live thermal feed canvas (decoded JPEG + overlay)
  const fileRef        = useRef(null);
  const rafRef         = useRef(null);
  const timerRef       = useRef(null);
  const runRef         = useRef(false);
  const evRef          = useRef([]);
  const chartRef       = useRef([]);   // chart points buffer
  const photosRef      = useRef([]);
  const elRef          = useRef(0);
  const frameCountRef  = useRef(0);
  const _skipCountRef  = useRef(0);   // counts every RAF tick; frameCountRef only counts sent frames
  const pendingRef     = useRef(false);
  const SKIP           = 5;   // send every 5th frame

  // Cleanup on unmount
  useEffect(() => () => {
    runRef.current = false;
    flirRunRef.current = false;
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    clearTimeout(flirTimerRef.current);
    if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t=>t.stop());
    if (videoURL) URL.revokeObjectURL(videoURL);
  }, []);

  /* ── Draw overlay on canvas ── */
  const drawOverlay = useCallback((v, pC, pN, iC, gps) => {
    const c = canvasRef.current;
    if (!c||!v||v.readyState<2) return;
    const W = v.videoWidth  || 640;
    const H = v.videoHeight || 360;
    if (c.width!==W || c.height!==H) { c.width=W; c.height=H; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    /* ── TOP BAR: verdict only (42px fixed) ── */
    const topH = 42;
    ctx.fillStyle = iC ? 'rgba(185,15,15,0.93)' : 'rgba(18,100,48,0.93)';
    ctx.fillRect(0, 0, W, topH);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 16px Arial`;
    ctx.fillText(iC ? '!! CRACK DETECTED' : '✓  NORMAL TRACK', 14, 27);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `11px Arial`;
    ctx.fillText(`Model: ${modelName||'—'}  |  Threshold: ${threshold}`, 14, 38);


  }, [modelName, threshold]);

  /* ── Draw overlay directly onto a 2D ctx (FLIR mode — no <video> element) ── */
  const drawFlirOverlay = useCallback((ctx, W, H, pC, pN, iC, gps) => {
    // TOP BAR — verdict only (42px fixed)
    const topH = 42;
    ctx.fillStyle = iC ? 'rgba(185,15,15,0.93)' : 'rgba(18,100,48,0.93)';
    ctx.fillRect(0, 0, W, topH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(iC ? '!! CRACK DETECTED' : '✓  NORMAL TRACK', 14, 27);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px Arial';
    ctx.fillText(`Model: ${modelName||'—'}  |  Threshold: ${threshold}`, 14, 38);

  }, [modelName, threshold]);
  /* ── Capture photo — composite video frame + overlay bars (or FLIR canvas) ── */
  const capturePhoto = useCallback(() => {
    try {
      // FLIR mode — capture directly from the FLIR canvas (already has frame + overlay)
      if (mode === 'flir') {
        const fc = flirCanvasRef.current;
        if (!fc || fc.width === 0) return null;
        return fc.toDataURL('image/jpeg', 0.88);
      }
      const v = videoRef.current;
      const overlay = canvasRef.current;
      if (!v || v.readyState < 2) return null;
      const W = v.videoWidth  || 640;
      const H = v.videoHeight || 360;
      // Composite canvas: draw video frame first, then overlay on top
      const comp = document.createElement('canvas');
      comp.width  = W;
      comp.height = H;
      const ctx = comp.getContext('2d');
      ctx.drawImage(v, 0, 0, W, H);
      if (overlay && overlay.width === W && overlay.height === H) {
        ctx.drawImage(overlay, 0, 0, W, H);
      }
      return comp.toDataURL('image/jpeg', 0.88);
    } catch(_) { return null; }
  }, [mode]);

  /* ── Client-side RAF loop ── */
  const frameLoop = useCallback((v) => {
    if (!runRef.current) return;
    if (!v||v.readyState<2||v.paused) {
      rafRef.current = requestAnimationFrame(() => frameLoop(v));
      return;
    }
    if (v.ended) { stopClientDetection(); return; }

    _skipCountRef.current += 1;
    if (_skipCountRef.current % SKIP !== 0 || pendingRef.current) {
      rafRef.current = requestAnimationFrame(() => frameLoop(v));
      return;
    }
    frameCountRef.current += 1;

    const off = document.createElement('canvas');
    off.width = v.videoWidth||640; off.height = v.videoHeight||360;
    off.getContext('2d').drawImage(v, 0, 0, off.width, off.height);
    const b64 = off.toDataURL('image/jpeg', 0.75).split(',')[1];

    pendingRef.current = true;
    api.predictFrame({ image:b64, threshold, img_size:imgSize })
      .then(d => {
        if (!runRef.current) return;
        pendingRef.current = false;
        const pC  = d.ok ? d.pCrack  : 0;
        const pN  = d.ok ? d.pNormal : 1;
        const iC  = d.ok ? d.isCrack : false;

        // GPS from API response — present when FLIR T1020 is the camera source
        // (null for laptop/regular webcams which have no thermal metadata)
        const gps = (d.lat != null && d.lon != null)
          ? { lat: d.lat, lon: d.lon, source: 'camera', isValid: d.gpsIsValid ?? false }
          : null;

        // Temperature from API response — present only when FLIR T1020 sends thermal data
        if (d.tempMin != null && d.tempMax != null && d.tempAvg != null) {
          setLiveTemp({ min: d.tempMin, max: d.tempMax, avg: d.tempAvg });
        }
        if (d.heading != null) setLiveHeading(d.heading);
        if (gps) setLiveGPS({ ...gps, mapsLink: mapsLink(gps.lat, gps.lon) });

        drawOverlay(v, pC, pN, iC, gps);
        setLivePCrack(pC); setLivePNormal(pN); setLiveLabel(iC?'CRACK':'NORMAL');

        // Record frame event
        evRef.current = [...evRef.current, iC?1:0];

        // Chart point — every analysed frame
        const chartPt = { f: frameCountRef.current, p: pC, crack: iC };
        chartRef.current = [...chartRef.current, chartPt];

        // Throttle React state updates (every 3 predictions)
        if (evRef.current.length % 3 === 0) {
          setFrameEvents([...evRef.current]);
          setChartPoints([...chartRef.current]);
        }

        // Capture photo on crack (throttle: 1 per 2s)
        if (iC) {
          const snap  = capturePhoto();
          const timeS = +(v.currentTime||elRef.current).toFixed(2);
          const last  = photosRef.current[photosRef.current.length-1];
          if (!last || (timeS - last.time_s) >= 2) {
            const photo = {
              dataURL:  snap,
              pCrack:   pC,
              pNormal:  pN,
              frame:    frameCountRef.current,
              time_s:   timeS,
              lat:      gps?.lat ?? null,
              lon:      gps?.lon ?? null,
              mapsLink: gps ? mapsLink(gps.lat, gps.lon) : null,
            };
            photosRef.current = [...photosRef.current, photo];
            setCrackPhotos([...photosRef.current]);
          }
        }
      })
      .catch(() => { pendingRef.current = false; });

    rafRef.current = requestAnimationFrame(() => frameLoop(v));
  }, [threshold, imgSize, drawOverlay, capturePhoto]);

  /* ── Start client-side detection ── */
  const startClientDetection = useCallback((v) => {
    runRef.current=true; evRef.current=[]; chartRef.current=[]; photosRef.current=[];
    frameCountRef.current=0; _skipCountRef.current=0; elRef.current=0; pendingRef.current=false;
    setFrameEvents([]); setChartPoints([]); setCrackPhotos([]); setElapsed(0); setDone(false);
    setLivePCrack(null); setLivePNormal(null); setLiveLabel('');
    timerRef.current = setInterval(() => { elRef.current++; setElapsed(e=>e+1); }, 1000);
    setRunning(true);
    rafRef.current = requestAnimationFrame(() => frameLoop(v));
  }, [frameLoop]);

  /* ── Stop + save to Detection Log ── */
  /* ── Generate PDF as base64 for email (same as downloadPDF but returns string) ── */
  const generateVideoPDFBase64 = useCallback(async () => {
    const cp = [...photosRef.current];
    const ch = [...chartRef.current];
    const fe = [...evRef.current];
    const cf = fe.filter(e=>e===1).length;
    const analysed = fe.length;

    const doc  = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const W    = doc.internal.pageSize.getWidth();
    const H    = doc.internal.pageSize.getHeight();
    const ts   = new Date().toLocaleString('en-IN');
    const hasCr = cf > 0;

    // Page 1 — Summary
    doc.setFillColor(0,48,135); doc.rect(0,0,W,18,'F');
    doc.setFillColor(255,102,0); doc.rect(0,18,W,1.5,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('DFCCIL  |  ECG Lab, IIT Roorkee', W/2, 7, {align:'center'});
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Railway Track Crack Detection — Video Analysis Report', W/2, 13, {align:'center'});

    doc.setFillColor(...(hasCr?[204,31,31]:[26,122,63]));
    doc.rect(10,22,W-20,12,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(13); doc.setFont('helvetica','bold');
    doc.text(hasCr?'CRACK DETECTED':'NORMAL — NO CRACKS', W/2, 30, {align:'center'});

    doc.setTextColor(30,30,30);
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    let y = 40;
    const info = [
      ['File', videoFile?.name||'Camera Session'], ['Model', modelName||'—'],
      ['Threshold', String(threshold)], ['Generated', ts],
      ['Total Frames', String(analysed)], ['Crack Frames', String(cf)],
      ['Crack Rate', `${(cf/Math.max(analysed,1)*100).toFixed(1)}%`],
      ['Elapsed', `${elRef.current}s`],
    ];
    info.forEach(([k,v],i) => {
      const x = i%2===0 ? 14 : W/2+4;
      if (i%2===0&&i>0) y+=6;
      doc.setFont('helvetica','bold'); doc.text(k+': ', x, y);
      doc.setFont('helvetica','normal'); doc.text(v, x+28, y);
    });

    // Chart bars
    if (ch.length > 0) {
      y += 10;
      const cW = W-28, cH = 28, cX = 14, cY = y;
      doc.setFillColor(240,244,248); doc.rect(cX, cY, cW, cH, 'F');
      doc.setDrawColor(200,208,220); doc.rect(cX, cY, cW, cH, 'S');
      doc.setFontSize(7); doc.setTextColor(80,80,80);
      doc.text('P(crack) vs Frame', cX+2, cY+4);
      const ptW = cW/Math.max(ch.length,1);
      ch.forEach((pt,i) => {
        const bH = cH*0.8*Math.min(1,pt.p);
        doc.setFillColor(...(pt.crack?[204,31,31]:[80,160,100]));
        doc.rect(cX + i*ptW, cY+cH-bH-2, Math.max(ptW-0.5,0.5), bH, 'F');
      });
      // threshold line
      doc.setDrawColor(255,102,0);
      const tY = cY + cH - cH*0.8*threshold - 2;
      doc.line(cX, tY, cX+cW, tY);
    }

    // Pages 2+ — crack photos, 4 per page (2×2)
    if (cp.length > 0) {
      const pages = Math.ceil(cp.length/4);
      for (let pg=0; pg<pages; pg++) {
        doc.addPage();
        doc.setFillColor(0,48,135); doc.rect(0,0,W,12,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
        doc.text(`Crack Photos — Page ${pg+1} of ${pages}`, W/2, 8, {align:'center'});

        const cellW=(W-16)/2, cellH=(H-24)/2;
        const positions=[[8,14],[8+cellW+2,14],[8,14+cellH+2],[8+cellW+2,14+cellH+2]];

        for (let c2=0; c2<4; c2++) {
          const idx = pg*4+c2;
          if (idx>=cp.length) break;
          const ph = cp[idx];
          const [px,py] = positions[c2];

          // Red border
          doc.setDrawColor(204,31,31); doc.setLineWidth(0.8);
          doc.rect(px, py, cellW, cellH, 'S');

          if (ph.dataURL) {
            try { doc.addImage(ph.dataURL, 'JPEG', px+1, py+1, cellW-2, cellH-14); } catch(e){}
          }

          // Info strip
          const infoY = py+cellH-13;
          doc.setFillColor(204,31,31); doc.rect(px, infoY, cellW, 13, 'F');
          doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','bold');
          doc.text(`#${idx+1} · Frame ${ph.frame} · P(crack): ${(ph.pCrack*100).toFixed(1)}%`, px+2, infoY+5);
          doc.setFont('helvetica','normal');
          doc.text(`Time: ${ph.time_s}s${ph.lat?` · GPS: ${ph.lat?.toFixed(4)}, ${ph.lon?.toFixed(4)}`:''}`, px+2, infoY+10);
        }
      }
    }

    return doc.output('datauristring');
  }, [videoFile, modelName, threshold]);

    const stopClientDetection = useCallback(async () => {
    if (!runRef.current) return;
    runRef.current = false;
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    const v = videoRef.current;
    if (v?.srcObject) { v.srcObject.getTracks().forEach(t=>t.stop()); v.srcObject=null; }
    else if (v) { v.pause(); }

    const fe = [...evRef.current];
    const fp = [...photosRef.current];
    const cp = [...chartRef.current];
    setFrameEvents(fe); setCrackPhotos(fp); setChartPoints(cp);
    setRunning(false); setDone(true);

    const cf     = fe.filter(e=>e===1).length;
    const analysed = fe.length;

    // Save to MongoDB via Express → appears in Detection Log (always, even 0 cracks)
    if (analysed > 0 || mode === 'camera') {
      try {
        // Use GPS from first crack photo if available
        const firstCrack = fp[0];
        const eventData = {
          source: mode === 'camera' ? 'camera' : 'video',
          filename: videoFile?.name || (mode==='camera' ? 'Live Camera Session' : 'video'),
          model: modelName || '',
          threshold,
          pCrack:      cf/Math.max(analysed,1),
          pNormal:     (analysed-cf)/Math.max(analysed,1),
          confidence:  cf/Math.max(analysed,1),
          status:      cf > 0 ? 'CRACK' : 'NORMAL',
          isCrack:     cf > 0,
          totalFrames: frameCountRef.current,
          crackFrames: cf,
          elapsed:     elRef.current,
          crackRate:   analysed > 0 ? cf/analysed*100 : 0,
          lat:         firstCrack?.lat  || null,
          lng:         firstCrack?.lon  || null,
          mapsLink:    firstCrack?.mapsLink || null,
        };
        const saved = await api.createEvent(eventData);
        const savedId = saved?.event?.eventId || null;
        addEvent({
          ...eventData,
          eventId:   savedId,
          timestamp: new Date().toISOString(),
          hasReport: true,
        });
        // Build the same PDF used for Download/Email and attach it to the
        // saved event so Detection Log's "View Report" can open it later.
        if (savedId) {
          try {
            const pdfB64 = await generateVideoPDFBase64();
            await api.attachEventReport(savedId, pdfB64);
          } catch (e4) { console.warn('Attach report failed:', e4); }
        }
      } catch(err) { console.error('Save session failed:', err); }
    }

    showToast(cf>0 ? `${cf} crack frames · ${fp.length} photos` : 'No cracks detected', cf>0?'error':'success');

    // Auto-email if user opted in via PreRunEmailPrompt
    if (autoEmailsRef.current && autoEmailsRef.current.length>0) {
      sendAutoEmail(autoEmailsRef.current, fp, cp, fe);
      autoEmailsRef.current = null;
    }
  }, [showToast, mode, videoFile, modelName, threshold, addEvent]);

  /* ── Server-side analysis for non-native formats ── */
  const runServerAnalysis = async () => {
    if (!modelLoaded||!videoFile) return;
    setServerBusy(true); setDone(false); setProgress(5);
    setFrameEvents([]); setChartPoints([]); setCrackPhotos([]); setElapsed(0);
    evRef.current=[]; chartRef.current=[]; photosRef.current=[];
    let el=0;
    timerRef.current = setInterval(() => { el++; setElapsed(el); }, 1000);
    try {
      const fd = new FormData();
      fd.append('video', videoFile);
      fd.append('threshold',  String(threshold));
      fd.append('img_size',   String(imgSize));
      fd.append('frame_skip', '6');
      fd.append('model',      modelName || '');   // pass model name to Express → DB
      setProgress(20);
      const data = await api.predictVideo(fd);
      clearInterval(timerRef.current); setProgress(100);
      if (!data.ok) throw new Error(data.error||'Server analysis failed');

      const fe = (data.timeline||[]).map(t=>t.isCrack?1:0);
      const cp = (data.timeline||[]).map((t,i) => ({f:t.frame||i, p:t.pCrack||0, crack:t.isCrack}));
      setFrameEvents(fe); setChartPoints(cp); evRef.current=fe; chartRef.current=cp;

      const photos = (data.crackEvents||[]).map(ev => ({
        dataURL: ev.thumb||null, pCrack:ev.pCrack, pNormal:ev.pNormal,
        frame:ev.frame, time_s:ev.time_s, lat:ev.lat, lon:ev.lon, mapsLink:ev.mapsLink,
      }));
      setCrackPhotos(photos); photosRef.current=photos;
      setTotalFrames(data.totalFrames||0);
      setElapsed(Math.round(data.elapsed||el));
      setDone(true);

      // Save to MongoDB
      const serverAnalysed = Math.max(data.analysedFrames||1,1);
      const serverCracks   = data.crackFrames||0;
      // GPS from first crack event returned by server
      const firstServerCrack = (data.crackEvents||[])[0];
      const serverEventData  = {
        source: 'video',
        filename: videoFile.name,
        model: modelName||'',
        threshold,
        pCrack:      serverCracks/serverAnalysed,
        pNormal:     1 - serverCracks/serverAnalysed,
        confidence:  serverCracks/serverAnalysed,
        status:      serverCracks>0 ? 'CRACK' : 'NORMAL',
        isCrack:     serverCracks>0,
        totalFrames: data.totalFrames||0,
        crackFrames: serverCracks,
        elapsed:     data.elapsed||0,
        crackRate:   data.crackRate||0,
        lat:         firstServerCrack?.lat  || null,
        lng:         firstServerCrack?.lon  || null,
        mapsLink:    firstServerCrack?.mapsLink || null,
      };
      try {
        const saved = await api.createEvent(serverEventData);
        const savedId = saved?.event?.eventId || null;
        addEvent({ ...serverEventData, eventId: savedId, timestamp: new Date().toISOString(), hasReport: true });
        if (savedId) {
          try {
            const pdfB64 = await generateVideoPDFBase64();
            await api.attachEventReport(savedId, pdfB64);
          } catch (e5) { console.warn('Attach report failed:', e5); }
        }
      } catch(_) {}
      showToast(data.crackFrames>0 ? `${data.crackFrames} cracks (${data.crackRate}%)` : 'No cracks detected', data.crackFrames>0?'error':'success');
    } catch(e) {
      clearInterval(timerRef.current); setProgress(0);
      showToast(`Analysis failed: ${e.message}`, 'error');
    }
    setServerBusy(false);
  };

  /* ── Play browser-native video ── */
  const playAndDetect = async () => {
    if (!modelLoaded||!videoURL) return;
    const v = videoRef.current;
    if (!v) return;
    v.src = videoURL; v.load();
    try {
      await new Promise((res,rej) => {
        v.oncanplay = res;
        v.onerror   = () => rej(new Error('Video load error'));
        setTimeout(() => rej(new Error('Timeout')), 15000);
      });
      await v.play();
      startClientDetection(v);
    } catch(e) { showToast(`Video error: ${e.message}`, 'error'); }
  };

  /* ── Camera: enumerate + prefer external ── */
  // ── FLIR T1020 Functions ─────────────────────────────────────────────────

  /** Check if the C# bridge + camera are online */
  const checkFlirStatus = useCallback(async () => {
    try {
      const d = await api.flirStatus();
      if (d.connected) {
        setFlirStatus('connected');
        setFlirInfo({ cameraName: d.cameraName, frameCount: d.frameCount });
      } else if (d.bridgeOnline) {
        setFlirStatus('idle');
      } else {
        setFlirStatus('idle');
      }
    } catch (_) {
      setFlirStatus('idle');
    }
  }, []);

  /** Connect to FLIR T1020 via bridge */
  const connectFlir = async () => {
    if (!modelLoaded) { showToast('Load a model first', 'warn'); return; }
    setFlirStatus('connecting');
    try {
      const d = await api.flirConnect();
      if (d.ok) {
        setFlirStatus('connected');
        setFlirInfo({ cameraName: d.camera, frameCount: 0 });
        showToast(`FLIR connected: ${d.camera}`, 'success', 4000);
      } else {
        setFlirStatus('error');
        showToast(`FLIR connect failed: ${d.error}`, 'error', 8000);
      }
    } catch (e) {
      setFlirStatus('error');
      showToast(
        `FLIR bridge unreachable. Ensure flir-service is running (cd flir-service && dotnet run). Error: ${e.message}`,
        'error', 10000
      );
    }
  };

  /** Disconnect FLIR camera */
  const disconnectFlir = async () => {
    flirRunRef.current = false;
    clearTimeout(flirTimerRef.current);
    try { await api.flirDisconnect(); } catch (_) {}
    setFlirStatus('idle');
    setFlirInfo(null);
    setLiveTemp(null);
    setLiveHeading(null);
    showToast('FLIR disconnected', 'info');
  };

  /** Main FLIR frame loop — polls bridge at ~3fps (every 333ms) */
  const flirFrameLoop = useCallback(async () => {
    if (!flirRunRef.current) return;

    try {
      // FLIR T1020 only — no browser GPS sent or used anywhere
      const d = await api.flirPredictFrame({ threshold, img_size: imgSize });

      if (!flirRunRef.current) return;

      if (d.ok) {
        const pC = d.pCrack;
        const pN = d.pNormal;
        const iC = d.isCrack;

        // GPS from FLIR T1020 camera hardware only
        // d.lat / d.lon come from thermalImage.GpsInformation in CameraService.cs
        // null when: indoor, no satellite fix, or GPS module not enabled on camera
        const gps = (d.lat != null && d.lon != null)
          ? { lat: d.lat, lon: d.lon, source: 'camera', isValid: d.gpsIsValid ?? false }
          : null;

        // Temperature — from FLIR T1020 thermal sensor only
        if (d.tempMin !== undefined && d.tempMin !== null) {
          setLiveTemp({ min: d.tempMin, max: d.tempMax, avg: d.tempAvg });
        }
        if (d.heading != null) setLiveHeading(d.heading);

        // Increment frame counter now so it's correct inside the async draw below
        frameCountRef.current += 1;
        const _frameNo = frameCountRef.current;

        // Draw the thermal JPEG frame + prediction overlay onto the FLIR canvas
        const fc = flirCanvasRef.current;
        if (fc && d.jpeg) {
          const img = new Image();
          img.onload = () => {
            // ALWAYS match canvas internal pixels to the JPEG's exact dimensions.
            // This is critical: if canvas.width/height differ from the image,
            // drawImage silently scales and distorts the thermal frame.
            // FLIR T1020 thermal sensor = 1024×768 — canvas must be exactly that.
            const iW = img.naturalWidth  || 1024;
            const iH = img.naturalHeight || 768;
            if (fc.width !== iW || fc.height !== iH) {
              fc.width  = iW;
              fc.height = iH;
            }
            const ctx = fc.getContext('2d');
            // 1. Draw thermal JPEG at exact 1:1 pixel mapping — no scaling, no distortion
            ctx.drawImage(img, 0, 0, iW, iH);
            // 2. Draw prediction overlay at same exact pixel dimensions
            drawFlirOverlay(ctx, iW, iH, pC, pN, iC, gps);

            // Capture crack photo AFTER the frame + overlay are drawn so the
            // saved image matches what's shown on screen
            if (iC) {
              const snap  = capturePhoto();
              const timeS = +(elRef.current).toFixed(2);
              const last  = photosRef.current[photosRef.current.length - 1];
              if (!last || (timeS - last.time_s) >= 2) {
                const photo = {
                  dataURL:   snap,
                  pCrack:    pC,
                  pNormal:   pN,
                  frame:     _frameNo,
                  time_s:    timeS,
                  lat:       gps?.lat ?? null,
                  lon:       gps?.lon ?? null,
                  mapsLink:  gps ? mapsLink(gps.lat, gps.lon) : null,
                  tempAvg:   d.tempAvg,
                };
                photosRef.current = [...photosRef.current, photo];
                setCrackPhotos([...photosRef.current]);
              }
            }
          };
          img.src = 'data:image/jpeg;base64,' + d.jpeg;
        }

        // Update sidebar
        setLivePCrack(pC);
        setLivePNormal(pN);
        setLiveLabel(iC ? 'CRACK' : 'NORMAL');
        if (gps) setLiveGPS({ ...gps, mapsLink: mapsLink(gps.lat, gps.lon) });

        // Record event
        evRef.current = [...evRef.current, iC ? 1 : 0];
        const chartPt = { f: _frameNo, p: pC, crack: iC };
        chartRef.current = [...chartRef.current, chartPt];

        if (evRef.current.length % 3 === 0) {
          setFrameEvents([...evRef.current]);
          setChartPoints([...chartRef.current]);
        }
      }
    } catch (_) { /* ignore single frame errors */ }

    // Schedule next frame — 333ms = ~3fps (FLIR camera outputs 30fps but inference is slow)
    if (flirRunRef.current) {
      flirTimerRef.current = setTimeout(flirFrameLoop, 333);
    }
  }, [threshold, imgSize, drawFlirOverlay, capturePhoto]);

  /** Start FLIR live detection */
  const startFlirDetection = () => {
    if (!modelLoaded) { showToast('Load a model first', 'warn'); return; }
    if (flirStatus !== 'connected') { showToast('Connect FLIR camera first', 'warn'); return; }

    // Reset all session state
    evRef.current = []; chartRef.current = []; photosRef.current = [];
    frameCountRef.current = 0; elRef.current = 0;
    setFrameEvents([]); setChartPoints([]); setCrackPhotos([]);
    setElapsed(0); setDone(false);
    setLivePCrack(null); setLivePNormal(null); setLiveLabel('');
    setLiveTemp(null); setLiveHeading(null);

    flirRunRef.current = true;
    setRunning(true);
    timerRef.current = setInterval(() => { elRef.current++; setElapsed(e => e + 1); }, 1000);

    // Start the polling loop
    flirFrameLoop();
    showToast('FLIR detection started', 'success');
  };

  /** Stop FLIR live detection and save session */
  const stopFlirDetection = useCallback(async () => {
    flirRunRef.current = false;
    clearTimeout(flirTimerRef.current);
    clearInterval(timerRef.current);
    setRunning(false);
    setDone(true);

    const fe = evRef.current;
    const fp = photosRef.current;
    const cf = fe.filter(e => e === 1).length;

    showToast(cf > 0 ? `${cf} cracks detected` : 'No cracks detected', cf > 0 ? 'error' : 'success');

    // Auto-email if opted in
    if (autoEmailsRef.current && autoEmailsRef.current.length>0) {
      const fe2=[...evRef.current], fp2=[...photosRef.current], ch2=[...chartRef.current];
      sendAutoEmail(autoEmailsRef.current, fp2, ch2, fe2);
      autoEmailsRef.current = null;
    }

    // Save to MongoDB
    if (fe.length > 0) {
      try {
        const firstCrack = fp[0] ?? null;
        const eventData = {
          source:      'camera',
          filename:    `FLIR T1020 — ${new Date().toLocaleString()}`,
          model:       modelName || '',
          threshold,
          pCrack:      cf / Math.max(fe.length, 1),
          pNormal:     1 - cf / Math.max(fe.length, 1),
          confidence:  cf / Math.max(fe.length, 1),
          status:      cf > 0 ? 'CRACK' : 'NORMAL',
          isCrack:     cf > 0,
          totalFrames: fe.length,
          crackFrames: cf,
          elapsed:     elRef.current,
          crackRate:   +((cf / Math.max(fe.length, 1)) * 100).toFixed(1),
          lat:         firstCrack?.lat  ?? null,
          lng:         firstCrack?.lon  ?? null,
          mapsLink:    firstCrack ? mapsLink(firstCrack.lat, firstCrack.lon) : null,
        };
        const saved = await api.createEvent(eventData);
        const savedId = saved?.event?.eventId || null;
        if (savedId) {
          addEvent({ ...eventData, eventId: savedId, timestamp: new Date().toISOString(), hasReport: true });
          try {
            const pdfB64 = await generateVideoPDFBase64();
            await api.attachEventReport(savedId, pdfB64);
          } catch (e6) { console.warn('Attach report failed:', e6); }
        }
      } catch (e) { console.warn('FLIR session save failed:', e); }
    }
  }, [showToast, modelName, threshold, addEvent, generateVideoPDFBase64]);

  // ── End FLIR functions ─────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({video:true,audio:false})
        .then(s=>s.getTracks().forEach(t=>t.stop())).catch(()=>{});
      const all  = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter(d=>d.kind==='videoinput');
      setDeviceList(cams); setDevicesLoaded(true);
      if (!cams.length) { showToast('No cameras found','error'); return; }
      const ext = cams.find(d=>{
        const lb=(d.label||'').toLowerCase();
        return !lb.includes('integrated')&&!lb.includes('built-in')&&!lb.includes('facetime')&&!lb.includes('internal');
      });
      const chosen = ext||cams[0];
      setSelectedDevId(chosen.deviceId);
      showToast(`Camera: ${ext?`External — ${chosen.label||'Webcam'}`:`Default — ${chosen.label||'Camera'}`}`, 'info', 3500);
    } catch(e) { showToast(`Cannot list cameras: ${e.message}`,'warn'); }
  }, [showToast]);

  // Small delay helper
  const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /** Acquire getUserMedia, retrying a couple of times if the device reports
   *  "busy" (NotReadableError / TrackStartError). This is common right after
   *  a previous session's stream was stopped — some drivers need a brief
   *  moment to fully release the device back to the OS before it can be
   *  reopened. */
  const _getUserMediaWithRetry = async (constraints, attempts = 3) => {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        lastErr = e;
        if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
          // Device busy/locked — wait and retry
          await _sleep(500 * (i + 1));
          continue;
        }
        throw e; // any other error (permission denied, not found, etc.) — don't retry
      }
    }
    throw lastErr;
  };

  const startCamera = async () => {
    if (!modelLoaded) { showToast('Load a model first','warn'); return; }
    setCamStatus('requesting');
    setCamError('');
    try {
      const vc = selectedDevId
        ? { deviceId:{exact:selectedDevId}, width:{ideal:1280}, height:{ideal:720} }
        : { width:{ideal:1280}, height:{ideal:720} };
      const stream = await _getUserMediaWithRetry({video:vc,audio:false});
      const v = videoRef.current;
      v.srcObject = stream;
      await new Promise((res,rej) => { v.onloadedmetadata=res; setTimeout(()=>rej(new Error('Timeout')),8000); });
      await v.play();
      // Size canvas to match video natural resolution for overlay accuracy
      if (canvasRef.current) {
        canvasRef.current.width  = v.videoWidth  || 640;
        canvasRef.current.height = v.videoHeight || 360;
      }
      setCamStatus('granted');
      startClientDetection(v);
    } catch(e) {
      if (e.name==='OverconstrainedError'||e.name==='NotFoundError') {
        showToast('Selected camera unavailable — trying default','warn');
        try {
          const s2 = await _getUserMediaWithRetry({video:{width:{ideal:1280},height:{ideal:720}},audio:false});
          const v=videoRef.current; v.srcObject=s2;
          await new Promise((res,rej)=>{v.onloadedmetadata=res;setTimeout(()=>rej(new Error('Timeout')),8000);});
          await v.play();
          if(canvasRef.current){canvasRef.current.width=v.videoWidth||640;canvasRef.current.height=v.videoHeight||360;}
          setCamStatus('granted'); startClientDetection(v); return;
        } catch(e2) {
          e = e2; // fall through to error reporting below using the retry's error
        }
      }
      setCamStatus('denied');
      // Distinguish the actual failure reason instead of always
      // showing "Permission denied" — NotReadableError ("Could not start
      // video source") means the OS/driver has the camera locked by
      // another app (or a previous session that didn't release it), NOT
      // a browser permission problem, and re-granting permission won't help.
      const reasons = {
        NotAllowedError:  'Permission denied. Click the camera icon in the address bar to allow access.',
        NotReadableError: 'Camera is busy / locked by another app (or a previous session). ' +
                           'Close other apps using this camera (Windows Camera, Teams, Zoom, the FLIR bridge if this is the same USB device), ' +
                           'then click Rescan and Start Detection again.',
        TrackStartError:  'Camera could not start (device busy). Try Rescan, or unplug/replug the camera.',
        OverconstrainedError: 'Requested resolution/device not supported by this camera.',
        NotFoundError:    'No camera found. Click Rescan.',
      };
      const msg = reasons[e.name] || e.message || 'Unknown camera error';
      setCamError(msg);
      showToast(`Camera: ${msg}`, 'error', 8000);
    }
  };
  const stopCamera = () => { stopClientDetection(); setCamStatus('idle'); setCamError(''); };


  /* ── File picker ── */
  const handleVideoFile = (f) => {
    if (!f) return;
    if (videoURL) URL.revokeObjectURL(videoURL);
    const url = URL.createObjectURL(f);
    const ext  = getExt(f.name);
    const native = BROWSER_NATIVE.has(ext);
    setVideoFile(f); setVideoURL(url);
    setVideoReady(false); setDone(false);
    setFrameEvents([]); setChartPoints([]); setCrackPhotos([]); setElapsed(0); setProgress(0);
    evRef.current=[]; chartRef.current=[]; photosRef.current=[];
    if (!native) {
      setUseServer(true); setVideoReady(true);
      showToast(`${ext.toUpperCase()} → server-side analysis (OpenCV)`,'info',3000);
      return;
    }
    setUseServer(false);
    const tmp = document.createElement('video');
    tmp.preload='metadata'; tmp.src=url;
    tmp.oncanplay = () => setVideoReady(true);
    tmp.onerror   = () => { setUseServer(true); setVideoReady(true); showToast(`Browser cannot decode — switching to server`,'warn'); };
  };

  /* ── Switch mode ── */
  const switchMode = (m) => {
    if (running||serverBusy) return;
    if (runRef.current) stopClientDetection();
    setMode(m); setDone(false); setCamStatus('idle'); setProgress(0);
    setFrameEvents([]); setChartPoints([]); setCrackPhotos([]); setElapsed(0);
    setLivePCrack(null); setLivePNormal(null); setLiveLabel('');
    evRef.current=[]; chartRef.current=[]; photosRef.current=[];
    if (videoRef.current?.srcObject) { videoRef.current.srcObject.getTracks().forEach(t=>t.stop()); videoRef.current.srcObject=null; }
    if (videoURL) { URL.revokeObjectURL(videoURL); setVideoURL(null); }
    setVideoFile(null); setVideoReady(false); setUseServer(false);
  };

  /* ── PDF download ── */
  const downloadPDF = async () => {
    const tot    = totalFrames || frameCountRef.current;
    const cracks = frameEvents.filter(e=>e===1).length;
    try {
      await generateVideoPDF({
        filename: videoFile?.name||(mode==='camera'?'Live Camera':mode==='flir'?'FLIR T1020':'video'),
        modelName, threshold,
        chartPoints: [...chartRef.current],
        crackPhotos: [...photosRef.current],
        elapsed, totalFrames: tot, crackFrames: cracks,
      });
      showToast('PDF report downloaded','success');
    } catch(e) {
      showToast('PDF generation failed: '+e.message,'error');
    }
  };

  /* ── Open email modal and generate PDF attachment in background ── */
  const openEmailModal = async () => {
    setPdfBase64(null);
    setEmailOpen(true);
    try {
      const b64 = await generateVideoPDFBase64();
      setPdfBase64(b64);
    } catch(e) { console.warn('PDF for email failed:', e); }
  };

  /* ── Send auto email after detection (called from stopClientDetection) ── */
  const sendAutoEmail = async (emails, cp, ch, fe) => {
    if (!emails || emails.length === 0) return;
    try {
      const cf       = fe.filter(e=>e===1).length;
      const analysed = fe.length;
      const fname    = videoFile?.name || (mode==='camera' ? 'Live Camera Session' : 'FLIR T1020 Session');

      // Use the SAME generateVideoPDF function as the download button
      // by passing returnBase64:true — guarantees identical PDF format
      const b64 = await generateVideoPDF({
        filename:     fname,
        modelName,
        threshold,
        chartPoints:  ch,
        crackPhotos:  cp,
        elapsed:      elRef.current,
        totalFrames:  analysed,
        crackFrames:  cf,
        returnBase64: true,       // ← returns datauristring instead of triggering download
      });

      const firstCrack = cp[0];
      await api.sendEmail({
        recipients: emails,
        pdfBase64:  b64,
        data: {
          source:      mode==='camera' ? 'camera' : mode==='flir' ? 'camera' : 'video',
          filename:    fname,
          model:       modelName || '',
          threshold,
          pCrack:      cf / Math.max(analysed, 1),
          pNormal:     1 - cf / Math.max(analysed, 1),
          label:       cf > 0 ? 'CRACK' : 'NORMAL',
          isCrack:     cf > 0,
          lat:         firstCrack?.lat  ?? null,
          lon:         firstCrack?.lon  ?? null,
          mapsLink:    firstCrack?.mapsLink ?? null,
          timestamp:   new Date().toISOString(),
          crackFrames: cf,
          totalFrames: analysed,
          elapsed:     elRef.current,
        },
      });

      showToast('📧 Report emailed to ' + emails.join(', '), 'success', 5000);
    } catch (e) {
      showToast('Email failed: ' + e.message, 'error');
      console.error('Auto-email error:', e);
    }
  };

  /* ── Derived ── */
  const crackCnt  = frameEvents.filter(e=>e===1).length;
  const analysed  = frameEvents.length;
  const crackRate = analysed>0 ? ((crackCnt/analysed)*100).toFixed(1) : '0.0';
  const hasCrack  = crackCnt > 0;
  const showCanvas = running || done;
  const isWorking  = running || serverBusy;

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>

      {/* Mode tabs */}
      <div style={{display:'flex',borderRadius:'var(--r-md)',overflow:'hidden',border:'1px solid var(--border)',width:'fit-content'}}>
        {[['upload','📁 Upload Video'],['camera','📷 Live Camera'],['flir','🌡 FLIR T1020']].map(([m,lb])=>(
          <button key={m} onClick={()=>switchMode(m)} disabled={isWorking}
            style={{padding:'10px 24px',border:'none',cursor:isWorking?'not-allowed':'pointer',background:mode===m?'var(--navy)':'var(--surface)',color:mode===m?'#fff':'var(--text-2)',fontWeight:600,fontSize:13,fontFamily:'var(--font-b)',transition:'all .2s'}}>
            {lb}
          </button>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'270px 1fr',gap:24,alignItems:'start'}}>

        {/* ══════ LEFT ══════ */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {!modelLoaded&&<div style={{padding:'10px 14px',background:'var(--warn-bg)',border:'1px solid var(--warn-br)',borderRadius:'var(--r-sm)',fontSize:12,color:'var(--warn)'}}>Load a model in <b>Model Manager</b> first</div>}

          {/* Upload card */}
          {mode==='upload'&&(
            <Card title="Upload Video">
              <input ref={fileRef} type="file" accept="video/*" style={{display:'none'}} onChange={e=>handleVideoFile(e.target.files?.[0])}/>
              <div onClick={()=>{if(!isWorking)fileRef.current?.click();}}
                style={{border:`2px dashed ${videoFile?'var(--success)':'var(--border)'}`,borderRadius:'var(--r-md)',padding:14,textAlign:'center',cursor:isWorking?'not-allowed':'pointer',background:videoFile?'var(--success-bg)':'var(--bg)',marginBottom:10}}>
                {videoFile?(
                  <div>
                    <div style={{fontSize:22,marginBottom:3}}>🎬</div>
                    <p style={{fontWeight:700,color:'var(--success)',margin:'0 0 2px',fontSize:12}}>{videoFile.name}</p>
                    <p style={{fontSize:11,color:'var(--text-m)'}}>{(videoFile.size/1e6).toFixed(1)} MB</p>
                  </div>
                ):(
                  <div>
                    <div style={{fontSize:26,marginBottom:5,opacity:0.35}}>🎥</div>
                    <p style={{fontSize:13,fontWeight:600,color:'var(--text)',margin:0}}>Click to upload video</p>
                    <p style={{fontSize:11,color:'var(--text-m)',marginTop:2}}>MP4 · AVI · MOV · MPG · MKV · WMV</p>
                  </div>
                )}
              </div>
              {videoFile&&(
                <div style={{fontSize:11,padding:'4px 8px',borderRadius:'var(--r-sm)',marginBottom:8,background:useServer?'rgba(0,48,135,.08)':'var(--success-bg)',color:useServer?'var(--navy)':'var(--success)',border:`1px solid ${useServer?'var(--border)':'var(--success-br)'}`,textAlign:'center'}}>
                  {useServer?'📡 Server-side (Flask+OpenCV)':'🖥 Browser-native playback'}
                </div>
              )}
              {!isWorking?(
                <Button variant="primary" onClick={()=>{preRunCbRef.current=useServer?runServerAnalysis:playAndDetect;setPreRunCtx('video');setPreRunOpen(true);}} disabled={!modelLoaded||!videoReady} fullWidth>
                  {useServer?'▶ Analyse on Server':'▶ Play & Detect'}
                </Button>
              ):(
                <Button variant="danger" onClick={stopClientDetection} disabled={serverBusy} fullWidth>
                  {serverBusy?<><Spinner size={13} color="#fff"/>&nbsp;Analysing…</>:'⏹ Stop'}
                </Button>
              )}
              {serverBusy&&(
                <div style={{marginTop:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:2}}>
                    <span style={{color:'var(--text-m)'}}>Flask+OpenCV analysing…</span>
                    <span style={{fontWeight:700}}>{progress}%</span>
                  </div>
                  <div style={{height:4,background:'var(--border-s)',borderRadius:2}}>
                    <div style={{width:`${progress}%`,height:'100%',background:'var(--navy)',borderRadius:2,transition:'width .4s ease'}}/>
                  </div>
                  <p style={{fontSize:10,color:'var(--text-m)',marginTop:2}}>Elapsed: {elapsed}s</p>
                </div>
              )}
            </Card>
          )}

          {/* Camera card */}
          {mode==='camera'&&(
            <Card title="Live Camera">
              {!running&&(
                <div style={{marginBottom:10}}>
                  {!devicesLoaded?(
                    <Button variant="ghost" size="sm" onClick={loadDevices} fullWidth style={{marginBottom:6}}>🔍 Detect Cameras</Button>
                  ):(
                    <div style={{marginBottom:8}}>
                      <p style={{fontSize:11,color:'var(--text-m)',marginBottom:3,fontWeight:600}}>Select Camera:</p>
                      <select value={selectedDevId} onChange={e=>setSelectedDevId(e.target.value)}
                        style={{width:'100%',padding:'5px 7px',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:12,background:'var(--surface)',color:'var(--text)'}}>
                        {deviceList.map((d,i)=>{
                          const lb=(d.label||'').toLowerCase();
                          const tag=lb.includes('integrated')||lb.includes('built-in')?'[Built-in]':'[External]';
                          return<option key={d.deviceId||i} value={d.deviceId}>{(d.label||`Camera ${i+1}`)+' '+tag}</option>;
                        })}
                      </select>
                      <p style={{fontSize:10,color:'var(--text-m)',marginTop:2}}>{deviceList.length} camera(s) — external preferred</p>
                    </div>
                  )}
                </div>
              )}
              <div style={{textAlign:'center',marginBottom:8}}>
                {camStatus==='idle'&&!devicesLoaded&&<p style={{fontSize:12,color:'var(--text-m)',padding:'6px 0'}}>Click Detect Cameras first</p>}
                {camStatus==='idle'&&devicesLoaded&&<p style={{fontSize:12,color:'var(--text-m)',padding:'6px 0'}}>Camera ready</p>}
                {camStatus==='requesting'&&<p style={{fontSize:12,color:'var(--text-m)'}}>Connecting…</p>}
                {camStatus==='granted'&&running&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'4px 0'}}><span style={{width:7,height:7,borderRadius:'50%',background:'var(--danger)',animation:'pulse 1s infinite',display:'inline-block'}}/><span style={{fontSize:12,fontWeight:700,color:'var(--danger)'}}>LIVE</span></div>}
                {camStatus==='denied'&&<p style={{fontSize:12,color:'var(--danger)',lineHeight:1.4}}>{camError||'Permission denied.'}</p>}
              </div>
              {!running
                ?<Button variant="primary"  onClick={()=>{preRunCbRef.current=startCamera;setPreRunCtx('camera');setPreRunOpen(true);}} disabled={!modelLoaded} fullWidth>▶ Start Detection</Button>
                :<Button variant="danger"   onClick={stopCamera}  fullWidth>⏹ Stop</Button>}
              {!running&&devicesLoaded&&<button onClick={loadDevices} style={{marginTop:6,width:'100%',background:'none',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'4px 0',fontSize:11,color:'var(--text-m)',cursor:'pointer'}}>↺ Rescan</button>}

              {/* Temperature — only shown when FLIR T1020 is connected via USB (provides real thermal data) */}
              {liveTemp&&(
                <div style={{borderTop:'1px solid var(--border-s)',paddingTop:8,marginTop:8}}>
                  <p style={{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:6}}>🌡 Temperature (°C)</p>
                  {[['Min',liveTemp.min,'var(--navy)'],['Avg',liveTemp.avg,'var(--saffron)'],['Max',liveTemp.max,'var(--danger)']].map(([l,val,c])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:11,color:'var(--text-2)'}}>{l}</span>
                      <span style={{fontSize:12,fontWeight:700,color:c}}>{val?.toFixed(1)}°C</span>
                    </div>
                  ))}
                </div>
              )}

              {/* GPS — only shown when FLIR T1020 provides coordinates via USB */}
              {liveGPS&&(
                <div style={{borderTop:'1px solid var(--border-s)',paddingTop:6,marginTop:6}}>
                  <p style={{fontSize:10,fontWeight:700,color:'var(--text)',margin:'0 0 3px'}}>📡 Camera GPS</p>
                  <p style={{fontSize:11,fontFamily:'monospace',color:'var(--success)',fontWeight:700,margin:'0 0 3px'}}>
                    {liveGPS.lat.toFixed(6)}, {liveGPS.lon.toFixed(6)}
                  </p>
                  {liveHeading!=null&&<p style={{fontSize:10,color:'var(--text-m)',margin:'0 0 4px'}}>🧭 {liveHeading}°</p>}
                  <a href={mapsLink(liveGPS.lat,liveGPS.lon)} target="_blank" rel="noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:3,background:'#4285F4',color:'#fff',padding:'3px 8px',borderRadius:'var(--r-sm)',fontSize:10,fontWeight:700,textDecoration:'none'}}>
                    🗺 Open Maps ↗
                  </a>
                </div>
              )}
            </Card>
          )}

          {/* FLIR T1020 card */}
          {mode==='flir'&&(
            <Card title="🌡 FLIR T1020 Thermal Camera">
              {/* Connection status */}
              <div style={{marginBottom:10}}>
                {flirStatus==='idle'&&(
                  <div>
                    <p style={{fontSize:12,color:'var(--text-m)',marginBottom:8}}>
                      Connect the camera via Wi-Fi (AP mode) then click Connect.
                    </p>
                    <Button variant="primary" onClick={connectFlir} disabled={!modelLoaded} fullWidth>
                      📡 Connect to FLIR T1020
                    </Button>
                  </div>
                )}
                {flirStatus==='connecting'&&(
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0'}}>
                    <Spinner size={16}/>
                    <span style={{fontSize:12}}>Discovering camera on Wi-Fi…</span>
                  </div>
                )}
                {flirStatus==='connected'&&!running&&(
                  <div>
                    <div style={{background:'var(--success-bg)',border:'1px solid var(--success-br)',borderRadius:'var(--r-sm)',padding:'8px 12px',marginBottom:8}}>
                      <p style={{margin:0,fontSize:12,fontWeight:700,color:'var(--success)'}}>✅ {flirInfo?.cameraName||'FLIR T1020'} Connected</p>
                      <p style={{margin:'3px 0 0',fontSize:11,color:'var(--text-m)'}}>
                        {flirInfo?.frameCount||0} frames received
                      </p>
                    </div>
                    <Button variant="primary" onClick={()=>{preRunCbRef.current=startFlirDetection;setPreRunCtx('camera');setPreRunOpen(true);}} disabled={!modelLoaded} fullWidth style={{marginBottom:6}}>
                      ▶ Start Detection
                    </Button>
                    <button onClick={disconnectFlir}
                      style={{width:'100%',background:'none',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'4px 0',fontSize:11,color:'var(--text-m)',cursor:'pointer'}}>
                      Disconnect
                    </button>
                  </div>
                )}
                {flirStatus==='connected'&&running&&(
                  <div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'6px 0',marginBottom:8}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:'var(--danger)',animation:'pulse 1s infinite',display:'inline-block'}}/>
                      <span style={{fontSize:13,fontWeight:700,color:'var(--danger)'}}>FLIR LIVE</span>
                    </div>
                    <Button variant="danger" onClick={stopFlirDetection} fullWidth>⏹ Stop Detection</Button>
                  </div>
                )}
                {flirStatus==='error'&&(
                  <div>
                    <p style={{fontSize:12,color:'var(--danger)',marginBottom:8}}>Connection failed. Ensure FLIR Wi-Fi is enabled and bridge is running.</p>
                    <Button variant="secondary" onClick={connectFlir} fullWidth>↺ Retry</Button>
                  </div>
                )}
              </div>

              {/* Temperature live display */}
              {liveTemp&&(
                <div style={{borderTop:'1px solid var(--border-s)',paddingTop:8,marginTop:4}}>
                  <p style={{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:6}}>🌡 Temperature (°C)</p>
                  {[['Min',liveTemp.min,'var(--navy)'],['Avg',liveTemp.avg,'var(--saffron)'],['Max',liveTemp.max,'var(--danger)']].map(([l,v,c])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:11,color:'var(--text-2)'}}>{l}</span>
                      <span style={{fontSize:12,fontWeight:700,color:c}}>{v?.toFixed(1)}°C</span>
                    </div>
                  ))}
                </div>
              )}

              {/* GPS — FLIR T1020 camera hardware GPS only */}
              <div style={{marginTop:6,borderTop:'1px solid var(--border-s)',paddingTop:6}}>
                {liveGPS
                  ? <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,flexWrap:'wrap'}}>
                      <div style={{fontSize:10,color:'var(--text-m)'}}>
                        <div>
                          📡{' '}
                          <b style={{fontFamily:'monospace',color:'var(--success)'}}>{liveGPS.lat.toFixed(6)}</b>
                          {', '}
                          <b style={{fontFamily:'monospace',color:'var(--success)'}}>{liveGPS.lon.toFixed(6)}</b>
                        </div>
                        <div style={{fontSize:9,color:'var(--text-m)',marginTop:1}}>
                          FLIR T1020 camera GPS{liveGPS.isValid ? ' ✓' : ' (no satellite fix yet)'}
                        </div>
                        {liveHeading!=null&&<div style={{marginTop:1,fontSize:10}}>🧭 {liveHeading}°</div>}
                      </div>
                      <a href={mapsLink(liveGPS.lat,liveGPS.lon)} target="_blank" rel="noreferrer"
                        style={{
                          display:'inline-flex',alignItems:'center',gap:3,flexShrink:0,
                          background:'#4285F4',color:'#fff',padding:'4px 8px',
                          borderRadius:'var(--r-sm)',fontSize:10,fontWeight:700,textDecoration:'none',
                        }}>
                        🗺 Open Maps ↗
                      </a>
                    </div>
                  : <p style={{fontSize:10,color:'var(--text-m)',margin:0}}>
                      📍 GPS: not available (camera needs outdoor satellite fix)
                    </p>
                }
              </div>
            </Card>
          )}

          {/* ── Inference Settings ── same controls as Image Analysis so the
               user can tune threshold and resize without switching tabs.
               These write to AppContext so changes are shared globally. */}
          <Card title="Inference Settings">
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Crack Threshold</span>
                <span style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-h)',color:'var(--navy)'}}>{threshold.toFixed(2)}</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={threshold}
                onChange={e => setThreshold(parseFloat(e.target.value))}
                style={{width:'100%',accentColor:'var(--navy)',cursor:'pointer'}}/>
              <p style={{fontSize:11,color:'var(--text-m)',marginTop:4}}>
                P(crack) ≥ {threshold.toFixed(2)} → CRACK &nbsp;·&nbsp; Recommended: 0.38 – 0.50
              </p>
            </div>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Image Resize</span>
                <span style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-h)',color:'var(--navy)'}}>{imgSize} × {imgSize}</span>
              </div>
              <input type="range" min={128} max={512} step={32} value={imgSize}
                onChange={e => setImgSize(parseInt(e.target.value))}
                style={{width:'100%',accentColor:'var(--navy)',cursor:'pointer'}}/>
              <p style={{fontSize:11,color:'var(--text-m)',marginTop:4}}>Default 224 × 224. Must match your model's training size.</p>
            </div>
          </Card>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <Stat label="Analysed"  value={analysed}         color="var(--navy)"/>
            <Stat label="Cracks"    value={crackCnt}          color={hasCrack?'var(--danger)':'var(--success)'}/>
            <Stat label="Rate"      value={`${crackRate}%`}   color={parseFloat(crackRate)>20?'var(--danger)':'var(--success)'}/>
            <Stat label="Elapsed"   value={`${elapsed}s`}     color="var(--text-m)"/>
          </div>

          {crackPhotos.length>0&&<div style={{padding:'8px 12px',background:'var(--danger-bg)',border:'1px solid var(--danger-br)',borderRadius:'var(--r-sm)',fontSize:12,color:'var(--danger)',fontWeight:600}}>📸 {crackPhotos.length} crack photo(s)</div>}
          {done&&<Button variant={hasCrack?'danger':'success'} onClick={downloadPDF} fullWidth>🖨 PDF Report{crackPhotos.length>0?` (${crackPhotos.length} photos)`:''}</Button>}
        </div>

        {/* ══════ RIGHT ══════ */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>

          {/* Video canvas — VISIBLE and playing */}
          <Card title={mode==='camera'?'Live Camera Feed':mode==='flir'?'FLIR T1020 Thermal Feed':'Video Analysis'}
            headerRight={running?<span style={{fontSize:11,fontWeight:700,color:'var(--danger)',animation:'pulse 2s infinite'}}>● {mode==='camera'||mode==='flir'?'LIVE':'ANALYSING'}</span>:done?<span style={{fontSize:11,fontWeight:700,color:'var(--success)'}}>✓ Complete</span>:null}>
            <div style={{position:'relative',background:'#0d1117',borderRadius:'var(--r-sm)',overflow:'hidden'}}>
              {/* Video element VISIBLE — user sees actual moving video */}
              <video ref={videoRef}
                style={{width:'100%',maxHeight:460,display:running&&!useServer&&mode!=='flir'?'block':'none',objectFit:'contain'}}
                muted playsInline preload="auto" onEnded={stopClientDetection}/>
              {/* Canvas overlaid — draws prediction overlay ONLY, semi-transparent top/bottom bars */}
              <canvas ref={canvasRef}
                style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',display:running&&!useServer&&mode!=='flir'?'block':'none',pointerEvents:'none'}}/>
              
              {/* Live P(crack) / P(normal) / GPS floating overlay — top-right corner, does NOT interfere with video capture */}
              {(running||done)&&livePCrack!==null&&(
                <div style={{position:'absolute',top:10,right:10,width:300,background:liveLabel==='CRACK'?'var(--danger-bg)':'var(--success-bg)',border:`2px solid ${liveLabel==='CRACK'?'var(--danger-br)':'var(--success-br)'}`,borderRadius:'var(--r-md)',padding:'10px 12px',zIndex:10,backdropFilter:'blur(8px)',boxShadow:'0 4px 16px rgba(0,0,0,0.3)'}}>
                  <p style={{fontWeight:800,fontSize:12,fontFamily:'var(--font-h)',margin:'0 0 8px',color:liveLabel==='CRACK'?'var(--danger)':'var(--success)'}}>
                    {liveLabel==='CRACK'?'⚠ CRACK':'✓ NORMAL'}
                  </p>
                  {[['P(Crack)',livePCrack,'var(--danger)'],['P(Normal)',livePNormal,'var(--success)']].map(([l,v,c])=>(
                    <div key={l} style={{marginBottom:5}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:1}}>
                        <span style={{color:'var(--text-2)'}}>{l}</span>
                        <span style={{fontWeight:700,color:c}}>{v!==null?(v*100).toFixed(2)+'%':'—'}</span>
                      </div>
                      <div style={{height:5,background:'var(--border-s)',borderRadius:2,overflow:'hidden'}}>
                        <div style={{width:`${(v||0)*100}%`,height:'100%',background:c,borderRadius:2,transition:'width .15s ease'}}/>
                      </div>
                    </div>
                  ))}
                  {/* GPS Information */}
                  {liveGPS&&(
                    <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border-s)',fontSize:10}}>
                      <div style={{color:'var(--text-2)',marginBottom:2}}>📍 <b>GPS Location</b></div>
                      <div style={{fontSize:9,fontFamily:'monospace',color:'var(--text-m)',marginBottom:2}}>
                        <div>{liveGPS.lat.toFixed(6)}</div>
                        <div>{liveGPS.lon.toFixed(6)}</div>
                      </div>
                      {liveGPS.mapsLink&&(
                        <a href={liveGPS.mapsLink} target="_blank" rel="noreferrer" style={{display:'inline-block',background:'#4285F4',color:'#fff',padding:'2px 6px',borderRadius:3,fontSize:9,fontWeight:700,textDecoration:'none',marginBottom:3}}>🗺 Google Maps ↗</a>
                      )}
                      <div style={{fontSize:8,color:'var(--text-m)',marginTop:3,fontStyle:'italic'}}>
                        {mode==='flir'?'📡 FLIR T1020 GPS metadata':'🌍 Browser geolocation'}
                      </div>
                    </div>
                  )}
                  {!liveGPS&&(
                    <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border-s)',fontSize:9,color:'var(--text-m)',fontStyle:'italic'}}>
                      📍 GPS not available
                    </div>
                  )}
                </div>
              )}
              {/* FLIR T1020 live canvas — correct aspect ratio display.
                  NOTE: objectFit does NOT work on <canvas> elements (only on <img>/<video>).
                  Fix: wrap in a 4:3 aspect-ratio container (1024×768 = 4:3) so the canvas
                  fills it exactly — no distortion, no cropping, exact FLIR frame shown. */}
              {mode==='flir' && (running||done) && (
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4 / 3',   // FLIR T1020 thermal sensor is 1024×768 = 4:3
                  background: '#000',
                  overflow: 'hidden',
                }}>
                  <canvas
                    ref={flirCanvasRef}
                    style={{
                      position: 'absolute',
                      top: 0, left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'block',
                    }}
                  />
                </div>
              )}
              {/* FLIR idle state */}
              {mode==='flir' && !running && !done && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:260,color:'rgba(255,255,255,.35)',padding:20,textAlign:'center'}}>
                  <div style={{fontSize:48,marginBottom:10}}>🌡</div>
                  <p style={{fontSize:13}}>
                    {flirStatus==='connected' ? 'Click Start Detection to begin' : 'Connect FLIR T1020 on the left'}
                  </p>
                </div>
              )}
              {/* Server-side busy: show the video file playing visually while Flask analyses */}
              {serverBusy&&videoURL&&(
                <div style={{position:'relative',width:'100%'}}>
                  <video
                    src={videoURL}
                    autoPlay loop muted playsInline
                    style={{width:'100%',maxHeight:460,objectFit:'contain',display:'block',opacity:0.65}}
                  />
                  {/* Overlay progress indicator on top of playing video */}
                  <div style={{position:'absolute',top:0,left:0,right:0,padding:'10px 14px',background:'rgba(0,48,135,0.88)',display:'flex',alignItems:'center',gap:12}}>
                    <Spinner size={18} color="#fff"/>
                    <div>
                      <p style={{fontSize:13,fontWeight:700,color:'#fff',margin:0}}>
                        Flask ML (OpenCV) analysing: {videoFile?.name}
                      </p>
                      <p style={{fontSize:11,color:'rgba(255,255,255,.7)',margin:0}}>
                        Elapsed: {elapsed}s — results appear after full analysis
                      </p>
                    </div>
                    <div style={{marginLeft:'auto',background:'rgba(255,255,255,.1)',borderRadius:20,padding:'3px 12px',fontSize:11,color:'rgba(255,255,255,.8)'}}>
                      {progress}%
                    </div>
                  </div>
                  {/* Progress bar at bottom */}
                  <div style={{position:'absolute',bottom:0,left:0,right:0,height:4,background:'rgba(255,255,255,.15)'}}>
                    <div style={{height:'100%',background:'var(--saffron)',width:`${progress}%`,transition:'width .5s ease'}}/>
                  </div>
                </div>
              )}
              {/* Done with server analysis — show result thumbnail grid placeholder */}
              {!running&&!serverBusy&&done&&useServer&&(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:200,color:'rgba(255,255,255,.55)'}}>
                  <div style={{fontSize:44,marginBottom:10}}>{hasCrack?'⚠':'✓'}</div>
                  <p style={{fontSize:14,fontWeight:700,color:hasCrack?'#f87171':'#4ade80'}}>
                    {hasCrack?`${crackCnt} crack frames detected`:'No cracks detected'}
                  </p>
                  <p style={{fontSize:11,marginTop:4,color:'rgba(255,255,255,.3)'}}>See crack photos below · Download PDF report</p>
                </div>
              )}
              {/* Idle state (upload / webcam modes) */}
              {mode!=='flir'&&!running&&!serverBusy&&!done&&(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:260,color:'rgba(255,255,255,.35)',padding:20,textAlign:'center'}}>
                  <div style={{fontSize:48,marginBottom:10}}>{mode==='camera'?'📷':'🎬'}</div>
                  <p style={{fontSize:13}}>
                    {mode==='upload'&&!videoFile&&'Upload a video file on the left'}
                    {mode==='upload'&&videoFile&&!videoReady&&'Loading video…'}
                    {mode==='upload'&&videoFile&&videoReady&&!useServer&&'Click Play & Detect to start'}
                    {mode==='upload'&&videoFile&&videoReady&&useServer&&'Click Analyse on Server to start'}
                    {mode==='camera'&&'Click Start Detection on the left'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Post-analysis verdict */}
          {done&&(
            <div style={{padding:'14px 18px',borderRadius:'var(--r-md)',display:'flex',alignItems:'center',gap:14,background:hasCrack?'var(--danger-bg)':'var(--success-bg)',border:`2px solid ${hasCrack?'var(--danger-br)':'var(--success-br)'}`,animation:'fadeUp .4s ease'}}>
              <span style={{fontSize:32}}>{hasCrack?'⚠':'✓'}</span>
              <div style={{flex:1}}>
                <p style={{fontWeight:800,fontSize:16,fontFamily:'var(--font-h)',margin:'0 0 2px',color:hasCrack?'var(--danger)':'var(--success)'}}>
                  {hasCrack?`${crackCnt} crack frame(s) · ${crackPhotos.length} photo(s) captured`:'No Defects Found'}
                </p>
                <p style={{fontSize:12,color:'var(--text-2)',margin:0}}>
                  {analysed} frames · {elapsed}s · rate: {crackRate}%{hasCrack?' · Maintenance recommended':' · Track safe'}
                </p>
              </div>
              <div style={{display:'flex',gap:6}}>
                <Button variant={hasCrack?'danger':'success'} size="sm" onClick={downloadPDF}>🖨 Download PDF</Button>
                <Button variant="secondary" size="sm" onClick={openEmailModal}>📧 Email Report</Button>
              </div>
            </div>
          )}

          {/* P(crack) line chart — LIVE and dynamic */}
          <Card title="P(crack) vs Frame"
            subtitle={chartPoints.length>0?`${chartPoints.length} data points · ${crackCnt} crack detections`:'Updates as video plays'}
            headerRight={
              <div style={{display:'flex',gap:12,fontSize:11}}>
                <span style={{display:'flex',gap:4,alignItems:'center'}}><span style={{width:8,height:8,borderRadius:'50%',background:'var(--danger)',display:'inline-block'}}/>Crack</span>
                <span style={{display:'flex',gap:4,alignItems:'center'}}><span style={{width:8,height:8,background:'var(--saffron)',display:'inline-block'}}/>Threshold</span>
              </div>
            }>
            <ProbChart points={chartPoints}/>
          </Card>

          {/* Crack photos grid — 2x2 grid with red borders, GPS map icon */}
          {crackPhotos.length>0&&(
            <Card title={`🔴 Crack Photos (${crackPhotos.length})`} subtitle="Captured at crack detection · 4 per PDF page (2×2 with borders)">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                {crackPhotos.map((ph,i)=>(
                  <div key={i} style={{
                    background:'var(--surface)',
                    border:'2.5px solid var(--danger)',
                    borderRadius:'var(--r-sm)',
                    overflow:'hidden',
                    boxShadow:'0 2px 10px rgba(204,31,31,0.18)'
                  }}>
                    {/* Photo */}
                    {ph.dataURL
                      ? <img src={ph.dataURL} alt={`Crack #${i+1}`} style={{width:'100%',height:'auto',display:'block',background:'#000',objectFit:'contain'}}/>
                      : <div style={{width:'100%',height:180,background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>📷</div>
                    }
                    {/* Info strip */}
                    <div style={{padding:'7px 9px',background:'rgba(204,31,31,0.07)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                        <span style={{fontSize:11,fontWeight:800,color:'var(--danger)'}}>
                          #{i+1} · Frame {ph.frame}
                        </span>
                        <span style={{fontSize:10,fontWeight:700,color:'var(--danger)',background:'rgba(204,31,31,0.1)',padding:'1px 5px',borderRadius:3}}>
                          {(ph.pCrack*100).toFixed(1)}%
                        </span>
                      </div>
                      <p style={{fontSize:10,color:'var(--text-2)',margin:'0 0 3px'}}>
                        ⏱ {ph.time_s}s
                        {ph.tempAvg!=null&&<span style={{marginLeft:6}}>🌡 {ph.tempAvg?.toFixed(1)}°C</span>}
                      </p>
                      {/* GPS with Google Maps link icon */}
                      {ph.lat!=null
                        ? <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--text-m)'}}>
                            <span>📍 {ph.lat.toFixed(5)}, {ph.lon.toFixed(5)}</span>
                            {ph.mapsLink&&
                              <a href={ph.mapsLink} target="_blank" rel="noreferrer"
                                title="Open exact crack location on Google Maps"
                                style={{
                                  display:'inline-flex',alignItems:'center',gap:2,
                                  background:'#4285F4',color:'#fff',
                                  borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700,
                                  textDecoration:'none',flexShrink:0
                                }}>
                                🗺 Maps ↗
                              </a>
                            }
                          </div>
                        : <span style={{fontSize:10,color:'var(--text-m)'}}>📍 GPS not available</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Pre-run email prompt — asks before every detection */}
      <PreRunEmailPrompt
        isOpen={preRunOpen}
        onClose={() => { setPreRunOpen(false); preRunCbRef.current = null; }}
        context={preRunCtx}
        onConfirm={(emails) => {
          autoEmailsRef.current = emails;   // null = no email, array = send to these
          setPreRunOpen(false);
          // Call the detection function that was stored before opening the prompt
          const cb = preRunCbRef.current;
          preRunCbRef.current = null;
          if (cb) cb();
        }}
      />

      {/* Email report modal — manual send after detection */}
      <EmailModal
        isOpen={emailOpen}
        onClose={() => setEmailOpen(false)}
        showToast={showToast}
        data={{
          source: mode === 'camera' ? 'camera' : mode === 'flir' ? 'camera' : 'video',
          filename: videoFile?.name || (mode === 'camera' ? 'Live Camera Session' : 'FLIR T1020 Session'),
          model: modelName || '',
          threshold,
          pCrack:   frameEvents.filter(e=>e===1).length / Math.max(frameEvents.length,1),
          pNormal:  frameEvents.filter(e=>e===0).length / Math.max(frameEvents.length,1),
          label:    frameEvents.filter(e=>e===1).length > 0 ? 'CRACK' : 'NORMAL',
          isCrack:  frameEvents.filter(e=>e===1).length > 0,
          lat:      crackPhotos[0]?.lat || null,
          lon:      crackPhotos[0]?.lon || null,
          mapsLink: crackPhotos[0]?.mapsLink || null,
          timestamp: new Date().toISOString(),
          crackFrames: frameEvents.filter(e=>e===1).length,
          totalFrames: frameEvents.length,
          elapsed,
        }}
        pdfBase64={pdfBase64}
      />
    </div>
  );
}