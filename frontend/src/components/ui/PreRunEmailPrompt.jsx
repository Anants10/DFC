/**
 * PreRunEmailPrompt.jsx
 *
 * A modal that appears BEFORE running prediction (image, video, or camera).
 * Asks the user: "Do you want the crack detection report sent to your email?"
 *
 * YES → shows email input fields (multi-recipient with + button)
 *       user fills emails → clicks "Start Detection" → parent runs prediction
 *       → after prediction, parent auto-sends email with PDF
 *
 * NO  → parent runs prediction immediately, no email sent
 *
 * PROPS:
 *   isOpen      : bool
 *   onClose     : () => void   — cancelled (neither yes nor no confirmed)
 *   onConfirm   : (emails: string[] | null) => void
 *                   null  = user chose NO (run without email)
 *                   []... = user chose YES with these addresses
 *   context     : 'image' | 'video' | 'camera'  — for the title text
 */
import React, { useState, useEffect, useRef } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PreRunEmailPrompt({ isOpen, onClose, onConfirm, context = 'image' }) {
  const [choice,     setChoice]     = useState(null);   // null | 'yes' | 'no'
  const [recipients, setRecipients] = useState([{ id: 1, value: '', error: '' }]);
  const nextId = useRef(2);
  const firstInputRef = useRef(null);

  // Reset state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setChoice(null);
      setRecipients([{ id: 1, value: '', error: '' }]);
      nextId.current = 2;
    }
  }, [isOpen]);

  // Focus first input when YES is clicked
  useEffect(() => {
    if (choice === 'yes') {
      setTimeout(() => firstInputRef.current?.focus(), 80);
    }
  }, [choice]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Recipient helpers ────────────────────────────────────────────────────
  const addRecipient = () => {
    setRecipients(prev => [...prev, { id: nextId.current++, value: '', error: '' }]);
  };
  const removeRecipient = id => {
    if (recipients.length === 1) return;
    setRecipients(prev => prev.filter(r => r.id !== id));
  };
  const updateRecipient = (id, value) => {
    setRecipients(prev => prev.map(r =>
      r.id === id
        ? { ...r, value, error: value && !EMAIL_RE.test(value) ? 'Invalid email' : '' }
        : r
    ));
  };

  // ── Confirm handlers ─────────────────────────────────────────────────────
  const handleNo = () => onConfirm(null);

  const handleYesConfirm = () => {
    const validated = recipients.map(r => ({
      ...r,
      error: !r.value.trim() ? 'Required'
           : !EMAIL_RE.test(r.value.trim()) ? 'Invalid email'
           : '',
    }));
    setRecipients(validated);
    if (validated.some(r => r.error)) return;
    onConfirm(validated.map(r => r.value.trim()));
  };

  const contextLabel = context === 'camera' ? 'live camera detection'
                     : context === 'video'  ? 'video analysis'
                     : 'image analysis';

  const allFilled = recipients.every(r => r.value.trim() && !r.error);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 3001,
        transform: 'translate(-50%,-50%)',
        width: 480, maxWidth: '92vw',
        background: 'var(--surface)',
        borderRadius: 'var(--r-md)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        animation: 'modalIn .22s ease',
      }}>

        {/* Header */}
        <div style={{
          background: 'var(--navy)', padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#fff', fontFamily: 'var(--font-h)' }}>
              📧 Email Report?
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,.6)' }}>
              Before starting {contextLabel}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.12)', border: 'none',
            borderRadius: 6, color: '#fff', cursor: 'pointer',
            width: 30, height: 30, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '22px 22px 20px' }}>

          {/* Question */}
          {choice === null && (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Do you want the crack detection report sent to your email?
              </p>
              <p style={{ margin: '0 0 22px', fontSize: 12, color: 'var(--text-m)' }}>
                After {contextLabel} completes, the full PDF report (with crack photos,
                confidence scores and GPS) will be emailed automatically.
              </p>

              {/* YES / NO buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setChoice('yes')} style={{
                  flex: 1, padding: '13px 0', borderRadius: 'var(--r-sm)',
                  background: 'var(--navy)', color: '#fff',
                  border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  ✅ Yes, send report
                </button>
                <button onClick={handleNo} style={{
                  flex: 1, padding: '13px 0', borderRadius: 'var(--r-sm)',
                  background: 'var(--surface)', color: 'var(--text-2)',
                  border: '1.5px solid var(--border)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  ❌ No, skip email
                </button>
              </div>
            </>
          )}

          {/* Email input section */}
          {choice === 'yes' && (
            <>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
                Enter the email address(es) where you want the report sent:
              </p>

              {/* Recipients */}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 10,
                }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    Recipient Email(s)
                  </p>
                  <button onClick={addRecipient} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 'var(--r-sm)',
                    background: 'var(--navy)', color: '#fff',
                    border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Recipient
                  </button>
                </div>

                {recipients.map((r, idx) => (
                  <div key={r.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <input
                        ref={idx === 0 ? firstInputRef : null}
                        type="email"
                        placeholder={`recipient${idx + 1}@example.com`}
                        value={r.value}
                        onChange={e => updateRecipient(r.id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                        style={{
                          flex: 1, padding: '9px 12px',
                          border: `1.5px solid ${r.error ? 'var(--danger)' : 'var(--border)'}`,
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--bg)', color: 'var(--text)',
                          fontSize: 13, outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                      <button onClick={() => removeRecipient(r.id)}
                        disabled={recipients.length === 1}
                        style={{
                          padding: '0 12px', borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--danger)', fontSize: 18, fontWeight: 700,
                          cursor: recipients.length === 1 ? 'not-allowed' : 'pointer',
                          opacity: recipients.length === 1 ? 0.3 : 1, flexShrink: 0,
                        }}>×</button>
                    </div>
                    {r.error && (
                      <p style={{ margin: '3px 0 0 2px', fontSize: 11, color: 'var(--danger)' }}>
                        {r.error}
                      </p>
                    )}
                  </div>
                ))}

                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-m)' }}>
                  {recipients.length} recipient(s) · Press Enter or + to add more
                </p>
              </div>

              {/* Info note */}
              <div style={{
                padding: '9px 13px', marginBottom: 16,
                background: 'rgba(0,48,135,.06)',
                border: '1px solid rgba(0,48,135,.14)',
                borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--text-2)',
              }}>
                📎 The full PDF report with crack photos will be attached automatically after analysis completes.
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setChoice(null)} style={{
                  padding: '8px 16px', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>← Back</button>
                <button onClick={handleYesConfirm} disabled={!allFilled} style={{
                  padding: '8px 20px', borderRadius: 'var(--r-sm)',
                  background: allFilled ? 'var(--navy)' : 'var(--border)',
                  color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 700,
                  cursor: allFilled ? 'pointer' : 'not-allowed',
                  opacity: allFilled ? 1 : 0.6,
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  ▶ Start Detection
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
