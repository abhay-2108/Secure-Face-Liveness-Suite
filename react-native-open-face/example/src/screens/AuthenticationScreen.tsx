import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback, Animated, Text, Dimensions } from 'react-native';
import { CameraPreview } from '../components/CameraPreview';
import { LivenessPromptUI } from '../components/LivenessPromptUI';
import { TelemetryHUD } from '../components/TelemetryHUD';
import { MatchResultOverlay } from '../components/MatchResultOverlay';
import { useOpenFace } from '../hooks/useOpenFace';

const { width, height } = Dimensions.get('window');
const SCAN_BOX_SIZE = width * 0.7;

export const AuthenticationScreen: React.FC = () => {
  const {
    isReady,
    initializeEngine,
    telemetry,
    livenessPrompt,
    livenessStatus,
    matchId,
    lastFrameResult,
    error,
    frameProcessor,
    flashColor,
  } = useOpenFace();

  const [showTelemetry, setShowTelemetry] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Initialize engine on mount
  useEffect(() => {
    initializeEngine();
  }, [initializeEngine]);

  // Subtle pulsing animation for the scanning frame
  useEffect(() => {
    if (isReady && !matchId) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    } else if (matchId) {
      pulseAnim.stopAnimation();
    }
  }, [isReady, matchId, pulseAnim]);

  // Determine frame color based on liveness status
  const getFrameColor = () => {
    if (matchId) return 'rgba(52, 199, 89, 0.8)'; // iOS Green
    if (livenessStatus === 'passed') return 'rgba(52, 199, 89, 0.8)';
    if (livenessStatus === 'failed') return 'rgba(255, 59, 48, 0.8)'; // iOS Red
    return 'rgba(255, 255, 255, 0.6)'; // Neutral White
  };

  return (
    <TouchableWithoutFeedback onPress={() => setShowTelemetry(prev => !prev)} delayPressIn={500}>
      <View style={styles.container}>
        <CameraPreview frameProcessor={frameProcessor} />

        {/* Interactive Screen Flash Overlay (Zero-ML Reflection Liveness) */}
        {flashColor !== 'transparent' && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: flashColor,
                zIndex: 99999,
              },
            ]}
          />
        )}

        {/* Dark overlay with clear cutout for the face */}
        <View style={styles.overlayContainer} pointerEvents="none">
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddleRow}>
            <View style={styles.overlaySide} />
            <Animated.View
              style={[
                styles.scanFrame,
                { borderColor: getFrameColor(), transform: [{ scale: pulseAnim }] },
              ]}
            >
              {/* Corner Accents */}
              <View style={[styles.corner, styles.topLeft, { borderColor: getFrameColor() }]} />
              <View style={[styles.corner, styles.topRight, { borderColor: getFrameColor() }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: getFrameColor() }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: getFrameColor() }]} />
            </Animated.View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />
        </View>

        {/* Engine error overlay */}
        {error && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>Engine Error: {error}</Text>
          </View>
        )}

        {/* Loading state */}
        {!isReady && !error && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Initializing Engine...</Text>
            <Text style={styles.loadingSubtext}>Allocating memory arena securely</Text>
          </View>
        )}

        {/* Clean Liveness prompt */}
        <LivenessPromptUI prompt={livenessPrompt} />

        {/* Developer telemetry HUD — toggle with tap */}
        {showTelemetry && <TelemetryHUD telemetry={telemetry} />}

        {/* Identity match overlay */}
        <MatchResultOverlay matchId={matchId} visible={matchId !== null} />

        {/* Real-time latency badge */}
        {isReady && lastFrameResult && showTelemetry && (
          <View style={styles.latencyBadge}>
            <Text style={styles.latencyText}>
              {lastFrameResult.totalLatencyMs.toFixed(0)}ms latency
            </Text>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

const overlayColor = 'rgba(0, 0, 0, 0.5)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Overlay styles for the cutout effect
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: overlayColor,
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    height: SCAN_BOX_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: overlayColor,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: overlayColor,
  },
  scanFrame: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 4,
    borderColor: 'white',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: -2,
    right: -2,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 20,
  },
  // Other components
  errorOverlay: {
    position: 'absolute',
    top: '10%',
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    padding: 12,
    borderRadius: 8,
    alignSelf: 'center',
    zIndex: 100,
  },
  errorText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    top: '40%',
    zIndex: 50,
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 8,
  },
  latencyBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 100,
  },
  latencyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
});
