// src/components/CameraFeed.tsx
import { useEffect, useRef, useCallback, useState } from 'react';
import type { PredictResponse, BoundingBox } from '../api/inference';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  result: PredictResponse | null;
  isRunning: boolean;
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  result: PredictResponse | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width  = video.videoWidth  || canvas.offsetWidth;
  canvas.height = video.videoHeight || canvas.offsetHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!result) return;

  const scaleX = canvas.width  / (video.videoWidth  || 1);
  const scaleY = canvas.height / (video.videoHeight || 1);

  // ── Bounding box ──────────────────────────────────────────
  const bbox: BoundingBox | null = result.bbox;
  if (bbox) {
    const x1 = canvas.width - bbox.xMax * scaleX;
    const y1 = bbox.yMin * scaleY;
    const bw  = (bbox.xMax - bbox.xMin) * scaleX;
    const bh  = (bbox.yMax - bbox.yMin) * scaleY;

    const isReal = result.livenessLabel === 'REAL';
    const color  = isReal ? '#10d97e' : '#ef4444';

    // Glow shadow
    ctx.shadowColor = color;
    ctx.shadowBlur  = 4;

    // Main rect
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([]);
    ctx.strokeRect(x1, y1, bw, bh);

    // Corner accents
    const c = 18;
    ctx.lineWidth = 4;
    const corners = [
      [x1, y1, 1, 1], [x1+bw, y1, -1, 1],
      [x1, y1+bh, 1, -1], [x1+bw, y1+bh, -1, -1],
    ];
    corners.forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx*c, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy*c);
      ctx.stroke();
    });

    ctx.shadowBlur = 0;

    // Label pill
    const label = result.livenessLabel ?? '';
    const conf  = result.livenessConfidence
      ? ` ${(result.livenessConfidence * 100).toFixed(1)}%`
      : '';
    const match = result.topMatch ? `  •  ${result.topMatch}` : '';
    const text  = `${label.replace('_', ' ')}${conf}${match}`;

    ctx.font = 'bold 13px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const ph = 22, pv = 8, pr = 6;
    const px = x1;
    let py = y1 - ph - pv - 2;
    if (py < 4) {
      py = y1 + 4; // Draw inside the bounding box if too close to the top edge
    }

    // Background pill (slate background, accent border)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, py, tw + pv * 2, ph + pv, pr);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, px + pv, py + 20);
  }

  // ── Scan line animation ────────────────────────────────────
  if (result.faceDetected) {
    const now = Date.now() / 1000;
    const y   = ((now % 2) / 2) * canvas.height;
    const grad = ctx.createLinearGradient(0, y - 20, 0, y + 20);
    grad.addColorStop(0,   'rgba(0,212,255,0)');
    grad.addColorStop(0.5, 'rgba(0,212,255,0.18)');
    grad.addColorStop(1,   'rgba(0,212,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 20, canvas.width, 40);
  }
}

export function CameraFeed({ videoRef, active, result, isRunning }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const [fps, setFps] = useState(0);
  const fpsCounter   = useRef({ frames: 0, last: Date.now() });

  // Animate canvas overlay at display refresh rate
  const animate = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      drawOverlay(canvas, video, result);
    }
    // FPS counter
    fpsCounter.current.frames++;
    const now = Date.now();
    if (now - fpsCounter.current.last >= 1000) {
      setFps(fpsCounter.current.frames);
      fpsCounter.current.frames = 0;
      fpsCounter.current.last   = now;
    }
    rafRef.current = requestAnimationFrame(animate);
  }, [videoRef, result]);

  useEffect(() => {
    if (active) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, animate]);

  return (
    <div className="camera-wrapper">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas
        ref={canvasRef}
      />

      {/* Overlay when inactive */}
      {!active && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,11,24,0.8)',
          gap: 12,
        }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Camera not started
          </span>
        </div>
      )}

      {/* Status strip */}
      {active && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span className={`pulse-dot ${isRunning ? 'live' : 'inactive'}`} />
          <span style={{
            fontSize: '0.72rem', fontFamily: 'var(--text-mono)',
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(5,11,24,0.7)', padding: '2px 8px',
            borderRadius: 99,
          }}>
            {isRunning ? `LIVE  ${fps} fps` : 'PAUSED'}
          </span>
          {result?.faceDetected && (
            <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
              FACE
            </span>
          )}
        </div>
      )}

      {/* INT8 badge */}
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
          INT8
        </span>
      </div>
    </div>
  );
}
