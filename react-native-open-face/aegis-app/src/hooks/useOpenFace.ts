import { useState, useCallback, useEffect, useRef } from 'react';
import { NativeModules, Vibration } from 'react-native';
import { useFrameProcessor } from 'react-native-vision-camera';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

const { OpenFace } = NativeModules;

/**
 * Frame result from the Rust engine — matches the JSON output
 * of open_face_process_frame in lib.rs
 */
export interface FrameResult {
  faceDetected: boolean;
  boundingBox: {
    yMin: number;
    xMin: number;
    yMax: number;
    xMax: number;
    confidence: number;
  } | null;
  liveness: {
    isReal: boolean;
    silentScore: number;
    opticalFlowPassed: boolean;
    blinkDetected: boolean;
    status: 'pending' | 'in_progress' | 'passed' | 'failed' | 'timeout';
    currentChallenge: 'turn_head' | 'blink' | 'hold_still' | 'screen_flash' | 'none';
    challengeProgress: number;
    reflectionPassed?: boolean;
    jitterPassed?: boolean;
  } | null;
  embedding: number[];
  match: {
    matched: boolean;
    similarity: number;
    identityId: string;
    identityLabel: string;
    searchLatencyMs: number;
  } | null;
  totalLatencyMs: number;
  metrics: {
    preprocessLatencyMs: number;
    livenessLatencyMs: number;
    hnswLatencyMs: number;
    inferenceLatencyMs: number;
  };
  error?: string;
}

export interface Telemetry {
  arena: string;
  model: string;
  hnsw: string;
  inference: string;
  sync: string;
}

export function useOpenFace() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livenessPrompt, setLivenessPrompt] = useState<string>('');
  const [livenessStatus, setLivenessStatus] = useState<string>('pending');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [lastFrameResult, setLastFrameResult] = useState<FrameResult | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    arena: '0MB',
    model: '0MB',
    hnsw: '0ms',
    inference: '0ms',
    sync: 'offline',
  });

  // Feature 1: Screen Flash Orchestration
  const flashState = useSharedValue(0); // 0 = None, 1 = Dark, 2 = Lit
  const [flashColor, setFlashColor] = useState<string>('transparent');
  const flashExecutedRef = useRef(false);

  // Feature 4: Supervisor Mode (Back Camera)
  const isBackCamera = useSharedValue(0); // 0 = front, 1 = back
  const [uiCameraPosition, setUiCameraPosition] = useState<'front' | 'back'>('front');

  const toggleCamera = useCallback(() => {
    const newPos = isBackCamera.value === 0 ? 1 : 0;
    isBackCamera.value = newPos;
    setUiCameraPosition(newPos === 0 ? 'front' : 'back');
  }, [isBackCamera]);

  // -------------------------------------------------------------------------
  // Initialize engine via the new API (falls back to legacy if needed)
  // -------------------------------------------------------------------------
  const initializeEngine = useCallback(async () => {
    try {
      // Try the new comprehensive initialize() first
      if (OpenFace.initialize) {
        const resultJson = await OpenFace.initialize(JSON.stringify({
          arena_size: 40,
          model_path: '',
          hnsw_index_path: '',
          ledger_db_path: '',
          clahe_clip_limit: 2.0,
          inference_threads: 2,
          match_threshold: 0.68,
          liveness_threshold: 0.85,
          offline_mode: true,
        }));
        const result = JSON.parse(resultJson);
        if (!result.success) {
          throw new Error(result.error || 'Initialization failed');
        }
      } else {
        // Legacy fallback
        await OpenFace.initializeEngine();
      }

      setIsReady(true);
      setError(null);
      setTelemetry((prev) => ({ ...prev, arena: '40MB locked', model: 'Loading...' }));
      flashExecutedRef.current = false;

      // Fetch initial metrics
      try {
        if (OpenFace.getMetrics) {
          const metricsJson = await OpenFace.getMetrics();
          const metrics = JSON.parse(metricsJson);
          setTelemetry({
            arena: `${metrics.arenaLockedMb}MB locked`,
            model: `${metrics.modelSizeMb}MB`,
            hnsw: `${metrics.hnswLatencyMs.toFixed(1)}ms`,
            inference: `${metrics.inferenceLatencyMs.toFixed(1)}ms`,
            sync: metrics.syncStatus,
          });
        }
      } catch {
        // Metrics not critical, continue
      }
    } catch (e: any) {
      setError(e.message || 'Engine initialization failed');
      console.error('Engine initialization failed', e);
    }
  }, []);

  // Screen Flash Interactive Sequence
  const triggerScreenFlash = useCallback(async () => {
    try {
      // Step A: Dark frame capture baseline
      flashState.value = 1;
      setFlashColor('#121212'); // Off-black (less harsh than pure #000)
      setLivenessPrompt('Screen Flash: Capturing dark baseline...');
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Step B: Lit frame capture illumination
      flashState.value = 2;
      setFlashColor('#F5F5F5'); // Off-white (less blinding than pure #FFF)
      setLivenessPrompt('Screen Flash: Analyzing 3D reflection...');
      await new Promise((resolve) => setTimeout(resolve, 180));

      // Step C: Restore UI
      flashState.value = 0;
      setFlashColor('transparent');
      setLivenessPrompt('');
      
      // Send a brief haptic pulse so the user knows the flash is over and they can open their eyes!
      Vibration.vibrate(60);
    } catch {
      flashState.value = 0;
      setFlashColor('transparent');
    }
  }, [flashState]);

  // -------------------------------------------------------------------------
  // Frame processor — runs on the worklet thread via VisionCamera
  // -------------------------------------------------------------------------

  // JS thread callback: process the result string from the Rust engine
  const handleFrameResult = useCallback((resultStr: string) => {
    try {
      const result: FrameResult = JSON.parse(resultStr);
      setLastFrameResult(result);

      if (result.faceDetected && result.liveness) {
        setLivenessStatus(result.liveness.status);

        // Update telemetry from per-frame metrics
        if (result.metrics) {
          setTelemetry((prev) => ({
            ...prev,
            hnsw: `${result.metrics.hnswLatencyMs.toFixed(1)}ms`,
            inference: `${result.metrics.inferenceLatencyMs.toFixed(1)}ms`,
          }));
        }

        // Update match result
        if (result.match?.matched) {
          setMatchId(result.match.identityId);
        }

        // Automatic Screen Flash Trigger
        const challenge = result.liveness.currentChallenge;
        if (challenge === 'screen_flash') {
          if (!flashExecutedRef.current) {
            flashExecutedRef.current = true;
            triggerScreenFlash();
          }
        } else if (challenge === 'hold_still') {
          // If the engine asks us to hold still, wait a moment and trigger flash reflection check
          if (!flashExecutedRef.current) {
            flashExecutedRef.current = true;
            setTimeout(() => {
              triggerScreenFlash();
            }, 800);
          }
          setLivenessPrompt('hold still');
        } else if (challenge === 'turn_head') {
          setLivenessPrompt('turn head slightly');
        } else if (challenge === 'blink') {
          setLivenessPrompt('Close your eyes for a quick secure scan...');
          // Trigger the Screen Flash while their eyes are closed!
          if (!flashExecutedRef.current) {
            flashExecutedRef.current = true;
            setTimeout(() => {
              triggerScreenFlash();
            }, 1000); // Give user 1 second to close eyes
          }
        } else {
          setLivenessPrompt('');
        }
      } else {
        setLivenessPrompt('');
      }
    } catch {
      // Malformed JSON from engine — ignore
    }
  }, [triggerScreenFlash]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    // @ts-ignore — processOpenFace is registered natively
    if (global.processOpenFace) {
      // Pass flashState as a direct parameter to JSI Frame Processor.
      // Magic Number: -1 tells the Rust engine we are using the Back Camera (Supervisor Mode)
      // and it will completely bypass the Screen Flash liveness check.
      const effectiveFlashState = isBackCamera.value === 1 ? -1 : flashState.value;
      
      // @ts-ignore
      const resultStr = global.processOpenFace(frame, { flashState: effectiveFlashState });
      if (resultStr && typeof resultStr === 'string') {
        // Use runOnJS to send results back to the React JS thread
        runOnJS(handleFrameResult)(resultStr);
      }
    }
  }, [handleFrameResult]);

  // -------------------------------------------------------------------------
  // Periodic metrics + sync status polling
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(async () => {
      try {
        // Poll metrics
        if (OpenFace.getMetrics) {
          const metricsJson = await OpenFace.getMetrics();
          const metrics = JSON.parse(metricsJson);
          setTelemetry({
            arena: `${metrics.arenaLockedMb}MB locked`,
            model: `${metrics.modelSizeMb > 0 ? metrics.modelSizeMb.toFixed(1) + 'MB' : 'Heuristic'}`,
            hnsw: `${metrics.hnswLatencyMs.toFixed(1)}ms`,
            inference: `${metrics.inferenceLatencyMs.toFixed(1)}ms`,
            sync: metrics.syncStatus,
          });
        }
      } catch {
        // Non-critical
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isReady]);

  return {
    isReady,
    initializeEngine,
    frameProcessor,
    telemetry,
    livenessPrompt,
    livenessStatus,
    matchId,
    lastFrameResult,
    error,
    flashColor,
    triggerScreenFlash,
    setLivenessPrompt,
    setMatchId,
    cameraPosition: uiCameraPosition,
    toggleCamera,
  };
}
