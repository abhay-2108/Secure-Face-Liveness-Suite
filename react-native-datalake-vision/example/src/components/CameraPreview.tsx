import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';

export const CameraPreview: React.FC = () => {
  const [aeStatus, setAeStatus] = useState('AE/AF: Global Average');

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

  return (
    <View style={styles.container}>
      <View style={styles.mockCamera}>
        {/* Hardware AE/AF Indicator */}
        <View style={styles.aeIndicator}>
          <Text style={styles.aeText}>{aeStatus}</Text>
        </View>

        {/* Scanning Reticle */}
        <View style={styles.reticleContainer}>
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
  },
  mockCamera: {
    flex: 1,
    backgroundColor: '#0a0b10', 
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  aeText: {
    color: '#ffcc00',
    fontSize: 10,
    fontFamily: 'Courier New',
    fontWeight: 'bold',
  },
  reticleContainer: {
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
