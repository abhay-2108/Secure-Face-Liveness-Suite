/**
 * TelemetryHUD Component
 * =======================
 * Developer-facing heads-up display showing real-time engine metrics.
 * Toggled via long-press on the authentication screen.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';
import type { Telemetry } from '../types';

interface Props {
  telemetry: Telemetry;
  latencyMs?: number;
}

export const TelemetryHUD: React.FC<Props> = ({ telemetry, latencyMs }) => {
  const isSyncing = telemetry.sync.includes('syncing');
  const isOnline = !telemetry.sync.includes('offline');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>⚡ ENGINE TELEMETRY</Text>

      <Row label="Memory Arena" value={telemetry.arena} />
      <Row label="ONNX Model" value={telemetry.model} />
      <Row label="HNSW Search" value={telemetry.hnsw} />
      <Row label="Tract Inference" value={telemetry.inference} />
      <Row label="FPS" value={telemetry.fps} />

      <View style={styles.divider} />

      <Row
        label="Thermal"
        value={telemetry.thermal}
        valueColor={
          telemetry.thermal === 'nominal' ? Colors.accent.success : Colors.accent.warning
        }
      />
      <Row
        label="AWS Sync"
        value={telemetry.sync}
        valueColor={
          isSyncing
            ? Colors.accent.warning
            : isOnline
            ? Colors.accent.success
            : Colors.accent.danger
        }
      />

      {latencyMs !== undefined && (
        <>
          <View style={styles.divider} />
          <Row
            label="Pipeline"
            value={`${latencyMs.toFixed(0)}ms`}
            valueColor={latencyMs < 100 ? Colors.accent.success : Colors.accent.warning}
          />
        </>
      )}
    </View>
  );
};

const Row: React.FC<{
  label: string;
  value: string;
  valueColor?: string;
}> = ({ label, value, valueColor }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: Spacing.md,
    backgroundColor: 'rgba(5, 5, 16, 0.92)',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 200,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    zIndex: 50,
  },
  header: {
    color: Colors.accent.secondary,
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  value: {
    color: Colors.text.primary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: Spacing.sm,
  },
});
