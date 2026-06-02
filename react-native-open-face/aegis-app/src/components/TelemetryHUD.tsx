import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  telemetry: {
    arena: string;
    model: string;
    hnsw: string;
    inference: string;
    sync: string;
  };
}

export const TelemetryHUD: React.FC<Props> = ({ telemetry }) => {
  const isSyncing = telemetry.sync.includes('syncing');
  const isOnline = !telemetry.sync.includes('offline');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Debug Telemetry</Text>
      
      <View style={styles.row}>
        <Text style={styles.label}>Memory Arena</Text>
        <Text style={styles.value}>{telemetry.arena}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>ONNX Engine</Text>
        <Text style={styles.value}>{telemetry.model}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>HNSW Latency</Text>
        <Text style={styles.value}>{telemetry.hnsw}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tract Latency</Text>
        <Text style={styles.value}>{telemetry.inference}</Text>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.row}>
        <Text style={styles.label}>AWS Sync</Text>
        <Text style={[
          styles.value, 
          isSyncing ? styles.syncing : (isOnline ? styles.synced : styles.offline)
        ]}>
          {telemetry.sync}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 16,
    borderRadius: 16,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 50,
  },
  header: {
    color: '#000',
    fontSize: 12,
    marginBottom: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  value: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginVertical: 10,
  },
  syncing: { color: '#F5A623' },
  synced: { color: '#34C759' },
  offline: { color: '#FF3B30' },
});
