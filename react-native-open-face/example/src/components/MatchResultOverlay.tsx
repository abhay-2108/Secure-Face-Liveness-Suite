import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Props {
  matchId: string | null;
  visible: boolean;
}

export const MatchResultOverlay: React.FC<Props> = ({ matchId, visible }) => {
  const [slideAnim] = useState(new Animated.Value(100)); // Start below screen

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!visible) return null;
  
  const isMatch = matchId !== null;
  
  return (
    <Animated.View style={[
      styles.container, 
      { transform: [{ translateY: slideAnim }] }
    ]}>
      <View style={[styles.iconContainer, isMatch ? styles.successIconBg : styles.failIconBg]}>
        <Text style={styles.icon}>{isMatch ? '✓' : '✗'}</Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>
          {isMatch ? 'Identity Verified' : 'Authentication Failed'}
        </Text>
        <Text style={styles.subtitle}>
          {isMatch ? `ID: ${matchId}` : 'Face not recognized securely'}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
    zIndex: 30,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  successIconBg: {
    backgroundColor: '#E8F5E9', // Light Green
  },
  failIconBg: {
    backgroundColor: '#FFEBEE', // Light Red
  },
  icon: {
    fontSize: 22,
    color: '#000',
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
});
