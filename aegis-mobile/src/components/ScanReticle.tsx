/**
 * ScanReticle Component
 * ======================
 * Animated face scanning reticle with corner accents, pulse animation,
 * and status-based color transitions.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated as RNAnimated } from 'react-native';
import { Colors, BorderRadius } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const RETICLE_SIZE = SCREEN_W * 0.68;
const CORNER_SIZE = 36;
const CORNER_THICKNESS = 4;

interface Props {
  status: 'scanning' | 'passed' | 'failed' | 'pending';
}

export const ScanReticle: React.FC<Props> = ({ status }) => {
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const rotateAnim = useRef(new RNAnimated.Value(0)).current;

  const color = Colors.liveness[status] || Colors.liveness.scanning;

  useEffect(() => {
    if (status === 'scanning' || status === 'pending') {
      const pulse = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 1400,
            useNativeDriver: true,
          }),
          RNAnimated.timing(pulseAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  return (
    <View style={styles.container} pointerEvents="none">
      <RNAnimated.View
        style={[
          styles.reticle,
          {
            borderColor: color,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Corner accents */}
        <View style={[styles.corner, styles.topLeft, { borderColor: color }]} />
        <View style={[styles.corner, styles.topRight, { borderColor: color }]} />
        <View style={[styles.corner, styles.bottomLeft, { borderColor: color }]} />
        <View style={[styles.corner, styles.bottomRight, { borderColor: color }]} />
      </RNAnimated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  reticle: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE * 1.15,
    borderRadius: BorderRadius.xxl,
    borderWidth: 2,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderWidth: CORNER_THICKNESS,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: BorderRadius.xxl,
  },
  topRight: {
    top: -2,
    right: -2,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: BorderRadius.xxl,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: BorderRadius.xxl,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: BorderRadius.xxl,
  },
});
