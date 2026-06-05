/**
 * LivenessPromptUI Component
 * ============================
 * Animated instruction pill that guides users through liveness challenges.
 * Provides haptic feedback per challenge type for accessibility.
 */

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';

interface Props {
  prompt: string;
}

export const LivenessPromptUI: React.FC<Props> = ({ prompt }) => {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(-10)).current;

  useEffect(() => {
    if (prompt) {
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
    top: '12%',
    alignSelf: 'center',
    backgroundColor: 'rgba(5, 5, 20, 0.85)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
