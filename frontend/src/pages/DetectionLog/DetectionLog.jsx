import React, { useState, useCallback, useEffect } from 'react';
import { HelpInfoButton } from '../../components/ui/HelpModal.jsx';
import { useApp }  from '../../context/AppContext.jsx';
import { api }     from '../../services/api.js';
import Card        from '../../components/ui/Card.jsx';
import Button      from '../../components/ui/Button.jsx';
import Spinner     from '../../components/ui/Spinner.jsx';
import { jsPDF }   from 'jspdf';

function exportCSV(rows) {
  if (!rows.length) return;

  // Wrap every field in double-quotes and escape internal quotes (RFC 4180).
  // This prevents the "######" / column-shift bug caused by commas inside
  // date strings like "13/6/2026, 12:45:06 pm".
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Format timestamp as ISO-style string with no comma: "2026-06-13 12:45:06"
  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const headers = [
    'Event ID','Timestamp','Source','File','Model',
    'P(Crack)%','P(Normal)%','Confidence%','Status','GPS Lat','GPS Lng','Maps Link'
  ];

  const dataRows = rows.map(r => [
    r.eventId   || '',
    fmtDate(r.timestamp),
    r.source    || '',
    r.filename  || '',
    r.model     || '',
    r.pCrack    != null ? (r.pCrack  * 100).toFixed(2) : '',
    r.pNormal   != null ? (r.pNormal * 100).toFixed(2) : '',
    r.confidence!= null ? (r.confidence * 100).toFixed(2) : '',
    r.status    || '',
    r.lat       != null ? String(r.lat) : '',
    r.lng       != null ? String(r.lng) : '',
    r.mapsLink  || '',
  ]);

  const lines = [
    headers.map(q).join(','),
    ...dataRows.map(row => row.map(q).join(',')),
  ];

  // BOM (\uFEFF) makes Excel open UTF-8 correctly without garbled characters
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crack_log_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function DetectionLog({ showToast, confirmToast, openHelp }) {
  const { events, removeEvent, refreshEvents } = useApp();
  const [search,      setSearch]      = useState('');
  const [statusF,     setStatusF]     = useState('ALL');
  const [sourceF,     setSourceF]     = useState('ALL');
  const [deletingId,  setDeletingId]  = useState(null);
  const [clearing,    setClearing]    = useState(false);

  // Pagination — 15 events per page. Page 1 always shows the most recent
  // 15 (events already arrive newest-first from GET /api/events).
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);

  // View Report — fetches the stored PDF for one event on demand and
  // opens it in a new tab. Loading state is per-event so other rows'
  // buttons stay usable while one report is loading.
  const [loadingReportId, setLoadingReportId] = useState(null);

  const filtered = events.filter(e => {
    const hay = `${e.eventId||''} ${e.filename||''} ${e.model||''}`.toLowerCase();
    return (!search || hay.includes(search.toLowerCase()))
      && (statusF === 'ALL' || e.status === statusF)
      && (sourceF === 'ALL' || e.source === sourceF);
  });

  const total  = filtered.length;
  const cracks = filtered.filter(e => e.isCrack).length;
  const rate   = total ? ((cracks / total) * 100).toFixed(0) : '0';

  // Clamp page whenever the filtered set shrinks (e.g. after a delete, or
  // after changing search/filter) so we never sit on an empty page.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const safePage = Math.min(page, totalPages);

  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows  = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  // Reset to page 1 whenever the user changes search/filters, so they
  // don't land on a stale/empty page from a previous filter.
  const updateSearch = (v) => { setSearch(v); setPage(1); };
  const updateStatusF = (v) => { setStatusF(v); setPage(1); };
  const updateSourceF = (v) => { setSourceF(v); setPage(1); };
  const resetFilters = () => { setSearch(''); setStatusF('ALL'); setSourceF('ALL'); setPage(1); };

  const handleViewReport = useCallback(async (id) => {
    if (!id) return;
    setLoadingReportId(id);
    try {
      const r = await api.getEventReport(id);
      if (r.success && r.reportPdf) {
        // Open the stored PDF (data URI) in a new tab.
        const w = window.open();
        if (w) {
          w.document.write(`<iframe src="${r.reportPdf}" style="border:0;width:100%;height:100vh;" title="Report ${id}"></iframe>`);
          w.document.title = `Report — ${id}`;
        } else {
          showToast('Popup blocked — allow popups to view the report', 'warn');
        }
      } else {
        showToast(r.error || `No saved report for ${id}`, 'error');
      }
    } catch (e) {
      showToast(`❌ Failed to load report: ${e.message}`, 'error');
    }
    setLoadingReportId(null);
  }, [showToast]);

  const handleDelete = useCallback(id => {
    confirmToast(`Delete event ${id}? Cannot be undone.`, async () => {
      setDeletingId(id);
      const r = await removeEvent(id);
      setDeletingId(null);
      showToast(r.success ? `✅ Deleted ${id}` : `❌ ${r.error}`, r.success ? 'success' : 'error');
    });
  }, [confirmToast, removeEvent, showToast]);

  const handleClearAll = () => {
    confirmToast('Delete ALL detection events? This cannot be undone.', async () => {
      setClearing(true);
      const r = await api.clearAll();
      await refreshEvents();
      setClearing(false);
      setPage(1);
      showToast(r.success ? `✅ Cleared ${r.deleted} events` : `❌ ${r.error}`, r.success ? 'success' : 'error');
    });
  };

  return <div>
    {/* Summary strip */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
      {[['Total Events', total, 'var(--navy)'], ['Cracks', cracks, 'var(--danger)'], ['Normal', total - cracks, 'var(--success)'], ['Crack Rate', `${rate}%`, 'var(--saffron)']].map(([l, v, c]) => (
        <div key={l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${c}`, borderRadius: 'var(--r-md)', padding: '14px 18px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-h)', color: c }}>{v}</div>
          <div style={{ fontSize: 12, color: 'var(--text-m)', marginTop: 2 }}>{l}</div>
        </div>
      ))}
    </div>

    <Card title="Detection Events" subtitle={`${total} events · ${events.length} total in database`}
      headerRight={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{openHelp&&<HelpInfoButton featureKey="log" openHelp={openHelp} label="Detection Log"/>}
        <Button variant="ghost"     size="sm" onClick={() => exportCSV(filtered)} disabled={!total}>⬇ CSV</Button>
        <Button variant="secondary" size="sm" onClick={handleClearAll} disabled={clearing || !events.length} style={{ color: 'var(--danger)' }}>
          {clearing ? <Spinner size={12}/> : '🗑 Clear All'}
        </Button>
      </div>}>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => updateSearch(e.target.value)} placeholder="🔍 Search by ID, file, model…"
          style={{ flex: '1 1 200px', padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }} />
        <select value={statusF} onChange={e => updateStatusF(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="ALL">All Results</option><option value="CRACK">CRACK</option><option value="NORMAL">NORMAL</option>
        </select>
        <select value={sourceF} onChange={e => updateSourceF(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="ALL">All Sources</option><option value="image">Image</option><option value="video">Video</option><option value="camera">Camera</option>
        </select>
        <Button variant="secondary" size="sm" onClick={resetFilters}>Reset</Button>
      </div>

      {!total
        ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-m)' }}>
          {events.length === 0 ? <><div style={{ fontSize: 32, marginBottom: 8 }}>📋</div><p>No detections yet. Run image or video analysis to see results.</p></>
            : <p>No records match the current filter.</p>}
        </div>
        : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--navy)' }}>
              {['#','Event ID','Timestamp','Source','File','Model','Confidence','Result','GPS','Report','Action'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-h)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.eventId || r._id || i} style={{ background: r.isCrack ? 'rgba(204,31,31,.03)' : i % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}>
                  <td style={TD}>{pageStart + i + 1}</td>
                  <td style={TD}><code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{r.eventId || '—'}</code></td>
                  <td style={{ ...TD, fontSize: 11, color: 'var(--text-m)', whiteSpace: 'nowrap' }}>{r.timestamp ? new Date(r.timestamp).toLocaleString('en-IN') : '—'}</td>
                  <td style={TD}>{r.source}</td>
                  <td style={{ ...TD, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.filename}>{r.filename || '—'}</td>
                  <td style={{ ...TD, fontSize: 11, color: 'var(--text-2)' }}>{r.model || '—'}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 50, height: 5, background: 'var(--border-s)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(r.confidence || 0) * 100}%`, height: '100%', background: r.isCrack ? 'var(--danger)' : 'var(--success)', borderRadius: 3 }} />
                      </div>
                      <span>{((r.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={TD}><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: r.isCrack ? 'var(--danger-bg)' : 'var(--success-bg)', color: r.isCrack ? 'var(--danger)' : 'var(--success)', border: `1px solid ${r.isCrack ? 'var(--danger-br)' : 'var(--success-br)'}` }}>{r.status}</span></td>
                  <td style={TD}>{r.lat && r.lng ? <a href={r.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--navy)' }}>📍 {r.lat.toFixed(3)}</a> : '—'}</td>
                  <td style={TD}>
                    {r.hasReport
                      ? <button onClick={() => handleViewReport(r.eventId || r._id)} disabled={loadingReportId === (r.eventId || r._id)}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--navy)'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--navy)'; }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--navy)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--navy)', transition: 'all .15s', minWidth: 84 }}>
                          {loadingReportId === (r.eventId || r._id) ? <Spinner size={12} /> : '📄'} View Report
                        </button>
                      : <span style={{ fontSize: 10, color: 'var(--text-m)' }}>—</span>
                    }
                  </td>
                  <td style={TD}>
                    <button onClick={() => handleDelete(r.eventId || r._id)} disabled={deletingId === (r.eventId || r._id)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger-br)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-m)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text-m)', transition: 'all .15s', minWidth: 60 }}>
                      {deletingId === (r.eventId || r._id) ? <Spinner size={12} /> : '🗑'} Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination — 15 events per page, newest first */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={() => goToPage(safePage - 1)} disabled={safePage === 1}
                style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: safePage === 1 ? 'var(--text-m)' : 'var(--text)', cursor: safePage === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: safePage === 1 ? 0.5 : 1 }}>
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                // Show first, last, current, and immediate neighbours; collapse the rest into "…"
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) => p === '…'
                  ? <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', fontSize: 12, color: 'var(--text-m)' }}>…</span>
                  : <button key={p} onClick={() => goToPage(p)}
                      style={{
                        padding: '5px 10px', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer',
                        border: `1px solid ${p === safePage ? 'var(--navy)' : 'var(--border)'}`,
                        background: p === safePage ? 'var(--navy)' : 'var(--surface)',
                        color: p === safePage ? '#fff' : 'var(--text)',
                        fontWeight: p === safePage ? 700 : 400,
                        minWidth: 30,
                      }}>
                      {p}
                    </button>
                )}
              <button onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages}
                style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: safePage === totalPages ? 'var(--text-m)' : 'var(--text)', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', fontSize: 12, opacity: safePage === totalPages ? 0.5 : 1 }}>
                Next ›
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-m)', marginLeft: 8 }}>
                Page {safePage} of {totalPages} · showing {pageRows.length} of {total}
              </span>
            </div>
          )}
        </div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-m)', marginTop: 12 }}>
        <span>{total ? `${pageStart + 1}–${pageStart + pageRows.length} of ${total} records` : '0 records'} shown · {events.length} total</span>
        <span>DFCCIL Crack Detection · Western DFC Corridor</span>
      </div>
    </Card>
  </div>;
}
const TD = { padding: '8px 12px', borderBottom: '1px solid var(--border-s)' };