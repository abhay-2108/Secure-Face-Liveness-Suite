/**
 * useOpenFace Hook
 * =================
 * Core integration hook between React Native and the Rust OpenFace Engine.
 * Manages engine lifecycle, frame processing, liveness orchestration,
 * telemetry polling, and screen flash sequences.
 *
 * Architecture: VisionCamera Frame Processor -> JSI -> JNI -> Rust FFI
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import { useSharedValue, Worklets } from 'react-native-worklets-core';
import { OpenFace } from 'react-native-open-face';
import { performLedgerSync } from '../services/syncClient';
import type {
  FrameResult,
  EngineMetrics,
  LivenessChallenge,
} from 'react-native-open-face';

export type AuthenticationPhase = 
  | 'IDLE' 
  | 'STABILIZING' 
  | 'BLINK_INSTRUCTION' 
  | 'SCREEN_FLASH'
  | 'OPEN_EYE_PROMPT'
  | 'TURN_HEAD_CHALLENGE' 
  | 'VERIFYING' 
  | 'SUCCESS' 
  | 'FAILED';

type OpenFaceMode = 'auth' | 'enroll';

// Internal telemetry type for the UI
type Telemetry = {
  arena: string;
  model: string;
  hnsw: string;
  inference: string;
  thermal: string;
  sync: string;
  fps: string;
};

// Default engine configuration
const DEFAULT_CONFIG = {
  arenaSize: 40,
  modelPath: '',
  hnswIndexPath: '',
  ledgerDbPath: '',
  claheClipLimit: 2.0,
  inferenceThreads: 2,
  matchThreshold: 0.68,
  livenessThreshold: 0.85,
  offlineMode: true,
};

const DEFAULT_TELEMETRY: Telemetry = {
  arena: '—',
  model: '—',
  hnsw: '—',
  inference: '—',
  thermal: 'nominal',
  sync: 'offline',
  fps: '0',
};

export function useOpenFace(options?: { mode?: OpenFaceMode }) {
  const mode: OpenFaceMode = options?.mode ?? 'auth';
  const isAuthMode = mode === 'auth';
  // Engine state
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const isSimulation = false; // Real module is now guaranteed

  // Liveness UX State Machine
  const [authPhase, setAuthPhase] = useState<AuthenticationPhase>('IDLE');
  const [livenessPrompt, setLivenessPrompt] = useState<string>('');
  const [livenessStatus, setLivenessStatus] = useState<string>('pending');
  const [livenessScore, setLivenessScore] = useState<number>(0);

  // Match state
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchSimilarity, setMatchSimilarity] = useState<number>(0);

  // Frame results
  const [lastFrameResult, setLastFrameResult] = useState<FrameResult | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>(DEFAULT_TELEMETRY);

  // Screen flash state (shared with worklet thread)
  const flashState = useSharedValue(0); // 0=none, 1=dark, 2=lit
  const [flashColor, setFlashColor] = useState<string>('transparent');

  // Camera state
  const isBackCamera = useSharedValue(0);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');

  // Refs for tracking backend verification asynchronously
  const backendBestMatchIdRef = useRef<string | null>(null);
  const backendBestMatchSimRef = useRef<number>(0);
  const backendLivenessFailedRef = useRef<boolean>(false);

  // Frame counter for FPS tracking
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const lastStateUpdateRef = useRef(Date.now());
  const stableFramesCountRef = useRef(0);
  const matchLockedRef = useRef(false);
  const syncInFlightRef = useRef(false);
  
  // Ref for phase tracking to avoid closure stale state
  const authPhaseRef = useRef<AuthenticationPhase>('IDLE');
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to safely update phase state and ref together
  const updateAuthPhase = useCallback((newPhase: AuthenticationPhase) => {
    authPhaseRef.current = newPhase;
    setAuthPhase(newPhase);
  }, []);

  // -----------------------------------------------------------------
  // Engine Initialization
  // -----------------------------------------------------------------
  const initializeEngine = useCallback(async (config?: Partial<typeof DEFAULT_CONFIG>) => {
    if (isInitializing) return;
    setIsInitializing(true);
    setError(null);

    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      await OpenFace.initialize(finalConfig);
      setIsReady(true);
      setTelemetry(prev => ({
        ...prev,
        arena: `${finalConfig.arenaSize}MB`,
        model: 'Loaded',
        sync: finalConfig.offlineMode ? 'offline' : 'online',
      }));
      await refreshMetrics();
    } catch (e: any) {
      const msg = e?.message || 'Unknown engine initialization error';
      setError(msg);
      console.error('[Aegis] Engine init failed:', msg);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing]);

  // -----------------------------------------------------------------
  // Metrics Refresh
  // -----------------------------------------------------------------
  const refreshMetrics = useCallback(async () => {
    try {
      if (!OpenFace.isInitialized) return;
      
      const m = await OpenFace.getMetrics();
      setTelemetry(prev => ({
        ...prev,
        arena: `${m.arenaLockedMb}MB`,
        model: m.modelSizeMb > 0 ? `${m.modelSizeMb.toFixed(1)}MB` : 'Heuristic',
        hnsw: `${m.hnswLatencyMs.toFixed(1)}ms`,
        inference: `${m.inferenceLatencyMs.toFixed(1)}ms`,
        sync: m.syncStatus,
      }));
    } catch {
      // Non-critical
    }
  }, []);

  // -----------------------------------------------------------------
  // Camera Toggle (Front/Back for Supervisor Mode)
  // -----------------------------------------------------------------
  const toggleCamera = useCallback(() => {
    const newVal = isBackCamera.value === 0 ? 1 : 0;
    isBackCamera.value = newVal;
    setCameraPosition(newVal === 0 ? 'front' : 'back');
  }, [isBackCamera]);

  // -----------------------------------------------------------------
  // Advanced UX Choreography
  // -----------------------------------------------------------------
  
  const triggerScreenFlash = useCallback(async () => {
    try {
      // Set flash color to white and trigger screen flash mode
      setFlashColor('white');
      flashState.value = 1;
      
      updateAuthPhase('SCREEN_FLASH');
      setLivenessPrompt('Keep eyes closed...');

      // Screen flash duration (1000ms), then prompt to open eyes
      phaseTimerRef.current = setTimeout(() => {
        // Reset flash
        flashState.value = 0;
        setFlashColor('transparent');
        
        updateAuthPhase('OPEN_EYE_PROMPT');
        setLivenessPrompt('Open your eyes!');
        Vibration.vibrate(200); // Haptic feedback indicating they can open their eyes
        
        // Wait for them to open their eyes, then prompt for head turn
        phaseTimerRef.current = setTimeout(() => {
          updateAuthPhase('TURN_HEAD_CHALLENGE');
          setLivenessPrompt('Turn your head slightly left and right');
          
          // Wait for head turn, then move to verify
          phaseTimerRef.current = setTimeout(() => {
             updateAuthPhase('VERIFYING');
             setLivenessPrompt('Analyzing identity...');
             
             // Match Success / Failure Phase
             phaseTimerRef.current = setTimeout(() => {
                if (backendLivenessFailedRef.current) {
                   updateAuthPhase('FAILED');
                   setLivenessStatus('failed');
                   setLivenessPrompt('Liveness failed. Try again.');
                } else if (backendBestMatchIdRef.current) {
                   updateAuthPhase('SUCCESS');
                   matchLockedRef.current = true;
                   setMatchId(backendBestMatchIdRef.current);
                   setMatchSimilarity(backendBestMatchSimRef.current);
                   setLivenessStatus('passed');
                   setLivenessPrompt('Verified!');
                } else {
                   updateAuthPhase('FAILED');
                   setLivenessStatus('failed');
                   setLivenessPrompt('Face not recognized.');
                }
             }, 1500); // Verify delay

          }, 2500); // Turn head delay

        }, 1500); // Open eye delay
        
      }, 1000); // Flash duration
      
    } catch {
      flashState.value = 0;
      setFlashColor('transparent');
    }
  }, [flashState, updateAuthPhase]);

  // -----------------------------------------------------------------
  // Frame Result Handler (called from worklet thread via runOnJS)
  // -----------------------------------------------------------------
  const handleFrameResult = useCallback((resultStr: string) => {
    try {
      if (isAuthMode && matchLockedRef.current) return;
      
      // Stop processing if we are in FAILED/SUCCESS state and wait for a reset
      if (isAuthMode && (authPhaseRef.current === 'FAILED' || authPhaseRef.current === 'SUCCESS')) return;

      const result: FrameResult = JSON.parse(resultStr);
      const now = Date.now();

      // FPS tracking
      frameCountRef.current++;
      const elapsed = now - lastFpsUpdateRef.current;
      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current / elapsed) * 1000);
        setTelemetry(prev => ({ ...prev, fps: `${fps}` }));
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }

        // Capture backend match/fail passively
      if (result.liveness?.status === 'failed') {
          backendLivenessFailedRef.current = true;
      }
      
        if (result.liveness) {
          setLivenessScore(result.liveness.silentScore);
        }

      if (result.match?.matched) {
         backendBestMatchIdRef.current = result.match.identityId;
         backendBestMatchSimRef.current = Math.max(backendBestMatchSimRef.current, result.match.similarity);
      }

      // UI throttling for frame results
      if (now - lastStateUpdateRef.current >= 100) {
        lastStateUpdateRef.current = now;
        setLastFrameResult(result);

        if (result.metrics) {
          setTelemetry(prev => ({
            ...prev,
            hnsw: `${result.metrics.hnswLatencyMs.toFixed(1)}ms`,
            inference: `${result.metrics.inferenceLatencyMs.toFixed(1)}ms`,
          }));
        }
      }

      // Enrollment mode does not run the auth state machine
      if (!isAuthMode) return;

      // Wait for N stable frames before progressing UX
      if (result.faceDetected) {
        stableFramesCountRef.current++;
      } else {
        stableFramesCountRef.current = 0;
      }

      if (stableFramesCountRef.current < 5) {
        if (authPhaseRef.current === 'IDLE' || authPhaseRef.current === 'STABILIZING') {
            updateAuthPhase('STABILIZING');
            setLivenessPrompt(result.faceDetected ? 'Stabilizing...' : '');
        }
        return;
      }

      // State Machine Entry Point
      if (authPhaseRef.current === 'STABILIZING') {
         updateAuthPhase('BLINK_INSTRUCTION');
         setLivenessPrompt('Please close your eyes for a few seconds...');
         
         // Trigger flash automatically after 2.5s of closed eyes
         if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
         phaseTimerRef.current = setTimeout(() => {
            triggerScreenFlash();
         }, 2500);
      }

    } catch {
      // Malformed JSON — ignore
    }
  }, [isAuthMode, triggerScreenFlash, updateAuthPhase]);

  // -----------------------------------------------------------------
  // VisionCamera Frame Processor (runs on worklet thread)
  // -----------------------------------------------------------------
  const plugin = VisionCameraProxy.initFrameProcessorPlugin('processOpenFace', {});
  const handleFrameResultJS = Worklets.createRunOnJS(handleFrameResult);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const effectiveFlash = isBackCamera.value === 1 ? -1 : flashState.value;

    let resultStr: string | undefined;

    // Prefer global frame processor binding when available
    // @ts-ignore - processOpenFace is registered natively
    if (global.processOpenFace) {
      // @ts-ignore
      resultStr = global.processOpenFace(frame, { flashState: effectiveFlash });
    } else if (plugin) {
      resultStr = plugin.call(frame, { flashState: effectiveFlash });
    }

    if (resultStr && typeof resultStr === 'string') {
      handleFrameResultJS(resultStr);
    }
  }, [handleFrameResultJS, plugin]);

  // -----------------------------------------------------------------
  // Periodic Telemetry Polling
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(() => refreshMetrics(), 5000);
    return () => clearInterval(interval);
  }, [isReady, refreshMetrics]);

  // -----------------------------------------------------------------
  // Reset (for re-scan)
  // -----------------------------------------------------------------
  const resetScan = useCallback(() => {
    setMatchId(null);
    setMatchSimilarity(0);
    setLivenessStatus('pending');
    setLivenessScore(0);
    setLivenessPrompt('');
    setLastFrameResult(null);
    
    updateAuthPhase('IDLE');
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    
    backendBestMatchIdRef.current = null;
    backendBestMatchSimRef.current = 0;
    backendLivenessFailedRef.current = false;
    
    matchLockedRef.current = false;
    stableFramesCountRef.current = 0;
  }, [updateAuthPhase]);

  // -----------------------------------------------------------------
  // Enrollment
  // -----------------------------------------------------------------
  const enrollIdentity = useCallback(async (label: string, embedding: number[]) => {
    try {
      if (OpenFace.isInitialized) {
        return await OpenFace.enrollIdentity(label, embedding);
      }
      return { success: false, identityId: '', error: 'Engine not initialized' };
    } catch (e: any) {
      return { success: false, identityId: '', error: e?.message || 'Enrollment failed' };
    }
  }, []);

  // -----------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------
  const shutdownEngine = useCallback(async () => {
    try {
      if (OpenFace.isInitialized) {
        await OpenFace.shutdown();
      }
      setIsReady(false);
    } catch { /* ignore */ }
  }, []);

  // -----------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------
  const triggerSync = useCallback(() => {
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    performLedgerSync()
      .then(() => refreshMetrics())
      .finally(() => {
        syncInFlightRef.current = false;
      });
  }, [refreshMetrics]);

  return {
    // State
    isReady,
    isInitializing,
    isSimulation,
    error,
    authPhase,
    livenessPrompt,
    livenessStatus,
    livenessScore,
    matchId,
    matchSimilarity,
    lastFrameResult,
    telemetry,
    flashColor,
    cameraPosition,

    // Actions
    initializeEngine,
    shutdownEngine,
    resetScan,
    toggleCamera,
    triggerScreenFlash,
    enrollIdentity,
    frameProcessor,
    triggerSync,

    // Setters
    setLivenessPrompt,
    setMatchId,
  };
}
