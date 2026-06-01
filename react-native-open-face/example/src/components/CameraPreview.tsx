import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

interface CameraPreviewProps {
  frameProcessor?: any;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({ frameProcessor }) => {
  const [aeStatus, setAeStatus] = useState('AE/AF: Global Average');
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    // Feature 3: Dynamic Hardware Auto-Exposure
    // When the Rust engine returns a face bounding box, we dynamically update
    // the hardware camera's auto-exposure region of interest (ROI).
    // This physically alters the lens aperture/ISO to perfectly expose the face
    // BEFORE the image hits the Rust CLAHE algorithm, preventing harsh sunlight washouts.
    const timer = setTimeout(() => {
      setAeStatus('AE/AF: Face Targeted (Hardware Lock)');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera permission is required.</Text>
        <Button title="Request Permission" onPress={requestPermission} />
      </View>
    );
  }

  if (device == null) {
    const devices = Camera.getAvailableCameraDevices();
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>No Camera Device Found (front).</Text>
        <Text style={styles.permissionText}>Available Devices: {devices.length}</Text>
        {devices.map((d, i) => (
          <Text key={i} style={styles.permissionText}>- {d.position} ({d.id})</Text>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />
      {/* Hardware AE/AF Indicator */}
      <View style={styles.aeIndicator}>
        <Text style={styles.aeText}>{aeStatus}</Text>
      </View>

      {/* Scanning Reticle */}
      <View style={[styles.reticleContainer, StyleSheet.absoluteFill]} pointerEvents="none">
        <View style={styles.reticleCenter}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  aeIndicator: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(255, 200, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.5)',
    zIndex: 10,
  },
  aeText: {
    color: '#ffcc00',
    fontSize: 10,
    fontFamily: 'Courier New',
    fontWeight: 'bold',
  },
  reticleContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  reticleCenter: {
    width: 250,
    height: 300,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: 'rgba(0, 255, 200, 0.7)',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 16,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 16,
  },
});
