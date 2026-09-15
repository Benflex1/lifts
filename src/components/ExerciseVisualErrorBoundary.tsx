import React from 'react';
import { Dumbbell } from 'lucide-react-native';

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
          color="#CBD5E1"
          accessibilityLabel={this.props.accessibilityLabel}
        />
      );
    }

    return this.props.children;
  }
}
