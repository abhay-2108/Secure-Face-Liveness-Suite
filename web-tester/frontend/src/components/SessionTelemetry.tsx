import { useEffect, useState } from 'react';
import { getTelemetry, TelemetryResponse } from '../api/inference';
import '../index.css';

export function SessionTelemetry() {
  const [data, setData] = useState<TelemetryResponse | null>(null);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const t = await getTelemetry();
        setData(t);
      } catch (err) {
        console.warn('Failed to fetch telemetry', err);
      }
    };
    
    // Initial fetch
    fetchTelemetry();
    
    // Poll every 2 seconds
    const id = setInterval(fetchTelemetry, 2000);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ marginRight: 8 }} /> Fetching Telemetry...
      </div>
    );
  }

  const formatUptime = (sec: number) => {
    if (sec < 60) return `${Math.floor(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s}s`;
  };

  return (
    <div style={{ padding: '24px', animation: 'fade-in 0.4s ease-out' }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 600 }}>Zero-Trust Telemetry</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Live session statistics. Data is ephemeral and not saved to disk.
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '16px' 
      }}>
        
        {/* Total Inferences */}
        <div className="telemetry-card">
          <div className="telemetry-label">Frames Processed</div>
          <div className="telemetry-value" style={{ color: 'var(--accent-primary)' }}>
            {data.totalInferences.toLocaleString()}
          </div>
        </div>

        {/* Average Latency */}
        <div className="telemetry-card">
          <div className="telemetry-label">Average Pipeline Latency</div>
          <div className="telemetry-value" style={{ color: 'var(--accent-warning)' }}>
            {data.avgLatencyMs.toFixed(1)} <span style={{ fontSize: '1rem' }}>ms</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ~{(data.avgLatencyMs > 0 ? (1000 / data.avgLatencyMs) : 0).toFixed(0)} FPS
          </div>
        </div>

        {/* Real vs Spoof */}
        <div className="telemetry-card">
          <div className="telemetry-label">Liveness Results</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <div style={{ color: 'var(--accent-success)', fontSize: '1.25rem', fontWeight: 700 }}>{data.realFaces}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>REAL</div>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div>
              <div style={{ color: 'var(--accent-danger)', fontSize: '1.25rem', fontWeight: 700 }}>{data.spoofFaces}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SPOOF</div>
            </div>
          </div>
        </div>

        {/* Uptime */}
        <div className="telemetry-card">
          <div className="telemetry-label">Session Uptime</div>
          <div className="telemetry-value" style={{ color: '#aaa' }}>
            {formatUptime(data.uptimeSeconds)}
          </div>
        </div>

      </div>

      <style>{`
        .telemetry-card {
          background: rgba(20, 25, 40, 0.5);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          transition: transform 0.2s;
        }
        .telemetry-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.1);
        }
        .telemetry-label {
          color: var(--text-muted);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .telemetry-value {
          font-size: 2rem;
          font-weight: 800;
          font-family: var(--text-mono);
        }
      `}</style>
    </div>
  );
}
