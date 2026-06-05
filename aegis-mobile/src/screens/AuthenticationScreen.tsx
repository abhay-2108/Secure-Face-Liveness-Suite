/**
 * AuthenticationScreen
 * =====================
 * Full-bleed camera view with scanning reticle, liveness prompts,
 * screen flash overlay, and telemetry HUD.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraPreview } from '../components/CameraPreview';
import { ScanReticle } from '../components/ScanReticle';
import { LivenessPromptUI } from '../components/LivenessPromptUI';
import { TelemetryHUD } from '../components/TelemetryHUD';
import { useOpenFace } from '../hooks/useOpenFace';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';
import { useCameraPermission } from 'react-native-vision-camera';
import { isSyncConfigured } from '../config/sync';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Authentication'>;

const { width: SCREEN_W } = Dimensions.get('window');

export const AuthenticationScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { hasPermission } = useCameraPermission();
  const {
    isReady,
    isInitializing,
    error,
    authPhase,
    initializeEngine,
    frameProcessor,
    telemetry,
    livenessPrompt,
    livenessStatus,
    livenessScore,
    matchId,
    matchSimilarity,
    lastFrameResult,
    flashColor,
    cameraPosition,
    toggleCamera,
    resetScan,
    triggerSync,
  } = useOpenFace();

  const syncEnabled = isSyncConfigured();

  const [showTelemetry, setShowTelemetry] = useState(false);

  // Initialize engine on mount
  useEffect(() => {
    resetScan();
    initializeEngine();
  }, [initializeEngine, resetScan]);

  // Navigate to dashboard on match
  useEffect(() => {
    if (matchId) {
      const timer = setTimeout(() => {
        navigation.replace('Dashboard', {
          matchId,
          similarity: matchSimilarity,
          livenessScore,
        });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [matchId, matchSimilarity, livenessScore, navigation]);

  // Determine reticle status
  const getReticleStatus = useCallback((): 'scanning' | 'passed' | 'failed' | 'pending' => {
    if (authPhase === 'SUCCESS') return 'passed';
    if (authPhase === 'FAILED') return 'failed';
    if (authPhase !== 'IDLE' && authPhase !== 'STABILIZING') return 'scanning';
    return 'pending';
  }, [authPhase]);

  return (
    <TouchableWithoutFeedback
      onLongPress={() => setShowTelemetry(prev => !prev)}
      delayLongPress={500}
    >
      <View style={styles.container}>
        {/* Full-bleed camera */}
        <CameraPreview
          frameProcessor={frameProcessor}
          cameraPosition={cameraPosition}
        />

        {/* Hide all other UI elements until permission is granted */}
        {hasPermission && (
          <>

        {/* Screen Flash Overlay (Tier 3 Liveness) */}
        {flashColor !== 'transparent' && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: flashColor, zIndex: 99999 },
            ]}
          />
        )}

        {/* Scanning Reticle */}
        <ScanReticle status={getReticleStatus()} />

        {/* Top Bar */}
        <View style={[styles.topBar, { top: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.topBtnText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.topCenter}>
            {isReady && (
              <>
                <View style={styles.statusPill}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          authPhase === 'SUCCESS'
                            ? Colors.accent.success
                            : authPhase === 'FAILED'
                            ? Colors.accent.danger
                            : Colors.accent.primary,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {authPhase === 'SUCCESS'
                      ? 'VERIFIED'
                      : authPhase === 'FAILED'
                      ? 'FAILED'
                      : 'SCANNING'}
                  </Text>
                </View>
                {telemetry.sync && (
                  <TouchableOpacity
                    onPress={syncEnabled ? triggerSync : undefined}
                    style={[styles.syncBtn, !syncEnabled && styles.syncBtnDisabled]}
                    activeOpacity={syncEnabled ? 0.7 : 1}
                    disabled={!syncEnabled}
                  >
                    <Text style={styles.syncText}>
                      Sync: {syncEnabled ? telemetry.sync : 'disabled'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          <TouchableOpacity
            style={styles.topBtn}
            onPress={toggleCamera}
            activeOpacity={0.7}
          >
            <Text style={styles.topBtnText}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Engine error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Minimal Engine State Overlay for QA */}
        <View style={[styles.debugOverlay, { top: insets.top + 70 }]}>
          <Text style={styles.debugText}>Engine: {isReady ? 'Ready' : 'Init...'}</Text>
          <Text style={styles.debugText}>Phase: {authPhase}</Text>
          <Text style={styles.debugText}>Face: {lastFrameResult?.faceDetected ? 'YES' : 'NO'}</Text>
          <Text style={styles.debugText}>Stable: {livenessStatus}</Text>
        </View>

        {/* Loading state */}
        {(isInitializing || !isReady) && !error && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingIcon}>⚡</Text>
            <Text style={styles.loadingTitle}>Initializing Engine</Text>
            <Text style={styles.loadingSubtitle}>
              Allocating 40MB memory arena...
            </Text>
          </View>
        )}

        {/* Liveness prompt */}
        <LivenessPromptUI prompt={livenessPrompt} />

        {/* Telemetry HUD (toggle with long press) */}
        {showTelemetry && (
          <TelemetryHUD
            telemetry={telemetry}
            latencyMs={lastFrameResult?.totalLatencyMs}
          />
        )}

        {/* Bottom info bar */}
        {isReady && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            {lastFrameResult && showTelemetry && (
              <View style={styles.latencyPill}>
                <Text style={styles.latencyText}>
                  {lastFrameResult.totalLatencyMs.toFixed(0)}ms
                </Text>
              </View>
            )}
            <Text style={styles.modeText}>
              {cameraPosition === 'front' ? '👤 Self-Auth' : '👥 Supervisor Mode'}
            </Text>
          </View>
        )}

        {/* Match success overlay */}
        {matchId && (
          <View style={styles.matchOverlay}>
            <View style={styles.matchCard}>
              <Text style={styles.matchIcon}>✅</Text>
              <Text style={styles.matchTitle}>Identity Verified</Text>
              <Text style={styles.matchSubtitle}>
                Similarity: {(matchSimilarity * 100).toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        {/* Failed / Try Again overlay */}
        {authPhase === 'FAILED' && (
          <View style={styles.failedOverlay}>
            <View style={styles.failedCard}>
              <Text style={styles.failedIcon}>❌</Text>
              <Text style={styles.failedTitle}>Authentication Failed</Text>
              <Text style={styles.failedSubtitle}>
                {livenessStatus === 'failed' ? 'Liveness check failed' : 'Face not recognized'}
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={resetScan}
                activeOpacity={0.8}
              >
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
          </>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  topBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(5, 5, 16, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  topBtnText: {
    fontSize: 18,
  },
  topCenter: {
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 5, 16, 0.7)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: Colors.text.primary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  errorBanner: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.9)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    zIndex: 100,
  },
  errorText: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 5, 16, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  loadingIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  loadingTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  loadingSubtitle: {
    color: Colors.text.tertiary,
    fontSize: FontSize.md,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.md,
    zIndex: 20,
  },
  latencyPill: {
    backgroundColor: 'rgba(5, 5, 16, 0.7)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  latencyText: {
    color: Colors.accent.success,
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  modeText: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 80,
  },
  matchCard: {
    backgroundColor: 'rgba(5, 5, 16, 0.92)',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.xxl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.accent.success,
  },
  matchIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  matchTitle: {
    color: Colors.accent.success,
    fontSize: FontSize.xl,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  matchSubtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  syncBtn: {
    marginTop: 6,
    backgroundColor: 'rgba(5, 5, 16, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  debugOverlay: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
    zIndex: 90,
  },
  debugText: {
    color: '#0f0',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  failedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 85,
  },
  failedCard: {
    backgroundColor: 'rgba(5, 5, 16, 0.95)',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.xxl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.accent.danger,
    width: '80%',
  },
  failedIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  failedTitle: {
    color: Colors.accent.danger,
    fontSize: FontSize.xl,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  failedSubtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
    width: '100%',
    alignItems: 'center',
  },
  retryBtnText: {
    color: Colors.text.primary,
    fontSize: FontSize.base,
    fontWeight: '700',
  },
});
