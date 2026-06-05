// src/components/ResultPanel.tsx
import type { PredictResponse } from '../api/inference';
import { ModelCard } from './ModelCard';

interface Props {
  result: PredictResponse | null;
  loading: boolean;
}

// ── Confidence bar ────────────────────────────────────────
function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="conf-bar-wrap">
      <div
        className="conf-bar-fill"
        style={{ width: `${(value * 100).toFixed(1)}%`, background: color }}
      />
    </div>
  );
}

// ── Latency row ───────────────────────────────────────────
function LatRow({ label, ms, maxMs = 200 }: { label: string; ms: number; maxMs?: number }) {
  const pct = Math.min((ms / maxMs) * 100, 100);
  return (
    <div className="latency-row">
      <span style={{ minWidth: 72 }}>{label}</span>
      <div className="latency-bar">
        <div className="latency-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="latency-val">{ms.toFixed(1)} ms</span>
    </div>
  );
}

// ── Mini embedding bars ───────────────────────────────────
function EmbBars({ embedding }: { embedding: number[] }) {
  // Sample 48 evenly-spaced values from the 128-D vector
  const step   = Math.floor(embedding.length / 48);
  const sample = Array.from({ length: 48 }, (_, i) => embedding[i * step] ?? 0);
  const max    = Math.max(...sample.map(Math.abs), 0.01);

  const colors = [
    '#00d4ff', '#0080ff', '#7c3aed', '#a855f7',
    '#10d97e', '#059669', '#fbbf24', '#f59e0b',
  ];

  return (
    <div className="emb-bars">
      {sample.map((v, i) => {
        const h   = Math.max((Math.abs(v) / max) * 28, 2);
        const col = colors[i % colors.length];
        return (
          <div
            key={i}
            className="emb-bar"
            style={{ height: h, background: col + 'cc' }}
          />
        );
      })}
    </div>
  );
}

// ── Icons (inline SVG) ────────────────────────────────────
const DetectIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
  </svg>
);
const LivenessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const EmbedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
  </svg>
);
const TotalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

export function ResultPanel({ result, loading }: Props) {
  const lat = result?.latencies;

  // Liveness colour
  const lv = result?.livenessLabel;
  let lvColor  = 'var(--accent-primary)';
  let lvBadge  = 'badge-info';
  if (lv === 'REAL')          { lvColor = 'var(--accent-success)'; lvBadge = 'badge-real'; }
  else if (lv?.includes('SPOOF')) { lvColor = 'var(--accent-danger)';  lvBadge = 'badge-spoof'; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Stage 1: Detection ── */}
      <ModelCard
        title="Face Detection"
        icon={<DetectIcon />}
        latency={lat?.detectionMs}
        accentColor="var(--accent-primary)"
      >
        {result ? (
          result.faceDetected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex items-center justify-between">
                <span className="badge badge-real">DETECTED</span>
                <span className="font-mono text-xs text-muted">
                  {result.bbox
                    ? `[${result.bbox.xMin},${result.bbox.yMin}] → [${result.bbox.xMax},${result.bbox.yMax}]`
                    : '—'}
                </span>
              </div>
              <ConfBar value={result.bbox?.confidence ?? 0} color="var(--accent-primary)" />
              <span className="text-xs text-muted">
                Confidence: {((result.bbox?.confidence ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
          ) : (
            <span className="badge badge-warning">NO FACE</span>
          )
        ) : (
          <span className="text-xs text-muted">Waiting for frame…</span>
        )}
      </ModelCard>

      {/* ── Stage 2: Liveness ── */}
      <ModelCard
        title="Liveness (Mini-FAS-Net)"
        icon={<LivenessIcon />}
        latency={lat?.livenessMs}
        accentColor={lvColor}
      >
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="flex items-center justify-between">
              <span className={`badge ${lvBadge}`}>
                {result.livenessLabel?.replace('_', ' ') ?? '—'}
              </span>
              <span className="font-mono text-xs" style={{ color: lvColor }}>
                {result.livenessConfidence
                  ? `${(result.livenessConfidence * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            {result.livenessConfidence && (
              <ConfBar value={result.livenessConfidence} color={lvColor} />
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">Waiting…</span>
        )}
      </ModelCard>

      {/* ── Stage 3: Embedding ── */}
      <ModelCard
        title="GhostFaceNet-S Embedding"
        icon={<EmbedIcon />}
        latency={lat?.recognitionMs}
        accentColor="var(--accent-secondary)"
      >
        {result?.embedding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">128-D  •  L2 = {result.embeddingNorm?.toFixed(4)}</span>
              {result.topMatch ? (
                <span className="badge badge-real">{result.topMatch}</span>
              ) : (
                <span className="badge badge-info">Unknown</span>
              )}
            </div>
            <EmbBars embedding={result.embedding} />
            {result.topMatch && result.matchScore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-xs text-muted">Match score:</span>
                <ConfBar value={result.matchScore} color="var(--accent-success)" />
                <span className="font-mono text-xs text-success">
                  {(result.matchScore * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">Waiting…</span>
        )}
      </ModelCard>

      {/* ── Total latency ── */}
      <ModelCard
        title="Pipeline Latency"
        icon={<TotalIcon />}
        accentColor="var(--accent-warning)"
      >
        {lat ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="stat-value" style={{ color: 'var(--accent-warning)' }}>
                {lat.totalMs.toFixed(1)}
                <span className="stat-unit">ms</span>
              </span>
              <span className="text-xs text-muted">
                ~{(1000 / lat.totalMs).toFixed(0)} FPS theoretical
              </span>
            </div>
            <LatRow label="Detect"  ms={lat.detectionMs}   maxMs={150} />
            <LatRow label="Liveness" ms={lat.livenessMs}   maxMs={150} />
            <LatRow label="Embed"   ms={lat.recognitionMs} maxMs={150} />
          </div>
        ) : (
          loading ? (
            <div className="flex items-center gap-2">
              <div className="spinner" /><span className="text-xs text-muted">Running…</span>
            </div>
          ) : (
            <span className="text-xs text-muted">Start camera to begin</span>
          )
        )}
      </ModelCard>
    </div>
  );
}
