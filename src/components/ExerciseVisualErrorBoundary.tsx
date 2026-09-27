import React from 'react';
import { Dumbbell } from 'lucide-react-native';
import { colors } from '../theme';

export interface ExerciseVisualErrorBoundaryProps {
  dimension: number;
  accessibilityLabel: string;
  children: React.ReactNode;
}

interface ExerciseVisualErrorBoundaryState {
  hasError: boolean;
}

export class ExerciseVisualErrorBoundary extends React.Component<
  ExerciseVisualErrorBoundaryProps,
  ExerciseVisualErrorBoundaryState
> {
  state: ExerciseVisualErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ExerciseVisualErrorBoundaryState {
    return { hasError: true };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Dumbbell
          size={this.props.dimension}
          color={colors.textSoft}
          accessibilityLabel={this.props.accessibilityLabel}
        />
      );
    }

    return this.props.children;
  }
}
