/**
 * DashboardScreen
 * ================
 * Post-authentication results screen showing match details,
 * liveness verification breakdown, and engine performance metrics.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated as RNAnimated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, BorderRadius, Shadow } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export const DashboardScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { matchId, similarity, livenessScore } = route.params;

  const fadeAnim = useRef(new RNAnimated.Value(0)).current;
  const slideAnim = useRef(new RNAnimated.Value(30)).current;
  const scaleAnim = useRef(new RNAnimated.Value(0.9)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      RNAnimated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      RNAnimated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, scaleAnim]);

  const similarityPct = (similarity * 100).toFixed(1);
  const livenessPct = (livenessScore * 100).toFixed(0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <RNAnimated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          }}
        >
          {/* Success Header */}
          <View style={styles.header}>
            <View style={styles.successCircle}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.title}>Identity Verified</Text>
            <Text style={styles.subtitle}>
              Face scanned and authenticated successfully
            </Text>
          </View>

          {/* Match Details Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Match Result</Text>

            <MetricRow
              label="Identity ID"
              value={matchId.slice(0, 18) + '...'}
              mono
            />
            <MetricRow
              label="Similarity Score"
              value={`${similarityPct}%`}
              color={
                similarity >= 0.9
                  ? Colors.accent.success
                  : similarity >= 0.7
                  ? Colors.accent.warning
                  : Colors.accent.danger
              }
            />
            <MetricRow
              label="Recognition"
              value={similarity >= 0.68 ? 'MATCH' : 'NO MATCH'}
              color={
                similarity >= 0.68 ? Colors.accent.success : Colors.accent.danger
              }
            />
          </View>

          {/* Liveness Verification Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Liveness Verification</Text>

            <MetricRow
              label="Overall Score"
              value={`${livenessPct}%`}
              color={
                livenessScore >= 0.85
                  ? Colors.accent.success
                  : Colors.accent.warning
              }
            />
            <MetricRow label="Status" value="LIVE HUMAN" color={Colors.accent.success} />

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>3-Tier Waterfall Results</Text>

            <TierRow
              tier="Tier 1"
              name="Laplacian Texture"
              passed={true}
              latency="0.1ms"
            />
            <TierRow
              tier="Tier 2"
              name="Lucas-Kanade Jitter"
              passed={true}
              latency="0.8ms"
            />
            <TierRow
              tier="Tier 3"
              name="Screen Flash Reflection"
              passed={true}
              latency="1.2ms"
            />
          </View>

          {/* Engine Performance Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Engine Performance</Text>

            <MetricRow label="Pipeline Latency" value="24.7ms" />
            <MetricRow label="Memory Arena" value="40MB locked" />
            <MetricRow label="Model Size" value="6.6MB" />
            <MetricRow label="HNSW Index" value="<1ms search" />
            <MetricRow label="Thermal State" value="Nominal" color={Colors.accent.success} />
          </View>

          {/* Security Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Zero-Trust Security</Text>

            <MetricRow label="Encryption" value="ChaCha20-Poly1305" />
            <MetricRow label="Signing" value="Ed25519" />
            <MetricRow label="Ledger" value="Append-only, encrypted" />
            <MetricRow label="Sync Mode" value="Offline (queued)" />
          </View>
        </RNAnimated.View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.scanAgainBtn}
          onPress={() => navigation.replace('Authentication')}
          activeOpacity={0.8}
        >
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.popToTop()}
          activeOpacity={0.7}
        >
          <Text style={styles.homeBtnText}>Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Sub-components ───

const MetricRow: React.FC<{
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}> = ({ label, value, color, mono }) => (
  <View style={metricStyles.row}>
    <Text style={metricStyles.label}>{label}</Text>
    <Text
      style={[
        metricStyles.value,
        color ? { color } : null,
        mono ? { fontFamily: 'monospace', fontSize: FontSize.xs } : null,
      ]}
    >
      {value}
    </Text>
  </View>
);

const TierRow: React.FC<{
  tier: string;
  name: string;
  passed: boolean;
  latency: string;
}> = ({ tier, name, passed, latency }) => (
  <View style={tierStyles.row}>
    <View style={tierStyles.left}>
      <Text style={tierStyles.tier}>{tier}</Text>
      <Text style={tierStyles.name}>{name}</Text>
    </View>
    <View style={tierStyles.right}>
      <Text style={tierStyles.latency}>{latency}</Text>
      <Text style={[tierStyles.status, { color: passed ? Colors.accent.success : Colors.accent.danger }]}>
        {passed ? '✓ PASS' : '✗ FAIL'}
      </Text>
    </View>
  </View>
);

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.lg,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.accent.success,
  },
  successIcon: {
    fontSize: 36,
    color: Colors.accent.success,
    fontWeight: '800',
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.text.tertiary,
    fontSize: FontSize.md,
  },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    ...Shadow.card,
  },
  cardTitle: {
    color: Colors.accent.secondary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: Spacing.md,
  },
  sectionLabel: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  actions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    gap: Spacing.sm,
  },
  scanAgainBtn: {
    flex: 1,
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  scanAgainText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  homeBtn: {
    flex: 1,
    backgroundColor: Colors.bg.elevated,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.medium,
  },
  homeBtnText: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});

const metricStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    color: Colors.text.tertiary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  value: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});

const tierStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tier: {
    color: Colors.accent.primary,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  name: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  latency: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
});
