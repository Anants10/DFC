const BASE = '/api';

const req = (path, opts = {}) =>
  fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(r => r.json());

export const api = {
  // Health
  backendHealth: () => req('/health'),
  mlHealth:      () => req('/ml/health'),

  // Events (MongoDB)
  getEvents:    (q = '') => req(`/events?${q}`),
  getStats:     ()       => req('/events/stats'),
  createEvent:  (body)   => req('/events', { method: 'POST', body: JSON.stringify(body) }),
  deleteEvent:  (id)     => req(`/events/${id}`, { method: 'DELETE' }),
  clearAll:     ()       => req('/events/all', { method: 'DELETE' }),
  // Per-event PDF report (fetched on demand, not included in the events list)
  getEventReport:    (id)   => req(`/events/${id}/report`),
  attachEventReport: (id, reportPdf) => req(`/events/${id}/report`, { method: 'POST', body: JSON.stringify({ reportPdf }) }),

  // Models
  listModels:  ()    => req('/ml/models'),
  loadModel:   (fn)  => req('/ml/load_model',  { method: 'POST', body: JSON.stringify({ filename: fn }) }),
  unloadModel: ()    => req('/ml/unload_model', { method: 'POST', body: '{}' }),
  getModelMeta: ()   => req('/ml/model_meta'),
  setModelMeta: (b)  => req('/ml/model_meta',  { method: 'POST', body: JSON.stringify(b) }),

  // File uploads (multipart — no JSON header)
  uploadModel: (fd)  => fetch(`${BASE}/ml/upload_model`, { method: 'POST', body: fd }).then(r => r.json()),

  // Prediction
  predictImage: (fd)   => fetch(`${BASE}/ml/predict_image`, { method: 'POST', body: fd }).then(r => r.json()),
  predictFrame: (body) => req('/ml/predict_frame', { method: 'POST', body: JSON.stringify(body) }),
  predictVideo: (fd)   => fetch(`${BASE}/ml/predict_video`, { method: 'POST', body: fd }).then(r => r.json()),

  // Video conversion (returns Blob)
  convertVideo: (fd) =>
    fetch(`${BASE}/ml/convert_video`, { method: 'POST', body: fd }).then(r => {
      if (!r.ok) throw new Error('Conversion failed');
      return r.blob();
    }),

  // FLIR T1020 Bridge
  flirStatus:       ()     => req('/ml/flir/status'),
  flirConnect:      ()     => req('/ml/flir/connect',       { method: 'POST' }),
  flirDisconnect:   ()     => req('/ml/flir/disconnect',    { method: 'POST' }),
  flirCaptureSnapshot: ()     => req("/ml/flir/snapshot",       { method: "POST" }),
  flirPredictFrame: (body) => req('/ml/flir/predict_frame', { method: 'POST', body: JSON.stringify(body) }),

  // Email reports
  emailStatus: ()     => req('/email/status'),
  sendEmail:   (body) => req('/email/send', { method: 'POST', body: JSON.stringify(body) }),
};