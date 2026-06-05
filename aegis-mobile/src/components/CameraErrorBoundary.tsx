import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
  errorStack: string;
}

export class CameraErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, errorMsg: '', errorStack: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.message, errorStack: error.stack || '' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CameraErrorBoundary] Caught error:', error, errorInfo);
  }

  private handleRestart = () => {
    this.setState({ hasError: false, errorMsg: '', errorStack: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.title}>Camera Hardware Error</Text>
          <Text style={styles.subtitle}>
            VisionCamera encountered a hardware or permission failure.
          </Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{this.state.errorMsg}</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleRestart}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Retry Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    zIndex: 9999,
  },
  icon: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.accent.warning,
    fontSize: FontSize.xl,
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
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    marginBottom: Spacing.xl,
    width: '100%',
  },
  errorText: {
    color: Colors.accent.warning,
    fontSize: FontSize.sm,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: Colors.accent.warning,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  buttonText: {
    color: Colors.bg.primary,
    fontSize: FontSize.base,
    fontWeight: '700',
  },
});
