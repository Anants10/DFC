'use strict';
const axios    = require('axios');
const FormData = require('form-data');
const DetectionEvent = require('../models/DetectionEvent');

const ML = () => process.env.ML_SERVER || 'http://localhost:5001';
const TIMEOUT_LOAD  = 120_000;
const TIMEOUT_IMG   = 30_000;
const TIMEOUT_VIDEO = 600_000;

// GET /api/ml/health
async function mlHealth(req, res) {
  try {
    const { data } = await axios.get(`${ML()}/health`, { timeout: 5000 });
    res.json(data);
  } catch {
    res.json({ ok: false, error: 'Flask ML server unreachable. Run: py -3.10 run.py' });
  }
}

// GET /api/ml/models
async function getModels(req, res) {
  try {
    const { data } = await axios.get(`${ML()}/models`, { timeout: 8000 });
    res.json(data);
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
}

// POST /api/ml/upload_model
async function uploadModel(req, res) {
  try {
    const form = new FormData();
    form.append('model', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    const { data } = await axios.post(`${ML()}/upload_model`, form, {
      headers: form.getHeaders(),
      timeout: 600_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    res.json(data);
  } catch (e) {
    const d = e.response?.data || { ok: false, error: e.message };
    res.status(e.response?.status || 500).json(d);
  }
}

// POST /api/ml/load_model
async function loadModel(req, res) {
  try {
    const { data } = await axios.post(`${ML()}/load_model`, req.body, { timeout: TIMEOUT_LOAD });
    res.status(data.ok ? 200 : 422).json(data);
  } catch (e) {
    res.status(e.response?.status || 503).json(e.response?.data || { ok: false, error: e.message });
  }
}

// POST /api/ml/unload_model
async function unloadModel(req, res) {
  try {
    const { data } = await axios.post(`${ML()}/unload_model`, {}, { timeout: 5000 });
    res.json(data);
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
}

// POST /api/ml/predict_image
async function predictImage(req, res) {
  try {
    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    form.append('threshold', req.body.threshold || '0.5');
    form.append('img_size',  req.body.img_size  || '224');

    const { data } = await axios.post(`${ML()}/predict_image`, form, {
      headers: form.getHeaders(),
      timeout: TIMEOUT_IMG,
    });

    if (data.ok) {
      const ev = new DetectionEvent({
        source:     'image',
        filename:   req.file.originalname,
        model:      data.model || '',
        threshold:  parseFloat(req.body.threshold || 0.5),
        pCrack:     data.pCrack,
        pNormal:    data.pNormal,
        confidence: data.isCrack ? data.pCrack : data.pNormal,
        status:     data.label,
        isCrack:    data.isCrack,
        lat:        data.lat  || null,
        lng:        data.lon  || null,
        mapsLink:   data.mapsLink || null,
      });
      await ev.save();
      data.eventId = ev.eventId;
    }
    res.json(data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { ok: false, error: e.message });
  }
}

// POST /api/ml/predict_frame
async function predictFrame(req, res) {
  try {
    const { data } = await axios.post(`${ML()}/predict_frame`, req.body, { timeout: 10000 });
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
}

// POST /api/ml/predict_video
async function predictVideo(req, res) {
  try {
    const form = new FormData();
    form.append('video', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    form.append('threshold',  req.body.threshold  || '0.5');
    form.append('img_size',   req.body.img_size   || '224');
    form.append('frame_skip', req.body.frame_skip || '6');

    const { data } = await axios.post(`${ML()}/predict_video`, form, {
      headers: form.getHeaders(),
      timeout: TIMEOUT_VIDEO,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // Save a session-level event to MongoDB
    if (data.ok) {
      const ev = new DetectionEvent({
        source:      'video',
        filename:    req.file.originalname,
        model:       req.body.model || '',
        threshold:   parseFloat(req.body.threshold || 0.5),
        pCrack:      data.crackFrames / Math.max(data.analysedFrames, 1),
        pNormal:     1 - data.crackFrames / Math.max(data.analysedFrames, 1),
        confidence:  data.crackFrames / Math.max(data.analysedFrames, 1),
        status:      data.crackFrames > 0 ? 'CRACK' : 'NORMAL',
        isCrack:     data.crackFrames > 0,
        totalFrames: data.totalFrames,
        crackFrames: data.crackFrames,
        elapsed:     data.elapsed,
        crackRate:   data.crackRate,
      });
      await ev.save();
      data.sessionEventId = ev.eventId;
    }
    res.json(data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { ok: false, error: e.message });
  }
}


async function convertVideo(req, res) {
  try {
    const form = new FormData();
    form.append('video', Buffer.from(req.file.buffer), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    const resp = await axios.post(`${ML()}/convert_video`, form, {
      headers: form.getHeaders(),
      responseType: 'arraybuffer',
      timeout: 300_000,
      maxContentLength: Infinity,
    });
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Length', resp.data.byteLength);
    res.set('Accept-Ranges', 'bytes');
    res.send(Buffer.from(resp.data));
  } catch (e) {
    res.status(e.response?.status || 500).json({ ok: false, error: e.message });
  }
}

async function getModelMeta(req, res) {
  try {
    const r = await axios.get(`${ML()}/model_meta`, { timeout: 10_000 });
    res.json(r.data);
  } catch (e) {
    res.status(e.response?.status || 500).json({ ok: false, error: e.message });
  }
}

async function setModelMeta(req, res) {
  try {
    const r = await axios.post(`${ML()}/model_meta`, req.body, { timeout: 10_000 });
    res.json(r.data);
  } catch (e) {
    res.status(e.response?.status || 500).json({ ok: false, error: e.message });
  }
}


// ── FLIR T1020 Bridge Controllers ──────────────────────────────────────────
const flirStatus = async (req, res) => {
  try {
    const resp = await axios.get(`${ML()}/flir/status`, { timeout: 5000 });
    res.json(resp.data);
  } catch (err) {
    res.status(503).json({ ok: false, bridgeOnline: false, connected: false, error: 'FLIR bridge offline. Start flir-service.' });
  }
};

const flirConnect = async (req, res) => {
  try {
    const resp = await axios.post(`${ML()}/flir/connect`, {}, { timeout: 25000 });
    res.json(resp.data);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.status(503).json({ ok: false, error: msg });
  }
};

const flirDisconnect = async (req, res) => {
  try {
    const resp = await axios.post(`${ML()}/flir/disconnect`, {}, { timeout: 8000 });
    res.json(resp.data);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.status(503).json({ ok: false, error: msg });
  }
};

const flirPredictFrame = async (req, res) => {
  try {
    const resp = await axios.post(`${ML()}/flir/predict_frame`, req.body, { timeout: 8000 });
    res.json(resp.data);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.status(503).json({ ok: false, error: msg });
  }
};

const flirSnapshot = async (req, res) => {
    try {
        const resp = await axios.post(`${ML()}/flir/snapshot`, {}, { timeout: 8000 });
        res.json(resp.data);
    } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
};

module.exports = { mlHealth, getModels, uploadModel, loadModel, unloadModel, predictImage, predictFrame, predictVideo, convertVideo, getModelMeta, setModelMeta, flirStatus, flirConnect, flirDisconnect, flirPredictFrame, flirSnapshot };