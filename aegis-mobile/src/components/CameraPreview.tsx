/**
 * CameraPreview Component
 * ========================
 * Full-bleed camera view using react-native-vision-camera v4.
 * Handles permission requests, device selection, and frame processor attachment.
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';

import { CameraErrorBoundary } from './CameraErrorBoundary';

interface CameraPreviewProps {
  frameProcessor?: any;
  cameraPosition: 'front' | 'back';
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  frameProcessor,
  cameraPosition,
}) => {
  const device = useCameraDevice(cameraPosition);
  const { hasPermission, requestPermission } = useCameraPermission();

  if (!hasPermission) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackIcon}>📷</Text>
        <Text style={styles.fallbackTitle}>Camera Access Required</Text>
        <Text style={styles.fallbackSubtitle}>
          Aegis needs camera access for face authentication.
        </Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={requestPermission}
          activeOpacity={0.8}
        >
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackIcon}>⚠️</Text>
        <Text style={styles.fallbackTitle}>No Camera Found</Text>
        <Text style={styles.fallbackSubtitle}>
          Could not find a {cameraPosition} camera on this device.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraErrorBoundary>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
          outputOrientation="device"
        />
      </CameraErrorBoundary>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg.primary,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  fallbackIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  fallbackTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  fallbackSubtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  permissionBtnText: {
    color: Colors.text.primary,
    fontSize: FontSize.base,
    fontWeight: '700',
  },
});
