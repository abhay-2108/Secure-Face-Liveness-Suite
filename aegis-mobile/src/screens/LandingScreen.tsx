/**
 * LandingScreen
 * ==============
 * Premium landing page for Aegis. Features animated shield icon,
 * gradient accents, and feature highlights.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated as RNAnimated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, BorderRadius, Shadow } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Landing'>;

const { width: SCREEN_W } = Dimensions.get('window');

export const LandingScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;
  const slideAnim = useRef(new RNAnimated.Value(30)).current;
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const shieldRotate = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    // Entry animation
    RNAnimated.parallel([
      RNAnimated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      RNAnimated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // CTA pulse
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Shield subtle rotation
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(shieldRotate, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        RNAnimated.timing(shieldRotate, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim, slideAnim, pulseAnim, shieldRotate]);

  const shieldRotation = shieldRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      {/* Background gradient orbs */}
      <View style={styles.orbPurple} />
      <View style={styles.orbCyan} />

      <RNAnimated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Shield Icon */}
        <RNAnimated.View
          style={[styles.shieldContainer, { transform: [{ rotate: shieldRotation }] }]}
        >
          <Text style={styles.shieldIcon}>🛡️</Text>
        </RNAnimated.View>

        {/* Title */}
        <Text style={styles.title}>AEGIS</Text>
        <Text style={styles.subtitle}>Secure Face Liveness Suite</Text>

        {/* Description */}
        <Text style={styles.description}>
          Military-grade biometric authentication powered by the zero-copy
          OpenFace Edge Engine. 100% offline. Zero-trust security.
        </Text>

        {/* Feature pills */}
        <View style={styles.features}>
          <FeaturePill icon="🧠" label="6.6MB AI Model" />
          <FeaturePill icon="⚡" label="<25ms Latency" />
          <FeaturePill icon="🔒" label="Zero-Trust" />
          <FeaturePill icon="📡" label="Offline-First" />
        </View>
      </RNAnimated.View>

      {/* CTA Buttons */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
        <RNAnimated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Authentication')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Start Face Authentication</Text>
          </TouchableOpacity>
        </RNAnimated.View>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Enrollment')}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnText}>Enroll New Identity</Text>
        </TouchableOpacity>

        {/* Version info */}
        <Text style={styles.versionText}>
          NHAI Hackathon 7.0 • Powered by Rust + React Native
        </Text>
      </View>
    </View>
  );
};

const FeaturePill: React.FC<{ icon: string; label: string }> = ({
  icon,
  label,
}) => (
  <View style={styles.pill}>
    <Text style={styles.pillIcon}>{icon}</Text>
    <Text style={styles.pillText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  orbPurple: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  orbCyan: {
    position: 'absolute',
    bottom: -60,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(0, 210, 255, 0.06)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shieldContainer: {
    marginBottom: Spacing.lg,
  },
  shieldIcon: {
    fontSize: 72,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: '900',
    color: Colors.text.primary,
    letterSpacing: 8,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.accent.tertiary,
    letterSpacing: 1,
    marginBottom: Spacing.xl,
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: SCREEN_W * 0.85,
    marginBottom: Spacing.xl,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.elevated,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  pillIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  pillText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    width: '100%',
    alignItems: 'center',
    ...Shadow.card,
  },
  primaryBtnText: {
    color: Colors.text.primary,
    fontSize: FontSize.base,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  secondaryBtn: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  secondaryBtnText: {
    color: Colors.accent.tertiary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  versionText: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    marginTop: Spacing.lg,
    letterSpacing: 0.5,
  },
});
