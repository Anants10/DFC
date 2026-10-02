'use strict';
const DetectionEvent = require('../models/DetectionEvent');

async function getEvents(req, res) {
  const { source, status, model, limit = 500 } = req.query;
  const filter = {};
  if (source && source !== 'ALL') filter.source = source;
  if (status && status !== 'ALL') filter.status = status;
  if (model  && model  !== 'ALL') filter.model  = model;
  // reportPdf is excluded here (can be several hundred KB per event) so the
  // list endpoint stays fast even with hundreds of events. The Detection
  // Log "View Report" button fetches the PDF separately via
  // GET /api/events/:id/report, only for the one row clicked.
  const events = await DetectionEvent.find(filter)
    .select('-reportPdf')
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();
  res.json({ success: true, count: events.length, events });
}

async function getStats(req, res) {
  const total  = await DetectionEvent.countDocuments();
  const cracks = await DetectionEvent.countDocuments({ isCrack: true });
  const today  = new Date(); today.setHours(0,0,0,0);
  const todayCount = await DetectionEvent.countDocuments({ timestamp: { $gte: today } });
  const agg = await DetectionEvent.aggregate([{ $group: { _id: null, avgConf: { $avg: '$confidence' } } }]);
  res.json({
    success: true,
    stats: {
      total, cracks, normal: total - cracks,
      crackRate:  total ? ((cracks / total) * 100).toFixed(1) : '0.0',
      avgConf:    agg[0] ? (agg[0].avgConf * 100).toFixed(1) : '0.0',
      todayCount,
    },
  });
}

async function createEvent(req, res) {
  const ev = new DetectionEvent(req.body);
  await ev.save();
  res.status(201).json({ success: true, event: ev.toObject() });
}

// GET /api/events/:id/report — fetch the stored PDF for one event only.
// Kept separate from getEvents() so the list endpoint never has to carry
// every event's PDF payload at once.
async function getEventReport(req, res) {
  const ev = await DetectionEvent.findOne({ eventId: req.params.id }).select('eventId reportPdf hasReport').lean();
  if (!ev)
    return res.status(404).json({ success: false, error: `Not found: ${req.params.id}` });
  if (!ev.reportPdf)
    return res.status(404).json({ success: false, error: `No saved report for ${req.params.id}` });
  res.json({ success: true, eventId: ev.eventId, reportPdf: ev.reportPdf });
}

// POST /api/events/:id/report — attach a PDF (base64 data URI) to an event
// that already exists. Used because the PDF can only be built client-side
// AFTER a prediction result comes back, while the event itself is created
// at prediction time (predictImage/predictVideo). Keeping this as a
// separate call means the existing predictImage/predictVideo save logic
// is completely untouched — this just updates one extra field on an
// already-saved document.
async function attachEventReport(req, res) {
  const { reportPdf } = req.body;
  if (!reportPdf)
    return res.status(400).json({ success: false, error: 'reportPdf is required' });
  const ev = await DetectionEvent.findOneAndUpdate(
    { eventId: req.params.id },
    { reportPdf, hasReport: true },
    { new: true }
  ).select('eventId hasReport');
  if (!ev)
    return res.status(404).json({ success: false, error: `Not found: ${req.params.id}` });
  res.json({ success: true, eventId: ev.eventId, hasReport: ev.hasReport });
}

async function deleteEvent(req, res) {
  const r = await DetectionEvent.deleteOne({ eventId: req.params.id });
  if (!r.deletedCount)
    return res.status(404).json({ success: false, error: `Not found: ${req.params.id}` });
  res.json({ success: true, deleted: req.params.id });
}

async function clearAll(req, res) {
  const r = await DetectionEvent.deleteMany({});
  res.json({ success: true, deleted: r.deletedCount });
}

module.exports = { getEvents, getStats, createEvent, getEventReport, attachEventReport, deleteEvent, clearAll };