// src/components/RegisterModal.tsx
import { useState } from 'react';
import { registerFace } from '../api/inference';
import type { RegisterResponse } from '../api/inference';

interface Props {
  captureFrame: (quality?: number) => string | null;
  onClose: () => void;
  onRegistered: () => void;
}

export function RegisterModal({ captureFrame, onClose, onRegistered }: Props) {
  const [name,     setName]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<RegisterResponse | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const handleRegister = async () => {
    if (!name.trim()) { setError('Please enter a name'); return; }
    const frame = captureFrame(0.85);
    if (!frame) { setError('Camera not ready — start camera first'); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await registerFace(frame, name.trim());
      setResult(res);
      if (res.success) onRegistered();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div style={{
              width: 40, height: 40,
              background: 'linear-gradient(135deg,rgba(0,212,255,0.2),rgba(124,58,237,0.2))',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
                <path d="M16 11l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Register Face</h2>
              <p className="text-xs text-muted">Capture embedding from the live camera</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Name input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Full Name / ID
          </label>
          <input
            id="register-name"
            className="input"
            type="text"
            placeholder="e.g. Rajesh Kumar"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRegister(); }}
            autoFocus
          />
        </div>

        {/* Info box */}
        <div style={{
          background: 'rgba(0,212,255,0.06)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          marginBottom: 20,
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}>
          <strong style={{ color: 'var(--accent-primary)' }}>Tip:</strong> Make sure your face
          is clearly visible and centred before registering. The current video frame will
          be captured.
        </div>

        {/* Result / error */}
        {result && (
          <div style={{
            background: result.success ? 'rgba(16,217,126,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${result.success ? 'rgba(16,217,126,0.25)' : 'rgba(239,68,68,0.25)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: 16,
          }}>
            <p style={{
              fontSize: '0.83rem',
              color: result.success ? 'var(--accent-success)' : 'var(--accent-danger)',
              fontWeight: 600,
            }}>
              {result.message}
            </p>
            {result.embeddingNorm !== null && (
              <p className="text-xs text-muted mt-1">
                Embedding L2 norm: <span className="font-mono">{result.embeddingNorm?.toFixed(4)}</span>
              </p>
            )}
          </div>
        )}
        {error && (
          <p style={{
            fontSize: '0.8rem', color: 'var(--accent-danger)',
            marginBottom: 16, padding: '8px 12px',
            background: 'rgba(239,68,68,0.08)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {!result?.success ? (
            <>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                Cancel
              </button>
              <button
                id="register-submit-btn"
                className="btn btn-success"
                style={{ flex: 2 }}
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? <><div className="spinner" /> Capturing…</> : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                    </svg>
                    Register Face
                  </>
                )}
              </button>
            </>
          ) : (
            <button className="btn btn-primary w-full" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
