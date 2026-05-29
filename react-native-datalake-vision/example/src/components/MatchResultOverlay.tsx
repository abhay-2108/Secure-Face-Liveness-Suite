import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  matchId: string | null;
  visible: boolean;
}

export const MatchResultOverlay: React.FC<Props> = ({ matchId, visible }) => {
  if (!visible) return null;
  
  const isMatch = matchId !== null;
  
  return (
    <View style={[styles.container, isMatch ? styles.successBg : styles.failBg]}>
      <Text style={styles.icon}>
        {isMatch ? '🔓' : '🔒'}
      </Text>
      <View>
        <Text style={styles.title}>
          {isMatch ? 'IDENTITY VERIFIED' : 'AUTHENTICATION FAILED'}
        </Text>
        <Text style={styles.subtitle}>
          {isMatch ? `ID: ${matchId}` : 'Face not recognized in offline ledger'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    width: '85%',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  successBg: {
    backgroundColor: 'rgba(0, 40, 20, 0.85)',
    borderColor: '#00ff66',
    borderWidth: 1,
    shadowColor: '#00ff66',
  },
  failBg: {
    backgroundColor: 'rgba(40, 10, 10, 0.85)',
    borderColor: '#ff3366',
    borderWidth: 1,
    shadowColor: '#ff3366',
  },
  icon: {
    fontSize: 28,
    marginRight: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1.0,
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});
