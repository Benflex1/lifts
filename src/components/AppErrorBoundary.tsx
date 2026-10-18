import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme';
import { reportError } from '../utils/errorReporting';

interface AppErrorBoundaryProps {
  /** Human-readable origin used in error reports, for example `History` or `Active workout`. */
  label: string;
  /** When this value changes, a caught error is cleared so the subtree can retry. */
  resetKey?: string;
  children: React.ReactNode;
  /** Optional hook for tests or future crash persistence. */
  onError?: (error: Error) => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
  resetKey?: string;
}

/**
 * Catches render errors in its subtree and shows a recovery panel instead of
 * blanking the whole app. Place one at the root and one around each major
 * surface (tabs, active logger) so a crash stays local.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: AppErrorBoundaryProps,
    state: AppErrorBoundaryState,
  ): Partial<AppErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { resetKey: props.resetKey, error: null };
    }
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportError(error, {
      scope: `render.${this.props.label}`,
      componentStack: info.componentStack ?? null,
    });
    this.props.onError?.(error);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {error.message || 'An unexpected error interrupted this screen.'}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={this.handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={this.handleReload}
            accessibilityRole="button"
            accessibilityLabel="Reload the app"
          >
            <Text style={styles.secondaryButtonText}>Reload App</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  button: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  buttonText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textSecondary,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
});
