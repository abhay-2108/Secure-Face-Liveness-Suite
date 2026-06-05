// src/components/ModelCard.tsx
interface Props {
  title: string;
  icon: React.ReactNode;
  latency?: number;
  accentColor?: string;
  children: React.ReactNode;
}

export function ModelCard({ title, icon, latency, accentColor = 'var(--accent-primary)', children }: Props) {
  return (
    <div className="glass-card p-4" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      borderTop: `2px solid ${accentColor}`,
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{icon}</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            {title}
          </span>
        </div>
        {latency !== undefined && (
          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {latency.toFixed(1)} ms
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
