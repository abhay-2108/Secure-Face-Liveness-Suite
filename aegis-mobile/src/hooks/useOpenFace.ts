import { useState, useCallback, useRef, useEffect } from 'react';
import { Vibration } from 'react-native';
import { useOpenFaceEngine } from './useOpenFaceEngine';
import { useFaceCamera } from './useFaceCamera';
import { useLivenessOrchestrator } from './useLivenessOrchestrator';
import type { FrameResult } from 'react-native-open-face';

type OpenFaceMode = 'auth' | 'enroll';

export function useOpenFace(options?: { mode?: OpenFaceMode }) {
  const mode = options?.mode ?? 'auth';
  const isAuthMode = mode === 'auth';

  const engine = useOpenFaceEngine();
  
  // We need to pass the flashState from camera to orchestrator
  // Wait, let's hoist the frame processor handler here
  
  const [livenessScore, setLivenessScore] = useState<number>(0);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchSimilarity, setMatchSimilarity] = useState<number>(0);
  const [lastFrameResult, setLastFrameResult] = useState<FrameResult | null>(null);

  const backendBestMatchIdRef = useRef<string | null>(null);
  const backendBestMatchSimRef = useRef<number>(0);
  const backendLivenessFailedRef = useRef<boolean>(false);
  const backendBestEmbeddingRef = useRef<number[]>([]);

  const stableFramesCountRef = useRef(0);
  const matchLockedRef = useRef(false);
  const lastStateUpdateTimeRef = useRef(0);

  // We will initialize Orchestrator and Camera, then link them
  // Since useFaceCamera needs onFrameProcessed, we pass a stable callback that uses refs.

  const { processorActive, ...camera } = useFaceCamera((result) => {
    handleFrameResultRef.current(result);
  });
  const orchestrator = useLivenessOrchestrator(camera.flashState, mode);
  
  const orchestratorRef = useRef(orchestrator);
  orchestratorRef.current = orchestrator;

  // Sync processorActive with engine readiness
  useEffect(() => {
    // We MUST keep the pipeline open during EXTRACTING (Enrollment) and VERIFYING (Auth)
    // because the Rust Engine needs the next frame to run GhostFaceNet and generate the 128-D embedding.
    // The pipeline is only severed on SUCCESS or FAILED.
    if (engine.isReady && orchestrator.authPhase !== 'FAILED' && orchestrator.authPhase !== 'SUCCESS') {
      processorActive.value = 1;
    } else {
      processorActive.value = 0;
    }
  }, [engine.isReady, orchestrator.authPhase, processorActive]);

  const handleFrameResult = useCallback((result: FrameResult) => {
    const orch = orchestratorRef.current;
    if (isAuthMode && matchLockedRef.current) return;
    if (orch.authPhaseRef.current === 'FAILED' || orch.authPhaseRef.current === 'SUCCESS') return;

    if (result.liveness?.status === 'failed') {
      backendLivenessFailedRef.current = true;
    }
    
    if (result.liveness) {
      orch.processLivenessState(result.liveness);
    }

    if (isAuthMode && result.match?.matched) {
      backendBestMatchIdRef.current = result.match.identityId;
      backendBestMatchSimRef.current = Math.max(backendBestMatchSimRef.current, result.match.similarity);
    }

    // LATCH THE EMBEDDING: The Rust engine might only return the 128-D embedding
    // on a few transient frames (or it might flicker if boundingBox drops).
    // React state batching can drop these intermediate frames!
    // We capture it synchronously and inject it into all subsequent frames.
    if (result.embedding && result.embedding.length === 128) {
      backendBestEmbeddingRef.current = result.embedding;
    }
    if (backendBestEmbeddingRef.current.length === 128) {
      result.embedding = backendBestEmbeddingRef.current;
    }

    const now = Date.now();
    const isCritical = result.liveness?.status === 'passed' || 
                       result.liveness?.status === 'failed' || 
                       (isAuthMode && result.match?.matched) ||
                       (result.embedding && result.embedding.length === 128);

    // Throttle React state updates for the heavy FrameResult object to ~10 FPS (100ms)
    // This prevents JS thread lockup and Out-Of-Memory crashes.
    if (isCritical || now - lastStateUpdateTimeRef.current > 100) {
      lastStateUpdateTimeRef.current = now;
      
      setLastFrameResult(result);
      if (result.liveness) {
        setLivenessScore(result.liveness.silentScore);
      }

      if (result.metrics) {
        engine.setTelemetry(prev => ({
          ...prev,
          hnsw: `${result.metrics.hnswLatencyMs.toFixed(1)}ms`,
          inference: `${result.metrics.inferenceLatencyMs.toFixed(1)}ms`,
        }));
      }
    }
  }, [isAuthMode, engine.setTelemetry]);

  const handleFrameResultRef = useRef(handleFrameResult);
  handleFrameResultRef.current = handleFrameResult;

  // Verification check (only for auth mode)
  useEffect(() => {
    if (isAuthMode && orchestrator.authPhase === 'VERIFYING') {
      const verifyTimer = setTimeout(() => {
        if (backendLivenessFailedRef.current) {
          orchestrator.updateAuthPhase('FAILED');
          orchestrator.setLivenessStatus('failed');
          orchestrator.setLivenessPrompt('Liveness failed. Try again.');
          Vibration.vibrate([0, 300, 100, 300]); // Error vibration
        } else if (backendBestMatchIdRef.current) {
          orchestrator.updateAuthPhase('SUCCESS');
          matchLockedRef.current = true;
          setMatchId(backendBestMatchIdRef.current);
          setMatchSimilarity(backendBestMatchSimRef.current);
          orchestrator.setLivenessStatus('passed');
          orchestrator.setLivenessPrompt('Verified!');
          Vibration.vibrate(400); // Success vibration
        } else {
          orchestrator.updateAuthPhase('FAILED');
          orchestrator.setLivenessStatus('failed');
          orchestrator.setLivenessPrompt('Face not recognized.');
          Vibration.vibrate([0, 300, 100, 300]);
        }
      }, 1500);
      return () => clearTimeout(verifyTimer);
    }
  }, [isAuthMode, orchestrator.authPhase, orchestrator]);

  const resetScan = useCallback(() => {
    setMatchId(null);
    setMatchSimilarity(0);
    setLivenessScore(0);
    setLastFrameResult(null);
    
    orchestrator.resetOrchestrator();
    
    backendBestMatchIdRef.current = null;
    backendBestMatchSimRef.current = 0;
    backendLivenessFailedRef.current = false;
    backendBestEmbeddingRef.current = [];
    matchLockedRef.current = false;
    
    if (engine.isReady) {
      processorActive.value = 1;
    }
  }, [orchestrator, engine.isReady, processorActive]);

  return {
    ...engine,
    ...camera,
    processorActive,
    ...orchestrator,
    isSimulation: false,
    livenessScore,
    matchId,
    setMatchId,
    matchSimilarity,
    lastFrameResult,
    resetScan,
  };
}
