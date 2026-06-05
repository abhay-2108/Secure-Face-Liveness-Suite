import { useState, useCallback, useEffect, useRef } from 'react';
import { OpenFace } from 'react-native-open-face';
import { performLedgerSync } from '../services/syncClient';

// Internal telemetry type for the UI
export type Telemetry = {
  arena: string;
  model: string;
  hnsw: string;
  inference: string;
  thermal: string;
  sync: string;
  fps: string;
};

const DEFAULT_CONFIG = {
  arenaSize: 40,
  modelPath: '',
  hnswIndexPath: '',
  ledgerDbPath: '',
  claheClipLimit: 2.0,
  inferenceThreads: 2,
  matchThreshold: 0.50,
  livenessThreshold: 0.50,
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

export function useOpenFaceEngine() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry>(DEFAULT_TELEMETRY);
  const [isSyncing, setIsSyncing] = useState(false);

  const initializingRef = useRef(false);

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

  const initializeEngine = useCallback(async (config?: Partial<typeof DEFAULT_CONFIG>) => {
    if (initializingRef.current) return;
    initializingRef.current = true;
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
      initializingRef.current = false;
    }
  }, [refreshMetrics]);

  const shutdownEngine = useCallback(async () => {
    try {
      if (OpenFace.isInitialized) {
        await OpenFace.shutdown();
      }
      setIsReady(false);
    } catch { /* ignore */ }
  }, []);

  const triggerSync = useCallback(() => {
    if (isSyncing) return;
    setIsSyncing(true);
    performLedgerSync()
      .then(() => refreshMetrics())
      .finally(() => setIsSyncing(false));
  }, [isSyncing, refreshMetrics]);

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

  // Periodic Telemetry & Autonomous Sync Polling
  useEffect(() => {
    if (!isReady) return;
    
    // Refresh telemetry every 5 seconds
    const telemetryInterval = setInterval(() => refreshMetrics(), 5000);
    
    // Autonomous Backend Sync every 60 seconds
    const syncInterval = setInterval(() => {
      if (!isSyncing) {
        triggerSync();
      }
    }, 60000);
    
    return () => {
      clearInterval(telemetryInterval);
      clearInterval(syncInterval);
    };
  }, [isReady, isSyncing, refreshMetrics, triggerSync]);

  return {
    isReady,
    isInitializing,
    error,
    telemetry,
    setTelemetry,
    initializeEngine,
    shutdownEngine,
    triggerSync,
    enrollIdentity,
  };
}
