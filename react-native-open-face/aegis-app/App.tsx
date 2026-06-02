import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { LandingScreen } from './src/screens/LandingScreen';
import { AuthenticationScreen } from './src/screens/AuthenticationScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';

type ScreenState = 'Landing' | 'Scanner' | 'Dashboard';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('Landing');
  const [matchId, setMatchId] = useState<string | null>(null);

  const handleStartScan = () => {
    setCurrentScreen('Scanner');
  };

  const handleScanSuccess = (id: string) => {
    setMatchId(id);
    setCurrentScreen('Dashboard');
  };

  const handleCancelScan = () => {
    setCurrentScreen('Landing');
  };

  const handleRetry = () => {
    setMatchId(null);
    setCurrentScreen('Scanner');
  };

  const handleLogout = () => {
    setMatchId(null);
    setCurrentScreen('Landing');
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#050505" />
        
        {currentScreen === 'Landing' && (
          <LandingScreen onStart={handleStartScan} />
        )}

        {currentScreen === 'Scanner' && (
          <AuthenticationScreen 
            onSuccess={handleScanSuccess} 
            onCancel={handleCancelScan} 
          />
        )}

        {currentScreen === 'Dashboard' && matchId && (
          <DashboardScreen 
            matchId={matchId} 
            onRetry={handleRetry} 
            onLogout={handleLogout} 
          />
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
});
