import React from 'react';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

const Dumbbell = () => null;

async function loadBoundary(t: { mock: { module: (specifier: string, options: { exports: object }) => void } }) {
  t.mock.module('lucide-react-native', { exports: { Dumbbell } });
  return import('../../src/components/ExerciseVisualErrorBoundary');
}

describe('ExerciseVisual runtime guard', () => {
  it('renders the existing dumbbell icon at the requested size after a child error', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }
    const { ExerciseVisualErrorBoundary } = await loadBoundary(t);
    const boundary = new ExerciseVisualErrorBoundary({
      dimension: 56,
      accessibilityLabel: 'Broken lift illustration',
      children: null,
    });

    boundary.state = ExerciseVisualErrorBoundary.getDerivedStateFromError(new Error('broken SVG'));
    const fallback = boundary.render() as React.ReactElement;

    assert.equal(fallback.type, Dumbbell);
    assert.equal(fallback.props.size, 56);
    assert.equal(fallback.props.accessibilityLabel, 'Broken lift illustration');
  });

});
