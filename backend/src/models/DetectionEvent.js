'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  eventId:     { type: String, unique: true, index: true },
  timestamp:   { type: Date, default: Date.now, index: true },
  source:      { type: String, enum: ['image', 'video', 'camera'], required: true },
  filename:    { type: String, default: '' },
  model:       { type: String, default: '' },
  threshold:   { type: Number, default: 0.5 },
  imgSize:     { type: Number, default: 224 },
  pCrack:      { type: Number, required: true, min: 0, max: 1 },
  pNormal:     { type: Number, required: true, min: 0, max: 1 },
  confidence:  { type: Number, required: true, min: 0, max: 1 },
  status:      { type: String, enum: ['CRACK', 'NORMAL'], required: true },
  isCrack:     { type: Boolean, required: true },
  lat:         { type: Number, default: null },
  lng:         { type: Number, default: null },
  mapsLink:    { type: String, default: null },
  camera:      { type: String, default: 'CAM_01' },
  zone:        { type: String, default: 'Western DFC Corridor' },
  // Video session fields
  totalFrames: { type: Number, default: null },
  crackFrames: { type: Number, default: null },
  elapsed:     { type: Number, default: null },
  crackRate:   { type: Number, default: null },
  // Full PDF report (base64 data URI string), built client-side at the
  // moment of save using the exact same jsPDF logic that powers the
  // Download/Email buttons. Stored so "View Report" in Detection Log can
  // re-open the identical report later without recomputing anything.
  // Not requested in the default getEvents() list payload (see
  // eventController.getEvents projection) — only fetched on demand via
  // GET /api/events/:id/report, to keep the list endpoint light.
  reportPdf:   { type: String, default: null },
  // Cheap boolean mirror of "reportPdf is set", so the list endpoint can
  // show/hide the "View Report" button without selecting the (large)
  // reportPdf field itself.
  hasReport:   { type: Boolean, default: false },
}, { timestamps: true });

schema.pre('save', async function (next) {
  if (!this.eventId) {
    const n      = await mongoose.model('DetectionEvent').countDocuments();
    this.eventId = 'CRK-' + String(n + 1).padStart(4, '0');
  }
  // Keep hasReport in sync with reportPdf automatically — callers just set
  // reportPdf and this derives the cheap boolean, so it can never drift.
  this.hasReport = !!this.reportPdf;
  next();
});

module.exports = mongoose.model('DetectionEvent', schema);