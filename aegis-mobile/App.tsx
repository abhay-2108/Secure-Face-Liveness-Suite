/**
 * Aegis: Secure Face Liveness Suite
 * ===================================
 * NHAI Hackathon 7.0 — Edge AI Facial Recognition & Liveness Detection
 *
 * 4-Tier Architecture:
 *   Tier 1: React Native / TypeScript (this file)
 *   Tier 2: C++ / JSI / JNI Bridge
 *   Tier 3: Rust Inference Engine (tract-onnx)
 *   Tier 4: Zero-Trust Cryptography & Cloud Sync
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LandingScreen } from './src/screens/LandingScreen';
import { AuthenticationScreen } from './src/screens/AuthenticationScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { EnrollmentScreen } from './src/screens/EnrollmentScreen';
import { ErrorBoundary as AppErrorBoundary } from './src/components/ErrorBoundary';
import { EngineErrorBoundary } from './src/components/EngineErrorBoundary';

export type RootStackParamList = {
  Landing: undefined;
  Authentication: undefined;
  Dashboard: { matchId: string; similarity: number; livenessScore: number };
  Enrollment: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#050510" translucent />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Landing"
            screenOptions={{
              headerShown: false,
              animation: 'fade_from_bottom',
              contentStyle: { backgroundColor: '#050510' },
            }}
          >
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Authentication">
              {(props) => (
                <EngineErrorBoundary>
                  <AuthenticationScreen {...props} />
                </EngineErrorBoundary>
              )}
            </Stack.Screen>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Enrollment">
              {(props) => (
                <EngineErrorBoundary>
                  <EnrollmentScreen {...props} />
                </EngineErrorBoundary>
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
