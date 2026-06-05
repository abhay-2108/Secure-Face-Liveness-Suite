// src/hooks/useCamera.ts
import { useRef, useState, useCallback, useEffect } from 'react';

export type CameraFacing = 'user' | 'environment';

export function useCamera() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active,  setActive]  = useState(false);
  const [facing,  setFacing]  = useState<CameraFacing>('user');
  const [error,   setError]   = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);

  // Enumerate cameras on mount
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((devs: MediaDeviceInfo[]) => {
      setDevices(devs.filter((d: MediaDeviceInfo) => d.kind === 'videoinput'));
    });
  }, []);

  const start = useCallback(async (overrideFacing?: CameraFacing) => {
    try {
      setError(null);
      const f = overrideFacing ?? facing;
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: f,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      // If a specific device is selected, use deviceId instead
      if (devices.length > 1 && devices[deviceIdx]) {
        (constraints.video as MediaTrackConstraints).deviceId =
          { exact: devices[deviceIdx].deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Camera error: ${msg}`);
    }
  }, [facing, devices, deviceIdx]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const flip = useCallback(async () => {
    stop();
    const next: CameraFacing = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    await start(next);
  }, [facing, start, stop]);

  /** Capture current video frame as base64 JPEG string */
  const captureFrame = useCallback((quality = 0.7): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    // Strip the data:image/jpeg;base64, prefix
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }, []);

  return {
    videoRef,
    active,
    error,
    facing,
    devices,
    deviceIdx,
    setDeviceIdx,
    start,
    stop,
    flip,
    captureFrame,
  };
}
