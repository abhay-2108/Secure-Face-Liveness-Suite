import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';

interface LandingScreenProps {
  onStart: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ onStart }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🛡️ Aegis</Text>
        <Text style={styles.subtitle}>Secure Face Liveness Suite</Text>
        <Text style={styles.description}>
          Military-grade biometric authentication powered by the zero-ML OpenFace Edge Engine.
        </Text>
      </View>

      <Animated.View style={[styles.buttonContainer, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity style={styles.button} onPress={onStart} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Start Face Authentication</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    marginBottom: 80,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00C851',
    marginBottom: 24,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: '80%',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 80,
    width: '100%',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#00599C',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#00599C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
