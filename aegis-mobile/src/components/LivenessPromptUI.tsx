/**
 * LivenessPromptUI Component
 * ============================
 * Animated instruction pill that guides users through liveness challenges.
 * Provides haptic feedback per challenge type for accessibility.
 */

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Vibration, Animated as RNAnimated } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';

interface Props {
  prompt: string;
}

export const LivenessPromptUI: React.FC<Props> = ({ prompt }) => {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(-10)).current;

  useEffect(() => {
    if (prompt) {
      // Haptic patterns per challenge type
      if (prompt.toLowerCase().includes('blink') || prompt.toLowerCase().includes('close')) {
        Vibration.vibrate([0, 80, 80, 80]);
      } else if (prompt.toLowerCase().includes('turn')) {
        Vibration.vibrate([0, 200]);
      } else if (prompt.toLowerCase().includes('hold') || prompt.toLowerCase().includes('still')) {
        Vibration.vibrate(40);
      }

      RNAnimated.parallel([
        RNAnimated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        RNAnimated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      RNAnimated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [prompt, opacity, translateY]);

  if (!prompt) return null;

  return (
    <RNAnimated.View
      style={[
        styles.container,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.text}>{prompt}</Text>
    </RNAnimated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '14%',
    alignSelf: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.92)',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  text: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
});
