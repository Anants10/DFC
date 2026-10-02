/**
 * EmailModal.jsx
 *
 * A modal dialog for sending crack detection reports by email.
 *
 * FEATURES:
 *   - Multiple recipients with + button to add more email fields
 *   - Individual × buttons to remove any email
 *   - Real-time email format validation per field
 *   - Optional PDF attachment (base64 from the page)
 *   - Status: loading spinner while sending, success/error result
 *   - Email configured? warning shown if EMAIL_USER/.env not set
 *
 * PROPS:
 *   isOpen      : boolean  — show/hide the modal
 *   onClose     : ()=>void — close callback
 *   data        : object   — detection result to include in email body
 *   pdfBase64   : string|null — base64 PDF to attach (optional)
 *   showToast   : function — toast notification function from parent
 *
 * USAGE (from any page):
 *   const [emailOpen, setEmailOpen] = useState(false);
 *   const [pdfB64, setPdfB64]       = useState(null);
 *
 *   <EmailModal
 *     isOpen={emailOpen}
 *     onClose={() => setEmailOpen(false)}
 *     data={result}          // the detection result object
 *     pdfBase64={pdfB64}     // optional PDF base64 string
 *     showToast={showToast}
 *   />
 *
 *   <Button onClick={() => setEmailOpen(true)}>📧 Email Report</Button>
 */
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api.js';
import Spinner from './Spinner.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  return EMAIL_RE.test((email || '').trim());
}

export default function EmailModal({ isOpen, onClose, data = {}, pdfBase64 = null, showToast }) {
  // Each recipient is an object: { id, value, error }
  const [recipients, setRecipients] = useState([{ id: 1, value: '', error: '' }]);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [emailCfg,   setEmailCfg]   = useState(null);  // server email config status
  const nextId = useRef(2);

  // ── Fetch email config status when modal opens ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setSent(false); setSendResult(null);
    setRecipients([{ id: 1, value: '', error: '' }]);
    nextId.current = 2;
    api.emailStatus().then(setEmailCfg).catch(() => setEmailCfg({ ok: false, configured: false }));
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Recipient management ────────────────────────────────────────────────────
  const addRecipient = () => {
    setRecipients(prev => [...prev, { id: nextId.current++, value: '', error: '' }]);
  };

  const removeRecipient = (id) => {
    if (recipients.length === 1) return; // always keep at least one field
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  const updateRecipient = (id, value) => {
    setRecipients(prev => prev.map(r =>
      r.id === id
        ? { ...r, value, error: value && !validateEmail(value) ? 'Invalid email format' : '' }
        : r
    ));
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    // Validate all fields
    const validated = recipients.map(r => ({
      ...r,
      error: !r.value.trim() ? 'Email is required'
        : !validateEmail(r.value) ? 'Invalid email format'
        : '',
    }));
    setRecipients(validated);
    if (validated.some(r => r.error)) return;

    const emails = validated.map(r => r.value.trim());
    setSending(true);
    try {
      const result = await api.sendEmail({
        recipients: emails,
        data,
        pdfBase64: pdfBase64 || null,
      });
      setSendResult(result);
      setSent(true);
      if (result.ok) {
        showToast(`Report sent to ${result.accepted?.length || emails.length} recipient(s)`, 'success');
      } else {
        showToast(`Email failed: ${result.error}`, 'error');
      }
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
      showToast(`Email error: ${e.message}`, 'error');
    }
    setSending(false);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isCrack    = data?.isCrack;
  const verdict    = isCrack ? 'CRACK DETECTED' : 'Normal Track';
  const clr        = isCrack ? 'var(--danger)' : 'var(--success)';
  const allFilled  = recipients.every(r => r.value.trim() && !r.error);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 1001,
        transform: 'translate(-50%,-50%)',
        background: 'var(--surface)', borderRadius: 'var(--r-md)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        width: 520, maxWidth: '95vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        animation: 'modalIn .22s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg)', borderRadius: 'var(--r-md) var(--r-md) 0 0',
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, fontFamily: 'var(--font-h)', color: 'var(--navy)' }}>
              📧 Email Report
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-m)' }}>
              Send crack detection report to one or more recipients
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: 'var(--text-m)', padding: '4px 8px',
          }}>✕</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>

          {/* Detection summary */}
          <div style={{
            padding: '12px 16px', marginBottom: 18,
            borderRadius: 'var(--r-sm)',
            background: isCrack ? 'var(--danger-bg)' : 'var(--success-bg)',
            border: `1px solid ${isCrack ? 'var(--danger-br)' : 'var(--success-br)'}`,
          }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: clr }}>
              {isCrack ? '⚠' : '✓'}&nbsp;&nbsp;{verdict}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
              {data?.filename && `File: ${data.filename}  |  `}
              P(crack): {((data?.pCrack || 0) * 100).toFixed(2)}%  |  
              P(normal): {((data?.pNormal || 0) * 100).toFixed(2)}%
              {data?.model && `  |  Model: ${data.model}`}
            </p>
          </div>

          {/* Email not configured warning */}
          {emailCfg && !emailCfg.configured && (
            <div style={{
              padding: '10px 14px', marginBottom: 16,
              background: 'var(--warn-bg)', border: '1px solid var(--warn-br)',
              borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--warn)',
            }}>
              <strong>Email not configured.</strong> Add <code>EMAIL_USER</code> and <code>EMAIL_PASS</code> to{' '}
              <code>backend/.env</code> and restart Express.
              <br />See the setup instructions below.
            </div>
          )}

          {/* PDF attachment info */}
          {pdfBase64 && (
            <div style={{
              padding: '8px 12px', marginBottom: 16,
              background: 'rgba(0,48,135,.06)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--text-2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>📎</span>
              <span>PDF report will be attached to the email</span>
            </div>
          )}

          {/* Recipients */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                Recipient Email Addresses
              </p>
              <button
                onClick={addRecipient}
                disabled={sending || sent}
                title="Add another recipient"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 'var(--r-sm)',
                  background: 'var(--navy)', color: '#fff',
                  border: 'none', fontSize: 12, fontWeight: 700,
                  cursor: sending || sent ? 'not-allowed' : 'pointer',
                  opacity: sending || sent ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Add Recipient
              </button>
            </div>

            {recipients.map((r, idx) => (
              <div key={r.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="email"
                      placeholder={`recipient${idx + 1}@example.com`}
                      value={r.value}
                      disabled={sending || sent}
                      onChange={e => updateRecipient(r.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addRecipient(); }
                      }}
                      style={{
                        width: '100%', padding: '9px 12px',
                        borderRadius: 'var(--r-sm)',
                        border: `1.5px solid ${r.error ? 'var(--danger)' : 'var(--border)'}`,
                        background: 'var(--bg)', color: 'var(--text)',
                        fontSize: 13, boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    {r.error && (
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--danger)' }}>
                        {r.error}
                      </p>
                    )}
                  </div>
                  {/* Remove button — always shown but disabled if only one field */}
                  <button
                    onClick={() => removeRecipient(r.id)}
                    disabled={recipients.length === 1 || sending || sent}
                    title="Remove this recipient"
                    style={{
                      padding: '0 12px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--danger)', fontSize: 16, fontWeight: 700,
                      cursor: recipients.length === 1 || sending || sent ? 'not-allowed' : 'pointer',
                      opacity: recipients.length === 1 || sending || sent ? 0.35 : 1,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-m)' }}>
              {recipients.length} recipient(s) · Press Enter or click + to add more
            </p>
          </div>

          {/* Sent result */}
          {sent && sendResult && (
            <div style={{
              marginTop: 16, padding: '12px 16px',
              borderRadius: 'var(--r-sm)',
              background: sendResult.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
              border: `1px solid ${sendResult.ok ? 'var(--success-br)' : 'var(--danger-br)'}`,
            }}>
              {sendResult.ok ? (
                <>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--success)', fontSize: 13 }}>
                    ✅ Report sent successfully!
                  </p>
                  {sendResult.accepted?.length > 0 && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                      Delivered to: {sendResult.accepted.join(', ')}
                    </p>
                  )}
                  {sendResult.rejected?.length > 0 && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--danger)' }}>
                      Rejected: {sendResult.rejected.join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--danger)', fontSize: 13 }}>
                    ❌ Send failed
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                    {sendResult.error}
                  </p>
                  {sendResult.hint && (
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-m)' }}>
                      {sendResult.hint}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          background: 'var(--bg)', borderRadius: '0 0 var(--r-md) var(--r-md)',
        }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}>
            {sent ? 'Close' : 'Cancel'}
          </button>
          {!sent && (
            <button
              onClick={handleSend}
              disabled={sending || !allFilled || (emailCfg && !emailCfg.configured)}
              style={{
                padding: '8px 20px', borderRadius: 'var(--r-sm)',
                background: 'var(--navy)', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 700,
                cursor: sending || !allFilled || (emailCfg && !emailCfg.configured) ? 'not-allowed' : 'pointer',
                opacity: sending || !allFilled || (emailCfg && !emailCfg.configured) ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {sending ? <><Spinner size={13} color="#fff" /> Sending…</> : '📧 Send Report'}
            </button>
          )}
          {sent && sendResult?.ok && (
            <button onClick={() => { setSent(false); setSendResult(null); setRecipients([{id:1,value:'',error:''}]); nextId.current=2; }} style={{
              padding: '8px 18px', borderRadius: 'var(--r-sm)',
              background: 'var(--navy)', color: '#fff',
              border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Send to More
            </button>
          )}
        </div>
      </div>
    </>
  );
}
