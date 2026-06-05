// src/App.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import { useCamera } from './hooks/useCamera';
import { predict, checkHealth } from './api/inference';
import type { PredictResponse } from './api/inference';
import { CameraFeed } from './components/CameraFeed';
import { ResultPanel } from './components/ResultPanel';
import { RegisterModal } from './components/RegisterModal';
import { IdentityPanel } from './components/IdentityPanel';

type Tab = 'live' | 'registry';

const CAPTURE_INTERVAL_MS = 333; // ~3 FPS to backend

export default function App() {
  const camera = useCamera();
  const [tab,             setTab]           = useState<Tab>('live');
  const [isRunning,       setIsRunning]      = useState(false);
  const [result,          setResult]         = useState<PredictResponse | null>(null);
  const [loading,         setLoading]        = useState(false);
  const [backendReady,    setBackendReady]   = useState(false);
  const [showRegister,    setShowRegister]   = useState(false);
  const [registryTrigger, setRegistryTrigger] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll backend health ──────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const ok = await checkHealth();
      setBackendReady(ok);
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Inference loop ───────────────────────────────────────
  const runInference = useCallback(async () => {
    if (!camera.active) return;
    const frame = camera.captureFrame(0.75);
    if (!frame) return;
    setLoading(true);
    try {
      const res = await predict(frame);
      setResult(res);
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [camera]);

  const startInference = useCallback(() => {
    if (intervalRef.current) return;
    setIsRunning(true);
    intervalRef.current = setInterval(runInference, CAPTURE_INTERVAL_MS);
  }, [runInference]);

  const stopInference = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  // Stop loop and clear results if camera stopped
  useEffect(() => {
    if (!camera.active) {
      stopInference();
      setResult(null);
    }
  }, [camera.active, stopInference]);

  // Restart loop when runInference ref changes (e.g. camera flipped)
  useEffect(() => {
    if (isRunning && camera.active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(runInference, CAPTURE_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runInference, isRunning, camera.active]);

  const handleStartCamera = async () => {
    await camera.start();
  };

  const handleStopCamera = () => {
    stopInference();
    camera.stop();
    setResult(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ═══ Header ═══════════════════════════════════════════ */}
      <header style={{
        padding: '16px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10,18,40,0.8)',
        backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div style={{
            width: 38, height: 38,
            background: 'linear-gradient(135deg,#00a8cc,#0070ff)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,168,204,0.4)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <circle cx="12" cy="10" r="3"/>
              <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              NHAI <span style={{ color: 'var(--accent-primary)' }}>Aegis</span>
            </h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
              Face AI Web Tester — ONNX INT8
            </p>
          </div>
        </div>

        {/* Backend status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" style={{
            padding: '5px 12px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border)',
            borderRadius: 99,
          }}>
            <span className={`pulse-dot ${backendReady ? 'live' : 'inactive'}`} />
            <span className="text-xs" style={{ color: backendReady ? 'var(--accent-success)' : 'var(--text-muted)' }}>
              {backendReady ? 'Backend Ready' : 'Backend Offline'}
            </span>
          </div>

          {camera.active && (
            <button
              id="register-face-btn"
              className="btn btn-primary btn-sm"
              onClick={() => setShowRegister(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              Register Face
            </button>
          )}
        </div>
      </header>

      {/* ═══ Main ═════════════════════════════════════════════ */}
      <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

        {/* Tab bar */}
        <div style={{ marginBottom: 24, maxWidth: 360 }}>
          <div className="tab-bar">
            <button
              id="tab-live"
              className={`tab-btn ${tab === 'live' ? 'active' : ''}`}
              onClick={() => setTab('live')}
            >
              🎥  Live Test
            </button>
            <button
              id="tab-registry"
              className={`tab-btn ${tab === 'registry' ? 'active' : ''}`}
              onClick={() => setTab('registry')}
            >
              🗂️  Registry
            </button>
          </div>
        </div>

        {/* ── LIVE TEST TAB ─────────────────────────────────── */}
        {tab === 'live' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 360px',
            gap: 24,
            alignItems: 'start',
          }}>
            {/* Left: camera + controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <CameraFeed
                videoRef={camera.videoRef}
                active={camera.active}
                result={result}
                isRunning={isRunning}
              />

              {/* Camera controls */}
              <div className="glass-card p-4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {!camera.active ? (
                  <button
                    id="start-camera-btn"
                    className="btn btn-primary"
                    onClick={handleStartCamera}
                    disabled={!backendReady}
                    title={!backendReady ? 'Backend is offline' : ''}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                    </svg>
                    Start Camera
                  </button>
                ) : (
                  <>
                    <button id="stop-camera-btn" className="btn btn-danger" onClick={handleStopCamera}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="6" y="6" width="12" height="12"/>
                      </svg>
                      Stop
                    </button>

                    {!isRunning ? (
                      <button id="start-inference-btn" className="btn btn-success" onClick={startInference}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Run Inference
                      </button>
                    ) : (
                      <button id="pause-inference-btn" className="btn btn-ghost" onClick={stopInference}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                        </svg>
                        Pause
                      </button>
                    )}

                    <button id="flip-camera-btn" className="btn btn-ghost" onClick={camera.flip}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v6h6M23 20v-6h-6"/>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                      </svg>
                      Flip
                    </button>
                  </>
                )}

                {/* Frequency indicator */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="text-xs text-muted">Inference:</span>
                  <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>3 FPS</span>
                  <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>INT8</span>
                </div>
              </div>

              {/* Error */}
              {camera.error && (
                <div style={{
                  padding: '10px 16px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent-danger)',
                  fontSize: '0.85rem',
                }}>
                  ⚠️ {camera.error}
                </div>
              )}

              {!backendReady && (
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.83rem',
                  color: 'var(--accent-warning)',
                }}>
                  <strong>Backend offline.</strong> Start the FastAPI server with:
                  <pre className="font-mono" style={{
                    marginTop: 8, padding: '8px 12px',
                    background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                    fontSize: '0.78rem', color: 'var(--text-primary)',
                    overflowX: 'auto',
                  }}>
                    cd web-tester/backend{'\n'}pip install -r requirements.txt{'\n'}uvicorn main:app --reload --port 8000
                  </pre>
                </div>
              )}
            </div>

            {/* Right: result panel */}
            <ResultPanel result={result} loading={loading} />
          </div>
        )}

        {/* ── REGISTRY TAB ──────────────────────────────────── */}
        {tab === 'registry' && (
          <div style={{ maxWidth: 640 }}>
            <div className="glass-card p-6">
              <IdentityPanel refreshTrigger={registryTrigger} />
            </div>
          </div>
        )}
      </main>

      {/* ═══ Footer ═══════════════════════════════════════════ */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '12px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(10,18,40,0.6)',
      }}>
        <span className="text-xs text-muted">
          NHAI Aegis — Edge Face AI Pipeline
        </span>
        <div className="flex items-center gap-3">
          <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>INT8 ONNX</span>
          <span className="badge badge-info"   style={{ fontSize: '0.65rem' }}>Linzaer Detector</span>
          <span className="badge badge-real"   style={{ fontSize: '0.65rem' }}>Mini-FAS-Net</span>
          <span className="badge badge-info"   style={{ fontSize: '0.65rem' }}>GhostFaceNet-S</span>
        </div>
      </footer>

      {/* ═══ Register Modal ════════════════════════════════════ */}
      {showRegister && (
        <RegisterModal
          captureFrame={camera.captureFrame}
          onClose={() => setShowRegister(false)}
          onRegistered={() => {
            setShowRegister(false);
            setRegistryTrigger(t => t + 1);
            setTab('registry');
          }}
        />
      )}
    </div>
  );
}
