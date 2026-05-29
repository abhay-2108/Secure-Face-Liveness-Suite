import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Vibration } from 'react-native';

interface Props {
  prompt: string;
}

export const LivenessPromptUI: React.FC<Props> = ({ prompt }) => {
  useEffect(() => {
    if (prompt) {
      // Feature 2: Accessibility (Haptic Engine)
      // Provide tactile feedback for workers in harsh sunlight who can't read the screen
      if (prompt.includes('blink')) {
        Vibration.vibrate([0, 100, 100, 100]); // Rapid double pulse
      } else if (prompt.includes('turn')) {
        Vibration.vibrate([0, 300]); // Long single pulse
      }

      // Feature 2: Audio Cues (TTS Mock)
      // In a full build, this hooks into react-native-tts:
      // Tts.speak(prompt);
      console.log(`[TTS Audio Output]: "${prompt}"`);
    }
  }, [prompt]);

  if (!prompt) return null;
  
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{prompt}</Text>
      <Text style={styles.subtext}>Haptic & Audio Guidance Active</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    backgroundColor: 'rgba(20, 25, 40, 0.85)',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 200, 0.5)',
    shadowColor: '#00ffc8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
  },
  text: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  subtext: {
    color: '#00ffc8',
    fontSize: 9,
    marginTop: 4,
    letterSpacing: 0.5,
  }
});
