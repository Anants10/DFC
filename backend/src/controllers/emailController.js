/**
 * emailController.js
 *
 * Sends crack detection reports by email using Nodemailer.
 *
 * WHAT IT DOES:
 *   POST /api/email/send
 *   - Accepts a list of recipient email addresses
 *   - Accepts the detection result data (pCrack, pNormal, label, GPS, etc.)
 *   - Accepts an optional base64-encoded PDF attachment
 *   - Builds a styled HTML email body
 *   - Sends via SMTP (Gmail / Outlook / any SMTP server configured in .env)
 *
 * TECHNOLOGY:
 *   Nodemailer (npm package) — the standard Node.js email library.
 *   It connects to an SMTP server and sends the email on behalf of the
 *   configured sender address. No third-party email API or paid service
 *   is required — just a Gmail / Outlook account with an App Password.
 *
 * CONFIGURATION (.env):
 *   EMAIL_HOST=smtp.gmail.com          (or smtp.office365.com for Outlook)
 *   EMAIL_PORT=587                     (587 = STARTTLS, 465 = SSL)
 *   EMAIL_SECURE=false                 (false for port 587, true for 465)
 *   EMAIL_USER=youraddress@gmail.com   (sender Gmail address)
 *   EMAIL_PASS=xxxx xxxx xxxx xxxx    (Gmail App Password — NOT your login)
 *   EMAIL_FROM=DFCCIL Crack Detection <youraddress@gmail.com>
 *
 * HOW TO GET A GMAIL APP PASSWORD:
 *   1. Go to myaccount.google.com → Security → 2-Step Verification (enable it)
 *   2. Search "App passwords" → Select "Mail" + "Windows Computer"
 *   3. Google generates a 16-char password — paste it as EMAIL_PASS
 *   (This bypasses the "less secure apps" block that rejects normal passwords)
 */
'use strict';

const nodemailer = require('nodemailer');

// ── Lazy transporter — created once and reused ────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host   = process.env.EMAIL_HOST   || 'smtp.gmail.com';
  const port   = parseInt(process.env.EMAIL_PORT || '587');
  const secure = process.env.EMAIL_SECURE === 'true'; // true only for port 465
  const user   = process.env.EMAIL_USER;
  const pass   = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      'Email not configured. Add EMAIL_USER and EMAIL_PASS to backend/.env ' +
      'then restart Express. See emailController.js for instructions.'
    );
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // For Gmail: enable "Allow less secure apps" OR use an App Password (recommended)
    tls: { rejectUnauthorized: false },  // allows self-signed certs in dev
  });

  return _transporter;
}

// ── HTML email template ───────────────────────────────────────────────────────
function buildHTML(data) {
  const {
    source = 'image',
    filename = '',
    model = '',
    threshold = 0.5,
    pCrack = 0,
    pNormal = 1,
    label = 'NORMAL',
    isCrack = false,
    lat = null,
    lon = null,
    mapsLink = null,
    totalFrames = null,
    crackFrames = null,
    crackRate = null,
    elapsed = null,
    timestamp = new Date().toISOString(),
  } = data;

  const clr     = isCrack ? '#CC1F1F' : '#1A7A3F';
  const bgClr   = isCrack ? '#FFF0F0' : '#F0FFF4';
  const icon    = isCrack ? '⚠' : '✓';
  const verdict = isCrack ? 'CRACK DETECTED' : 'NORMAL TRACK';
  const ts      = new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const pCrackPct  = (pCrack  * 100).toFixed(2);
  const pNormalPct = (pNormal * 100).toFixed(2);

  const sourceLabel = source === 'camera' ? 'Live Camera'
    : source === 'video' ? 'Video Analysis'
    : 'Image Analysis';

  const barW  = Math.round(pCrack  * 200);
  const barW2 = Math.round(pNormal * 200);

  const gpsRow = (lat && lon)
    ? `<tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC;width:160px">GPS Location</td>
        <td style="padding:8px 12px">${lat.toFixed(6)}, ${lon.toFixed(6)}
          ${mapsLink ? `&nbsp;<a href="${mapsLink}" style="color:#003087;font-size:12px">View on Maps</a>` : ''}
        </td>
       </tr>`
    : '';

  const videoRows = (totalFrames != null)
    ? `<tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Total Frames</td>
        <td style="padding:8px 12px">${totalFrames}</td>
       </tr>
       <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Crack Frames</td>
        <td style="padding:8px 12px">${crackFrames || 0}</td>
       </tr>
       <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Crack Rate</td>
        <td style="padding:8px 12px">${crackRate != null ? crackRate.toFixed(1) : '—'}%</td>
       </tr>
       <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Analysis Time</td>
        <td style="padding:8px 12px">${elapsed != null ? elapsed + 's' : '—'}</td>
       </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#F0F4F8">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.12)">

  <!-- Indian flag tricolour strip -->
  <tr>
    <td style="height:4px;background:#FF9933;width:200px"></td>
    <td style="height:4px;background:#ffffff;width:200px"></td>
    <td style="height:4px;background:#138808;width:200px"></td>
  </tr>

  <!-- Header -->
  <tr><td colspan="3" style="background:#003087;padding:24px 32px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#FF6600;text-transform:uppercase">
      Ministry of Railways · Government of India
    </p>
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff">
      Railway Track Crack Detection System
    </h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.65)">
      ECG Lab, IIT Roorkee &nbsp;|&nbsp; DFCCIL &nbsp;|&nbsp; ${sourceLabel} Report
    </p>
  </td></tr>

  <!-- Verdict banner -->
  <tr><td colspan="3">
    <div style="background:${bgClr};border-left:6px solid ${clr};padding:20px 32px;margin:0">
      <p style="margin:0;font-size:28px;font-weight:900;color:${clr}">${icon}&nbsp;&nbsp;${verdict}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#4A5568">
        ${isCrack ? 'Immediate inspection and maintenance is recommended.' : 'No cracks detected — track appears safe for operation.'}
      </p>
    </div>
  </td></tr>

  <!-- Probability bars -->
  <tr><td colspan="3" style="padding:24px 32px">
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#003087;text-transform:uppercase;letter-spacing:1px">
      Prediction Confidence
    </p>

    <!-- P(crack) -->
    <div style="margin-bottom:14px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;font-weight:600;color:#4A5568">P (Crack)</td>
          <td align="right" style="font-size:13px;font-weight:800;color:#CC1F1F">${pCrackPct}%</td>
        </tr>
      </table>
      <div style="background:#E2E8F0;border-radius:4px;height:10px;margin-top:4px;overflow:hidden">
        <div style="background:#CC1F1F;width:${pCrackPct}%;height:10px;border-radius:4px"></div>
      </div>
    </div>

    <!-- P(normal) -->
    <div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;font-weight:600;color:#4A5568">P (Normal)</td>
          <td align="right" style="font-size:13px;font-weight:800;color:#1A7A3F">${pNormalPct}%</td>
        </tr>
      </table>
      <div style="background:#E2E8F0;border-radius:4px;height:10px;margin-top:4px;overflow:hidden">
        <div style="background:#1A7A3F;width:${pNormalPct}%;height:10px;border-radius:4px"></div>
      </div>
    </div>
  </td></tr>

  <!-- Details table -->
  <tr><td colspan="3" style="padding:0 32px 24px">
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#003087;text-transform:uppercase;letter-spacing:1px">
      Detection Details
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;font-size:13px">
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC;width:160px">Timestamp</td>
        <td style="padding:8px 12px">${ts}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Source</td>
        <td style="padding:8px 12px">${sourceLabel}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">File</td>
        <td style="padding:8px 12px">${filename || '—'}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Model</td>
        <td style="padding:8px 12px">${model || '—'}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Threshold</td>
        <td style="padding:8px 12px">${threshold}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#4A5568;background:#F7FAFC">Result</td>
        <td style="padding:8px 12px;font-weight:700;color:${clr}">${label}</td>
      </tr>
      ${gpsRow}
      ${videoRows}
    </table>
  </td></tr>

  <!-- PDF note -->
  <tr><td colspan="3" style="padding:0 32px 24px">
    <div style="background:#EBF4FF;border-radius:6px;padding:14px 18px">
      <p style="margin:0;font-size:12px;color:#003087">
        📎 The full PDF report is attached to this email. It contains the complete analysis with charts, detection photos, and GPS-tagged crack locations.
      </p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td colspan="3" style="background:#F7FAFC;border-top:1px solid #E2E8F0;padding:16px 32px">
    <p style="margin:0;font-size:11px;color:#718096;text-align:center">
      DFCCIL Railway Track Crack Detection System &nbsp;·&nbsp; ECG Lab, IIT Roorkee
      &nbsp;·&nbsp; Ministry of Railways, Government of India
    </p>
    <p style="margin:4px 0 0;font-size:11px;color:#A0AEC0;text-align:center">
      This is an automated report. Do not reply to this email.
    </p>
  </td></tr>

  <!-- Bottom tricolour -->
  <tr>
    <td style="height:4px;background:#FF9933"></td>
    <td style="height:4px;background:#ffffff"></td>
    <td style="height:4px;background:#138808"></td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── POST /api/email/send ──────────────────────────────────────────────────────
async function sendEmailReport(req, res) {
  /**
   * Request body:
   * {
   *   recipients: ['a@example.com', 'b@example.com'],  // required, 1+ emails
   *   subject:    'DFCCIL Crack Report',                // optional
   *   data: {                                           // detection result
   *     source, filename, model, threshold,
   *     pCrack, pNormal, label, isCrack,
   *     lat, lon, mapsLink,
   *     totalFrames, crackFrames, crackRate, elapsed,
   *     timestamp
   *   },
   *   pdfBase64: 'data:application/pdf;base64,...'     // optional — PDF attachment
   * }
   */
  const { recipients, subject, data = {}, pdfBase64 } = req.body;

  // ── Validate recipients ───────────────────────────────────────────────────
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ ok: false, error: 'Provide at least one recipient email address.' });
  }

  // Simple email format validation
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = recipients.filter(e => !emailRe.test(e));
  if (invalid.length > 0) {
    return res.status(400).json({ ok: false, error: `Invalid email addresses: ${invalid.join(', ')}` });
  }

  // ── Build mail options ────────────────────────────────────────────────────
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const subj = subject ||
    `DFCCIL Crack Report — ${data.isCrack ? 'CRACK DETECTED' : 'Normal'} — ${new Date().toLocaleDateString('en-IN')}`;

  const mailOptions = {
    from,
    to: recipients,              // nodemailer accepts string array for multiple recipients
    subject: subj,
    html: buildHTML(data),
    attachments: [],
  };

  // ── Attach PDF if provided ────────────────────────────────────────────────
  if (pdfBase64) {
    // Strip data URL prefix if present: "data:application/pdf;base64,JVBERi..."
    const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const sourceName = data.filename || 'report';
    const safe = sourceName.replace(/[^a-z0-9]/gi, '_');
    mailOptions.attachments.push({
      filename:    `crack_report_${safe}_${Date.now()}.pdf`,
      content:     base64Data,
      encoding:    'base64',
      contentType: 'application/pdf',
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Sent to:', recipients.join(', '), '| messageId:', info.messageId);
    res.json({
      ok:        true,
      messageId: info.messageId,
      accepted:  info.accepted,
      rejected:  info.rejected,
      message:   `Report sent to ${info.accepted.length} recipient(s).`,
    });
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    res.status(500).json({
      ok:    false,
      error: err.message,
      hint:  'Check EMAIL_USER / EMAIL_PASS in backend/.env and restart Express.',
    });
  }
}

// ── GET /api/email/status — tells frontend whether email is configured ────────
async function emailStatus(req, res) {
  const configured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  res.json({
    ok:         true,
    configured,
    host:       process.env.EMAIL_HOST || 'smtp.gmail.com',
    from:       process.env.EMAIL_FROM || process.env.EMAIL_USER || '(not set)',
    hint:       configured ? null : 'Add EMAIL_USER and EMAIL_PASS to backend/.env to enable email.',
  });
}

module.exports = { sendEmailReport, emailStatus };
