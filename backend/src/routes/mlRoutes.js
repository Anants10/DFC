'use strict';
const { Router } = require('express');
const multer     = require('multer');
const c          = require('../controllers/mlController');
const r          = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

r.get ('/health',        c.mlHealth);
r.get ('/models',        c.getModels);
r.post('/upload_model',  upload.single('model'), c.uploadModel);
r.post('/load_model',    c.loadModel);
r.post('/unload_model',  c.unloadModel);
r.post('/predict_image', upload.single('image'), c.predictImage);
r.post('/predict_frame', c.predictFrame);
r.post('/predict_video', upload.single('video'), c.predictVideo);
r.post('/convert_video', upload.single('video'), c.convertVideo);
r.get ('/model_meta',    c.getModelMeta);
r.post('/model_meta',    c.setModelMeta);

// FLIR T1020 routes
r.get ('/flir/status',        c.flirStatus);
r.post('/flir/connect',       c.flirConnect);
r.post('/flir/disconnect',    c.flirDisconnect);
r.post('/flir/predict_frame', c.flirPredictFrame);
r.post('/flir/snapshot',       c.flirSnapshot);

module.exports = r;