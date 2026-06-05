import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
  errorStack: string;
}

export class EngineErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, errorMsg: '', errorStack: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.message, errorStack: error.stack || '' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[EngineErrorBoundary] Caught error:', error, errorInfo);
  }

  private handleRestart = () => {
    this.setState({ hasError: false, errorMsg: '', errorStack: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>🧠</Text>
          <Text style={styles.title}>AI Engine Panic</Text>
          <Text style={styles.subtitle}>
            The Rust inference engine crashed or failed to load.
          </Text>
          <ScrollView style={styles.errorBox} contentContainerStyle={{ padding: Spacing.sm }}>
            <Text style={styles.errorText}>{this.state.errorMsg}</Text>
            <Text style={styles.errorStack}>{this.state.errorStack}</Text>
          </ScrollView>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleRestart}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Restart AI Engine</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  icon: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.accent.danger,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.base,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  errorBox: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    marginBottom: Spacing.xl,
    width: '100%',
    maxHeight: 200,
  },
  errorText: {
    color: Colors.accent.danger,
    fontSize: FontSize.sm,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  errorStack: {
    color: Colors.text.tertiary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: Colors.accent.danger,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  buttonText: {
    color: Colors.text.primary,
    fontSize: FontSize.base,
    fontWeight: '700',
  },
});
