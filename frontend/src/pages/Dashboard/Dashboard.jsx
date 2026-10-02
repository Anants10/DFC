import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import Card from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

function Metric({ icon, label, value, color, sub }) {
  return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${color}`, borderRadius: 'var(--r-md)', padding: '18px 20px', boxShadow: 'var(--sh-sm)', animation: 'fadeUp .4s ease both' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-h)', color }}>{value}</span>
    </div>
    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>{label}</p>
    {sub && <p style={{ fontSize: 11, color: 'var(--text-m)', margin: 0 }}>{sub}</p>}
  </div>;
}

export default function Dashboard() {
  const { events } = useApp();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(d => { if (d.success) setStats(d.stats); }).catch(() => { });
  }, [events.length]);

  // View Report — same logic as DetectionLog: fetches stored PDF on demand
  // and opens it in a new tab. Per-event loading state so the table stays
  // interactive while one report is loading.
  const [loadingReportId, setLoadingReportId] = useState(null);
  const handleViewReport = useCallback(async (id) => {
    if (!id) return;
    setLoadingReportId(id);
    try {
      const r = await api.getEventReport(id);
      if (r.success && r.reportPdf) {
        const w = window.open();
        if (w) {
          w.document.write(`<iframe src="${r.reportPdf}" style="border:0;width:100%;height:100vh;" title="Report ${id}"></iframe>`);
          w.document.title = `Report — ${id}`;
        } else {
          // showToast not available here; use console + alert as fallback
          alert('Popup blocked — please allow popups to view the report.');
        }
      } else {
        alert(r.error || `No saved report for ${id}`);
      }
    } catch (e) {
      alert(`Failed to load report: ${e.message}`);
    }
    setLoadingReportId(null);
  }, []);

  const total  = stats?.total  ?? events.length;
  const cracks = stats?.cracks ?? events.filter(e => e.isCrack).length;
  const rate   = total ? ((cracks / total) * 100).toFixed(1) : '0.0';

  const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    const day = events.filter(e => (e.timestamp || '').slice(0, 10) === key);
    return { label, cracks: day.filter(e => e.isCrack).length, normal: day.filter(e => !e.isCrack).length };
  }), [events]);

  const confTrend = useMemo(() => events.slice(0, 20).map((e, i) => ({
    i: i + 1, conf: parseFloat(((e.confidence || 0) * 100).toFixed(1))
  })), [events]);

  const METRICS = [
    { icon: '🔍', label: 'Total Detections', value: total, color: 'var(--navy)', sub: 'All time' },
    { icon: '⚠️', label: 'Cracks Found', value: cracks, color: 'var(--danger)', sub: 'Require maintenance' },
    { icon: '✅', label: 'Normal Tracks', value: total - cracks, color: 'var(--success)', sub: 'Safe to operate' },
    { icon: '📊', label: 'Crack Rate', value: `${rate}%`, color: 'var(--saffron)', sub: 'Overall rate' },
    { icon: '📈', label: 'Avg Confidence', value: `${stats?.avgConf ?? '—'}%`, color: 'var(--text-m)', sub: 'Model certainty' },
    { icon: '📅', label: "Today's Events", value: stats?.todayCount ?? 0, color: 'var(--navy-l)', sub: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) },
  ];

  const empty = !events.length;

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    {empty && <div style={{ padding: '24px 20px', background: 'var(--warn-bg)', border: '1px solid var(--warn-br)', borderRadius: 'var(--r-md)', fontSize: 14, color: 'var(--warn)' }}>
      <b>👋 Welcome to DFCCIL Crack Detection System</b>
      <p style={{ margin: '8px 0 0', fontSize: 13 }}>Start by going to <b>Model Manager</b> to upload and load your .keras model, then use <b>Image Analysis</b> or <b>Video / Camera</b> to run predictions. Results appear here automatically.</p>
    </div>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16 }}>
      {METRICS.map(m => <Metric key={m.label} {...m} />)}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
      <Card title="Weekly Detection Summary" subtitle="Last 7 days">
        {weekData.every(d => d.cracks === 0 && d.normal === 0)
          ? <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-m)' }}>No data yet — run some predictions</p>
          : <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-m)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-m)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="cracks" name="Crack" fill="var(--danger)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="normal" name="Normal" fill="var(--success)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>}
      </Card>
      <Card title="Confidence Trend" subtitle="Last 20 predictions">
        {confTrend.length < 2
          ? <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-m)', fontSize: 12 }}>No data yet</p>
          : <ResponsiveContainer width="100%" height={220}>
            <LineChart data={confTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" />
              <XAxis dataKey="i" hide />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-m)' }} />
              <Tooltip formatter={v => [`${v}%`, 'Confidence']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="conf" stroke="var(--navy)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>}
      </Card>
    </div>

    <Card title="Recent Detections" subtitle={`Last ${Math.min(events.length, 8)} of ${total} total`} headerRight={<span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>● LIVE</span>}>
      {empty
        ? <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-m)' }}>No detections yet. Run an image or video analysis to see results here.</p>
        : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--navy)' }}>
              {['Event ID', 'Time', 'Source', 'File', 'Model', 'P(Crack)', 'Result', 'GPS', 'Report'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-h)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {events.slice(0, 8).map((r, i) => (
                <tr key={r.eventId || i} style={{ background: r.isCrack ? 'rgba(204,31,31,.03)' : i % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}>
                  <td style={TD}><code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{r.eventId || '—'}</code></td>
                  <td style={{ ...TD, fontSize: 11, color: 'var(--text-m)', whiteSpace: 'nowrap' }}>{r.timestamp ? new Date(r.timestamp).toLocaleString('en-IN') : '—'}</td>
                  <td style={TD}>{r.source}</td>
                  <td style={{ ...TD, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.filename}>{r.filename || '—'}</td>
                  <td style={{ ...TD, fontSize: 11, color: 'var(--text-2)' }}>{r.model || '—'}</td>
                  <td style={{ ...TD, fontWeight: 700, color: r.isCrack ? 'var(--danger)' : 'var(--success)' }}>{r.pCrack != null ? `${(r.pCrack * 100).toFixed(1)}%` : '—'}</td>
                  <td style={TD}><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: r.isCrack ? 'var(--danger-bg)' : 'var(--success-bg)', color: r.isCrack ? 'var(--danger)' : 'var(--success)', border: `1px solid ${r.isCrack ? 'var(--danger-br)' : 'var(--success-br)'}` }}>{r.status}</span></td>
                  <td style={TD}>{r.lat && r.lng ? <a href={r.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--navy)' }}>📍 {r.lat.toFixed(3)}</a> : '—'}</td>
                  <td style={TD}>
                    {r.hasReport
                      ? <button
                          onClick={() => handleViewReport(r.eventId)}
                          disabled={loadingReportId === r.eventId}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--navy)'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--navy)'; }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--navy)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--navy)', transition: 'all .15s', minWidth: 84, whiteSpace: 'nowrap' }}>
                          {loadingReportId === r.eventId ? <Spinner size={12} /> : '📄'} View Report
                        </button>
                      : <span style={{ fontSize: 10, color: 'var(--text-m)' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
    </Card>
  </div>;
}
const TD = { padding: '7px 12px', borderBottom: '1px solid var(--border-s)' };