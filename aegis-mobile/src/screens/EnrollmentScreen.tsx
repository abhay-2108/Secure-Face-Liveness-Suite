/**
 * EnrollmentScreen
 * =================
 * Allows enrolling new worker identities into the HNSW vector database.
 * Captures multiple frames for robust embedding generation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated as RNAnimated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraPreview } from '../components/CameraPreview';
import { ScanReticle } from '../components/ScanReticle';
import { useOpenFace } from '../hooks/useOpenFace';
import { Colors, FontSize, Spacing, BorderRadius, Shadow } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Enrollment'>;

type EnrollState = 'input' | 'capturing' | 'processing' | 'success' | 'error';

export const EnrollmentScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    isReady,
    initializeEngine,
    frameProcessor,
    lastFrameResult,
    enrollIdentity,
    cameraPosition,
  } = useOpenFace({ mode: 'enroll' });

  const [workerName, setWorkerName] = useState('');
  const [enrollState, setEnrollState] = useState<EnrollState>('input');
  const [enrolledId, setEnrolledId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    initializeEngine();
  }, [initializeEngine]);

  const handleStartCapture = useCallback(() => {
    if (!workerName.trim()) return;
    setEnrollState('capturing');
  }, [workerName]);

  const handleCapture = useCallback(async () => {
    if (!lastFrameResult?.embedding || lastFrameResult.embedding.length === 0) {
      setErrorMsg('No face detected. Please position your face in the frame.');
      setEnrollState('error');
      return;
    }

    setEnrollState('processing');

    const result = await enrollIdentity(workerName.trim(), lastFrameResult.embedding);

    if (result.success) {
      setEnrolledId(result.identityId);
      setEnrollState('success');
    } else {
      setErrorMsg(result.error || 'Enrollment failed');
      setEnrollState('error');
    }
  }, [lastFrameResult, workerName, enrollIdentity]);

  const handleReset = useCallback(() => {
    setEnrollState('input');
    setWorkerName('');
    setEnrolledId('');
    setErrorMsg('');
  }, []);

  // ─── Input Phase ───
  if (enrollState === 'input') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.formContainer}>
          <Text style={styles.formIcon}>👤</Text>
          <Text style={styles.formTitle}>Enroll New Identity</Text>
          <Text style={styles.formSubtitle}>
            Register a new worker for face-based authentication.
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Worker Name / ID</Text>
            <TextInput
              style={styles.input}
              value={workerName}
              onChangeText={setWorkerName}
              placeholder="e.g., Rajesh Kumar"
              placeholderTextColor={Colors.text.tertiary}
              autoCapitalize="words"
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[
              styles.continueBtn,
              !workerName.trim() && styles.continueBtnDisabled,
            ]}
            onPress={handleStartCapture}
            disabled={!workerName.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>Continue to Capture →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Capturing Phase ───
  if (enrollState === 'capturing') {
    // Debug: log every 2 seconds what we're getting from the frame processor
    const embLen = lastFrameResult?.embedding?.length ?? 0;
    const faceDetected = lastFrameResult?.faceDetected ?? false;
    const livenessStatus = lastFrameResult?.liveness?.status ?? 'none';
    
    if (__DEV__) {
      console.log(
        '[Enrollment] isReady:',
        isReady,
        '| faceDetected:',
        faceDetected,
        '| embeddingLen:',
        embLen,
        '| livenessStatus:',
        livenessStatus,
        '| fullResult:',
        lastFrameResult ? JSON.stringify(lastFrameResult).substring(0, 200) : 'null'
      );
    }

    return (
      <View style={styles.container}>
        <CameraPreview
          frameProcessor={frameProcessor}
          cameraPosition={cameraPosition}
        />
        <ScanReticle status="scanning" />

        <View style={[styles.captureTopBar, { top: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => setEnrollState('input')}
          >
            <Text style={styles.topBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.namePill}>
            <Text style={styles.namePillText}>Enrolling: {workerName}</Text>
          </View>
        </View>

        <View style={[styles.captureBottom, { paddingBottom: insets.bottom + 16 }]}>
          {__DEV__ && (
            <View style={{backgroundColor: 'rgba(0,0,0,0.7)', padding: 8, borderRadius: 8, marginBottom: 8}}>
              <Text style={{color: '#0f0', fontSize: 10, fontFamily: 'monospace'}}>
                Engine: {isReady ? '✅ Ready' : '❌ Not Ready'} | Face: {faceDetected ? '✅' : '❌'} | Embed: {embLen}/128 | Liveness: {livenessStatus}
              </Text>
            </View>
          )}
          
          <Text style={styles.captureHint}>
            {!isReady
              ? 'Initializing engine...'
              : !lastFrameResult?.faceDetected 
              ? 'No face detected. Move closer/better light.' 
              : (!lastFrameResult?.embedding || lastFrameResult.embedding.length < 128)
                ? `Extracting features... Hold still. (${embLen} dims)`
                : 'Ready! Tap Capture.'}
          </Text>
          <TouchableOpacity
            style={[
              styles.captureBtn,
              (!lastFrameResult?.faceDetected || !lastFrameResult?.embedding || lastFrameResult.embedding.length < 128) && styles.captureBtnDisabled
            ]}
            onPress={handleCapture}
            disabled={!lastFrameResult?.faceDetected || !lastFrameResult?.embedding || lastFrameResult.embedding.length < 128}
            activeOpacity={0.8}
          >
            <View style={[
              styles.captureBtnInner,
              (!lastFrameResult?.faceDetected || !lastFrameResult?.embedding || lastFrameResult.embedding.length < 128) && styles.captureBtnInnerDisabled
            ]} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Processing Phase ───
  if (enrollState === 'processing') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.processingIcon}>⏳</Text>
        <Text style={styles.processingText}>Generating embedding...</Text>
        <Text style={styles.processingSubtext}>
          Extracting 128-D facial features via GhostFaceNet-S
        </Text>
      </View>
    );
  }

  // ─── Success Phase ───
  if (enrollState === 'success') {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.resultCard}>
          <View style={styles.successCircle}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.resultTitle}>Enrollment Complete</Text>
          <Text style={styles.resultSubtitle}>{workerName} has been enrolled</Text>

          <View style={styles.idBox}>
            <Text style={styles.idLabel}>Identity UUID</Text>
            <Text style={styles.idValue}>{enrolledId}</Text>
          </View>

          <View style={styles.resultActions}>
            <TouchableOpacity
              style={styles.enrollAnotherBtn}
              onPress={handleReset}
              activeOpacity={0.8}
            >
              <Text style={styles.enrollAnotherText}>Enroll Another</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => navigation.popToTop()}
              activeOpacity={0.8}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── Error Phase ───
  return (
    <View style={[styles.container, styles.centerContent]}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>Enrollment Failed</Text>
      <Text style={styles.errorMsg}>{errorMsg}</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => setEnrollState('capturing')}
        activeOpacity={0.8}
      >
        <Text style={styles.retryBtnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  backBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: Colors.accent.tertiary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },

  // ─── Form ───
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  formIcon: { fontSize: 56, marginBottom: Spacing.lg },
  formTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    color: Colors.text.tertiary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  inputContainer: { width: '100%', marginBottom: Spacing.xl },
  inputLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  continueBtn: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
    width: '100%',
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: {
    color: Colors.text.primary,
    fontSize: FontSize.base,
    fontWeight: '700',
  },

  // ─── Capture ───
  captureTopBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    zIndex: 100,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(5,5,16,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  topBtnText: { fontSize: 18 },
  namePill: {
    backgroundColor: 'rgba(108,92,231,0.25)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  namePillText: {
    color: Colors.accent.tertiary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  captureBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  captureHint: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.text.primary,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.text.primary,
  },
  captureBtnDisabled: {
    borderColor: Colors.border.medium,
  },
  captureBtnInnerDisabled: {
    backgroundColor: Colors.border.medium,
  },

  // ─── Processing ───
  processingIcon: { fontSize: 48, marginBottom: Spacing.md },
  processingText: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  processingSubtext: { color: Colors.text.tertiary, fontSize: FontSize.md },

  // ─── Success ───
  resultCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    ...Shadow.success,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,230,118,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.accent.success,
  },
  successIcon: {
    fontSize: 32,
    color: Colors.accent.success,
    fontWeight: '800',
  },
  resultTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  resultSubtitle: {
    color: Colors.accent.success,
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.lg,
  },
  idBox: {
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    width: '100%',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  idLabel: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  idValue: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  resultActions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.sm,
  },
  enrollAnotherBtn: {
    flex: 1,
    backgroundColor: Colors.bg.elevated,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.medium,
  },
  enrollAnotherText: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  doneBtn: {
    flex: 1,
    backgroundColor: Colors.accent.success,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  doneBtnText: {
    color: Colors.bg.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // ─── Error ───
  errorIcon: { fontSize: 48, marginBottom: Spacing.md },
  errorTitle: {
    color: Colors.accent.danger,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  errorMsg: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  retryBtn: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
  },
  retryBtnText: {
    color: Colors.text.primary,
    fontSize: FontSize.base,
    fontWeight: '700',
  },
});
