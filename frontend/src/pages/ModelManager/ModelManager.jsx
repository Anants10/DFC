import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HelpInfoButton } from '../../components/ui/HelpModal.jsx';
import { useApp }  from '../../context/AppContext.jsx';
import { api }     from '../../services/api.js';
import Card        from '../../components/ui/Card.jsx';
import Button      from '../../components/ui/Button.jsx';
import Spinner     from '../../components/ui/Spinner.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';

/* ── Copy-to-clipboard button ──────────────────────────────────────── */
function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
      style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginLeft: 8, whiteSpace: 'nowrap' }}
    >
      {done ? '✓ Copied' : '📋 Copy'}
    </button>
  );
}

/* ── ⓘ How-to-use tooltip / popover ───────────────────────────────── */
const HOW_TO_STEPS = [
  ['1', 'Start Flask ML server',     'cd flask-ml && py -3.10 run.py'],
  ['2', 'Upload your .keras model',  'Use the Upload button on the left'],
  ['3', 'Load the model',            'Select it and click Load Selected Model'],
  ['4', 'Run predictions',           'Go to Image Analysis or Video / Camera tab'],
];

function HowToPopover() {
  const [open, setOpen] = useState(false);
  const ref  = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* ⓘ trigger button */}
      <button
        onClick={() => setOpen(p => !p)}
        title="How to use"
        style={{
          width: 26, height: 26, borderRadius: '50%',
          background: open ? 'var(--navy)' : 'var(--bg)',
          color: open ? '#fff' : 'var(--navy)',
          border: '2px solid var(--navy)',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, transition: 'all .15s',
          flexShrink: 0,
        }}
      >
        i
      </button>

      {/* Popover panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 32, right: 0,
          width: 340, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          boxShadow: '0 8px 32px rgba(0,48,135,.18)',
          padding: '18px 18px 14px', zIndex: 500,
          animation: 'fadeUp .18s ease',
        }}>
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: -8, right: 8,
            width: 14, height: 14,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderBottom: 'none', borderRight: 'none',
            transform: 'rotate(45deg)',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', fontFamily: 'var(--font-h)', margin: 0 }}>
              How to Use
            </p>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-m)', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {HOW_TO_STEPS.map(([n, title, sub]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--navy)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</span>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--text)', margin: '0 0 3px', fontSize: 13 }}>{title}</p>
                <code style={{ fontSize: 11, background: 'var(--bg)', padding: '2px 7px', borderRadius: 4, color: 'var(--text-2)', display: 'inline-block' }}>{sub}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */
export default function ModelManager({ showToast, openHelp }) {
  const {
    modelLoaded, setModelLoaded,
    modelName,   setModelName,
    mlOk,        setMlOk,
    tfOk,        setTfOk,
    checkMl,
  } = useApp();

  const [models,     setModels]     = useState([]);
  const [selected,   setSelected]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [loadMsg,    setLoadMsg]    = useState('');
  const [loadErr,    setLoadErr]    = useState('');
  const [loadHint,   setLoadHint]   = useState('');
  const [env,        setEnv]        = useState(null);
  const [modelMeta,  setModelMeta]  = useState(null);  // prediction direction metadata
  const [savingMeta, setSavingMeta] = useState(false);
  const fileRef = useRef(null);

  /* ── Refresh server state + model list ── */
  const refresh = useCallback(async () => {
    try {
      const h = await api.mlHealth();
      setMlOk(!!h.ok);
      setTfOk(h.keras_ok === true);
      setEnv(h.ok
        ? { tf_available: h.tf_available, tf_version: h.tf_version, keras_version: h.keras_version, keras_ok: h.keras_ok, error: h.env_error, hint: h.env_hint }
        : null
      );
      if (h.loaded && h.model) {
        setModelLoaded(true); setModelName(h.model);
        // Also fetch meta
        try { const m = await api.getModelMeta(); if (m.ok) setModelMeta(m.meta); } catch(_) {}
      }
    } catch { setMlOk(false); setEnv(null); }

    try {
      const d = await api.listModels();
      if (d.models) {
        setModels(d.models);
        setSelected(prev => {
          if (prev) return prev;  // keep existing selection
          const first = d.models.find(m => m.valid) || d.models[0];
          return first?.filename || '';
        });
      }
    } catch { }
  }, [setMlOk, setTfOk, setModelLoaded, setModelName]);

  useEffect(() => { refresh(); }, [refresh]);

  /* ── Upload ── */
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.keras') && !file.name.toLowerCase().endsWith('.h5')) {
      showToast('Only .keras or .h5 files are accepted', 'error');
      return;
    }
    setUploading(true); setUploadPct(0);
    try {
      const fd = new FormData();
      fd.append('model', file);
      const interval = setInterval(() => setUploadPct(p => Math.min(p + 7, 88)), 300);
      const data = await api.uploadModel(fd);
      clearInterval(interval); setUploadPct(100);
      if (data.ok) {
        showToast(`${file.name} uploaded and validated`, 'success');
        await refresh();
        setSelected(file.name);
      } else {
        showToast(`Upload failed: ${data.error}`, 'error', 8000);
      }
    } catch (err) {
      showToast(`Upload error: ${err.message}`, 'error');
    }
    setUploading(false); setUploadPct(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── Load model ── */
  const handleLoad = async () => {
    if (!selected) return;
    setLoading(true); setLoadMsg(''); setLoadErr(''); setLoadHint('');
    try {
      const data = await api.loadModel(selected);
      if (data.ok) {
        setModelLoaded(true); setModelName(selected);
        setLoadMsg(data.message);
        showToast(`${selected} loaded successfully`, 'success');
        refresh();
        // Fetch prediction direction metadata for the loaded model
        try {
          const m = await api.getModelMeta();
          if (m.ok) setModelMeta(m.meta);
        } catch(_) {}
      } else {
        setModelLoaded(false);
        setLoadErr(data.error || 'Load failed');
        setLoadHint(data.hint || '');
        showToast(`Load failed: ${data.error}`, 'error', 8000);
      }
    } catch {
      setLoadErr('Flask server unreachable');
      setLoadHint('cd flask-ml  then  py -3.10 run.py');
    }
    setLoading(false);
  };

  /* ── Unload ── */
  const handleUnload = async () => {
    await api.unloadModel();
    setModelLoaded(false); setModelName(''); setLoadMsg('');
    showToast('Model unloaded', 'info');
    refresh();
  };

  const selModel = models.find(m => m.filename === selected);
  const canLoad  = !!selected && !loading && !!mlOk && (env?.keras_ok ?? false) && (selModel?.valid ?? false);
  const CMD      = 'py -3.10 -m pip install tensorflow==2.18.0';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

      {/* ════════════════════ LEFT COLUMN ════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Flask server status */}
        <div style={{
          padding: '11px 16px', borderRadius: 'var(--r-md)', border: '1px solid',
          background:  mlOk ? 'var(--success-bg)' : mlOk === false ? 'var(--danger-bg)' : 'var(--warn-bg)',
          borderColor: mlOk ? 'var(--success-br)' : mlOk === false ? 'var(--danger-br)' : 'var(--warn-br)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: mlOk ? 'var(--success)' : mlOk === false ? 'var(--danger)' : '#fbbf24',
            animation: mlOk ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: mlOk ? 'var(--success)' : mlOk === false ? 'var(--danger)' : 'var(--warn)' }}>
            {mlOk === null ? 'Checking Flask ML server…' : mlOk ? 'Flask ML Server Online · Port 5001' : 'Flask ML Server Offline'}
          </span>
          <Button variant="ghost" size="sm" onClick={refresh}>↺</Button>
        </div>

        {/* TF environment */}
        {mlOk && env && (
          env.keras_ok ? (
            <div style={{ padding: '12px 16px', borderRadius: 'var(--r-md)', background: 'var(--success-bg)', border: '1px solid var(--success-br)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div>
                <p style={{ fontWeight: 700, color: 'var(--success)', margin: '0 0 2px', fontSize: 13 }}>
                  TF {env.tf_version} + Keras {env.keras_version} — Ready
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Models will load correctly.</p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--danger-bg)', border: '1px solid var(--danger-br)' }}>
              <p style={{ fontWeight: 700, color: 'var(--danger)', margin: '0 0 8px', fontSize: 13 }}>
                {env.tf_available ? `Keras ${env.keras_version} Too Old (need >= 3.0)` : 'TensorFlow Not Installed'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 10px' }}>
                Your .keras models need Keras 3.x. Run this, then restart Flask:
              </p>
              <div style={{ background: '#1a1a2e', borderRadius: 7, padding: '8px 14px', fontFamily: 'monospace', fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{CMD}</span>
                <CopyBtn text={CMD} />
              </div>
              <Button variant="ghost" size="sm" onClick={refresh} style={{ marginTop: 10 }}>↺ Check Again</Button>
            </div>
          )
        )}

        {/* Upload model */}
        <Card
          title="Upload Model File"
          subtitle=".keras or .h5 only — up to 1 GB"
          headerRight={<HowToPopover />}
        >
          <input ref={fileRef} type="file" accept=".keras,.h5" style={{ display: 'none' }} onChange={handleUpload} />

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.6 }}>
              Upload your trained <code>.keras</code> or <code>.h5</code> model file.
              It is saved to the Flask server and validated immediately.
              <br /><b>No pre-loaded models exist</b> — only your uploaded files appear.
            </p>
            <Button variant="saffron" onClick={() => fileRef.current?.click()} disabled={uploading || !mlOk} fullWidth>
              {uploading
                ? <><Spinner size={14} color="#fff" />&nbsp;Uploading…</>
                : '⬆ Upload .keras / .h5 Model'}
            </Button>
            {!mlOk && <p style={{ fontSize: 11, color: 'var(--text-m)', marginTop: 6 }}>Flask server must be running to upload</p>}
            {uploading && uploadPct > 0 && (
              <div style={{ marginTop: 10 }}>
                <ProgressBar value={uploadPct} color="var(--saffron)" />
              </div>
            )}
          </div>

          {/* Model list */}
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Uploaded Models:</p>
          {models.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-m)', padding: '20px 0', textAlign: 'center' }}>
              {mlOk ? 'No models uploaded yet. Use the button above.' : 'Flask offline — cannot list models'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {models.map(m => {
                const isActive   = modelLoaded && modelName === m.filename;
                const isSelected = selected === m.filename;
                return (
                  <button key={m.filename} onClick={() => setSelected(m.filename)}
                    style={{
                      padding: '10px 14px', borderRadius: 'var(--r-sm)', textAlign: 'left',
                      cursor: m.valid ? 'pointer' : 'not-allowed',
                      border: `2px solid ${isSelected ? 'var(--navy)' : m.valid ? 'var(--border)' : 'var(--danger-br)'}`,
                      background: isSelected ? 'rgba(0,48,135,.05)' : 'var(--surface)',
                      opacity: m.valid ? 1 : 0.6,
                      width: '100%', transition: 'border-color .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: m.valid ? 'var(--navy)' : 'var(--danger)', fontFamily: 'var(--font-h)', fontSize: 14 }}>
                        {m.filename}
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-m)' }}>{m.fileSize}</span>
                        {isActive && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', background: 'var(--success-bg)', padding: '1px 7px', borderRadius: 10, border: '1px solid var(--success-br)' }}>
                            Active
                          </span>
                        )}
                        {!m.valid && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-bg)', padding: '1px 7px', borderRadius: 10, border: '1px solid var(--danger-br)' }}>
                            Invalid
                          </span>
                        )}
                      </div>
                    </div>
                    {!m.valid && m.error && (
                      <p style={{ fontSize: 11, color: 'var(--danger)', margin: '4px 0 0', fontStyle: 'italic' }}>{m.error}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Load / Unload button */}
          {modelLoaded ? (
            <Button variant="secondary" onClick={handleUnload} fullWidth>
              ✓ {modelName} Active — Click to Unload
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={handleLoad} fullWidth disabled={!canLoad}>
                {loading
                  ? <><Spinner size={14} color="#fff" />&nbsp;Loading model…</>
                  : '▶ Load Selected Model'}
              </Button>
              {!canLoad && mlOk && !loading && selected && (
                <p style={{ fontSize: 11, color: 'var(--text-m)', marginTop: 6, textAlign: 'center' }}>
                  {!env?.keras_ok ? 'Install TensorFlow 2.18 first' : !selModel?.valid ? 'Selected model is invalid' : ''}
                </p>
              )}
            </>
          )}

          {/* Success */}
          {loadMsg && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-br)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--success)' }}>
              {loadMsg}
            </div>
          )}

          {/* Error */}
          {loadErr && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-br)', borderRadius: 'var(--r-sm)' }}>
              <p style={{ fontSize: 12, color: 'var(--danger)', margin: '0 0 6px', fontWeight: 700 }}>{loadErr}</p>
              {loadHint && (
                <div style={{ background: '#1a1a2e', borderRadius: 5, padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: '#4ade80' }}>
                  {loadHint}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ════════════════════ RIGHT COLUMN ════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Prediction Direction Card (shown when model is loaded) ── */}
        {modelLoaded && modelMeta !== null && (
          <Card title="Prediction Direction"
            subtitle="Fix inverted predictions for sigmoid models"
            headerRight={
              <span style={{ fontSize:11, color:'var(--text-m)' }}>
                {modelMeta.sigmoid_invert !== undefined ? 'Sigmoid model' : 'Softmax model'}
              </span>
            }>
            {/* Softmax 2-class models */}
            {modelMeta.sigmoid_invert === undefined && (
              <div>
                <p style={{fontSize:12,color:'var(--text-2)',marginBottom:8}}>
                  Softmax 2-class model. Configure which output index corresponds to a crack:
                </p>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  {[['0','Index 0 = Crack (default)'],['1','Index 1 = Crack (swapped)']].map(([v,lb])=>(
                    <button key={v} onClick={async()=>{
                      setSavingMeta(true);
                      const r=await api.setModelMeta({crack_index:parseInt(v)});
                      if(r.ok){setModelMeta(r.meta);showToast(`Crack index set to ${v} — saved permanently`,'success');}
                      setSavingMeta(false);
                    }} style={{flex:1,padding:'8px 0',border:`2px solid ${String(modelMeta.crack_index??0)===v?'var(--navy)':'var(--border)'}`,borderRadius:'var(--r-sm)',background:String(modelMeta.crack_index??0)===v?'rgba(0,48,135,.08)':'var(--surface)',fontWeight:600,fontSize:12,cursor:'pointer',color:String(modelMeta.crack_index??0)===v?'var(--navy)':'var(--text-2)'}}>
                      {lb}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:11,color:'var(--text-m)',padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--r-sm)'}}>
                  Currently: <b>Index {modelMeta.crack_index??0} = Crack</b><br/>
                  If crack images show as NORMAL, toggle to the other index.
                </div>
              </div>
            )}

            {/* Sigmoid 1-unit models */}
            {modelMeta.sigmoid_invert !== undefined && (
              <div>
                <p style={{fontSize:12,color:'var(--text-2)',marginBottom:10}}>
                  Sigmoid model — output is a single probability score.<br/>
                  If predictions appear reversed (cracks show as NORMAL), enable inversion:
                </p>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:modelMeta.sigmoid_invert?'var(--danger-bg)':'var(--success-bg)',border:`1px solid ${modelMeta.sigmoid_invert?'var(--danger-br)':'var(--success-br)'}`,borderRadius:'var(--r-md)',marginBottom:10}}>
                  <div>
                    <p style={{fontWeight:700,fontSize:13,margin:'0 0 2px',color:modelMeta.sigmoid_invert?'var(--danger)':'var(--success)'}}>
                      {modelMeta.sigmoid_invert?'Inversion ON — P(crack) = 1 - output':'Inversion OFF — P(crack) = output'}
                    </p>
                    <p style={{fontSize:11,color:'var(--text-2)',margin:0}}>
                      {modelMeta.sigmoid_invert?'Use this when raw output near 1 = NORMAL':'Use this when raw output near 1 = CRACK'}
                    </p>
                  </div>
                  <button onClick={async()=>{
                    setSavingMeta(true);
                    const newInvert=!modelMeta.sigmoid_invert;
                    const r=await api.setModelMeta({sigmoid_invert:newInvert});
                    if(r.ok){setModelMeta(r.meta);showToast(`Inversion ${newInvert?'enabled':'disabled'} — saved permanently`,'success');}
                    setSavingMeta(false);
                  }} disabled={savingMeta}
                    style={{padding:'8px 18px',borderRadius:'var(--r-sm)',border:'none',background:'var(--navy)',color:'#fff',fontWeight:700,fontSize:12,cursor:savingMeta?'wait':'pointer'}}>
                    {savingMeta?'Saving…':'Toggle'}
                  </button>
                </div>
                <div style={{fontSize:11,color:'var(--text-m)',padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--r-sm)'}}>
                  This setting is saved permanently next to the model file.<br/>
                  It persists across Flask restarts and future sessions.
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Active Configuration — moved to TOP of right column */}
        <Card
          title="Active Configuration"
          headerRight={
            <span style={{ fontSize: 11, fontWeight: 700, color: modelLoaded ? 'var(--success)' : 'var(--text-m)' }}>
              {modelLoaded ? '● Active' : '○ No Model'}
            </span>
          }
        >
          {[
            ['Selected',      selected || '—'],
            ['Status',        modelLoaded ? `Loaded: ${modelName}` : 'Not loaded'],
            ['TF Version',    env?.tf_version    || 'Not detected'],
            ['Keras Version', env?.keras_version || 'Not detected'],
            ['Keras 3 OK',    env?.keras_ok ? 'Yes' : 'No — upgrade needed'],
            ['Preprocessing', 'Built-in (raw RGB [0,255])'],
            ['Output',        'softmax [P(Crack), P(Normal)]'],
            ['Class order',   'Index 0 = Crack, Index 1 = Normal'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-s)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-m)', flexShrink: 0 }}>{k}</span>
              <span style={{
                color: k === 'Status' && modelLoaded
                  ? 'var(--success)'
                  : k === 'Keras 3 OK'
                    ? (env?.keras_ok ? 'var(--success)' : 'var(--danger)')
                    : 'var(--text)',
                fontWeight: (k === 'Status' || k === 'Keras 3 OK') ? 700 : 400,
                textAlign: 'right',
              }}>{v}</span>
            </div>
          ))}
        </Card>

        {/* System Stack — below Active Config */}
        <Card title="System Stack">
          {[
            ['Frontend',  'React 18 + Vite 5'],
            ['Backend',   'Express 4 + MongoDB 6'],
            ['ML Server', 'Flask 3 + TF 2.18 + Keras 3'],
            ['Python',    '3.10 (3.13/3.14 not supported)'],
            ['Models',    'User-uploaded .keras / .h5'],
            ['Corridor',  'Western DFC Corridor'],
            ['Lab',       'ECG Lab, IIT Roorkee'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-s)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-m)', fontWeight: 600 }}>{k}</span>
              <span style={{ color: 'var(--text)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </Card>

      </div>
    </div>
  );
}
