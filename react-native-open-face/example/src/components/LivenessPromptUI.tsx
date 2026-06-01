import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Vibration, Animated } from 'react-native';

interface Props {
  prompt: string;
}

export const LivenessPromptUI: React.FC<Props> = ({ prompt }) => {
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (prompt) {
      // Haptic Engine for accessibility
      if (prompt.includes('blink')) {
        Vibration.vibrate([0, 100, 100, 100]); 
      } else if (prompt.includes('turn')) {
        Vibration.vibrate([0, 300]);
      }
      
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [prompt, fadeAnim]);

  if (!prompt) return null;
  
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Text style={styles.text}>{prompt}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 20,
  },
  text: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
