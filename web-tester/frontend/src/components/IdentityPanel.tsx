// src/components/IdentityPanel.tsx
import { useState, useEffect, useCallback } from 'react';
import { getIdentities, deleteIdentity } from '../api/inference';
import type { IdentityRecord } from '../api/inference';

interface Props {
  refreshTrigger: number;
}

export function IdentityPanel({ refreshTrigger }: Props) {
  const [identities, setIdentities] = useState<IdentityRecord[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getIdentities();
      setIdentities(data.identities);
    } catch {
      // Backend might not be up yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const handleDelete = async (name: string) => {
    setDeleting(name);
    try {
      await deleteIdentity(name);
      setIdentities(prev => prev.filter(i => i.name !== name));
    } catch (err) {
      alert(`Delete failed: ${err}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Face Registry</h3>
          <p className="text-xs text-muted mt-1">
            {identities.length} registered {identities.length === 1 ? 'identity' : 'identities'}
          </p>
        </div>
        <button
          id="refresh-identities-btn"
          className="btn btn-ghost btn-sm btn-icon"
          onClick={load}
          title="Refresh"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: loading ? 'spin 0.7s linear infinite' : undefined }}>
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {/* List */}
      {identities.length === 0 ? (
        <div className="glass-card p-6" style={{ textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
            strokeWidth="1.2" style={{ margin: '0 auto 12px' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p className="text-sm text-muted">No identities registered yet.</p>
          <p className="text-xs text-muted mt-1">Click Register Face to add someone.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {identities.map((id, idx) => {
            const hue    = (idx * 57) % 360;
            const initials = id.name
              .split(' ')
              .map(w => w[0]?.toUpperCase())
              .slice(0, 2)
              .join('');

            return (
              <div key={id.name} className="identity-item">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: `hsl(${hue},60%,20%)`,
                    border: `2px solid hsl(${hue},60%,45%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700,
                    color: `hsl(${hue},80%,75%)`,
                    flexShrink: 0,
                  }}>
                    {initials || '?'}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{id.name}</p>
                    <p className="text-xs text-muted font-mono">
                      128-D  •  norm={id.embeddingNorm.toFixed(3)}
                    </p>
                  </div>
                </div>

                <button
                  id={`delete-identity-${id.name.replace(/\s+/g, '-')}`}
                  className="btn btn-ghost btn-sm btn-icon"
                  style={{ color: 'var(--accent-danger)' }}
                  onClick={() => handleDelete(id.name)}
                  disabled={deleting === id.name}
                  title={`Remove ${id.name}`}
                >
                  {deleting === id.name ? (
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
