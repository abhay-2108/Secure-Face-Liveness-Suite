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
      <Text style={styles.header}>DATALAKE EDGE TELEMETRY</Text>
      
      <View style={styles.row}>
        <Text style={styles.label}>Memory Arena:</Text>
        <Text style={styles.value}>{telemetry.arena}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>ONNX Engine:</Text>
        <Text style={styles.value}>{telemetry.model}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>HNSW Latency:</Text>
        <Text style={styles.value}>{telemetry.hnsw}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tract Latency:</Text>
        <Text style={styles.value}>{telemetry.inference}</Text>
      </View>
      
      <View style={[styles.divider]} />
      
      <View style={styles.row}>
        <Text style={styles.label}>AWS Sync State:</Text>
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
    backgroundColor: 'rgba(15, 20, 30, 0.85)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minWidth: 220,
  },
  header: {
    color: '#a0aab5',
    fontSize: 10,
    marginBottom: 12,
    letterSpacing: 1.2,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: '#708090',
    fontSize: 11,
    fontFamily: 'Courier New',
  },
  value: {
    color: '#00ffc8',
    fontSize: 11,
    fontFamily: 'Courier New',
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 10,
  },
  syncing: { color: '#ffb700' },
  synced: { color: '#00cc66' },
  offline: { color: '#ff3366' },
});
