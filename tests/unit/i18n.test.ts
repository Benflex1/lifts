import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

mockModule('react-native', {
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Modal: 'Modal',
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  AccessibilityInfo: { setAccessibilityFocus: () => {} },
  findNodeHandle: () => null,
});
mockModule('lucide-react-native', new Proxy({}, { get: (_target, name) => name }));
mockModule('../../src/components/ui', { AppTouchable: 'TouchableOpacity' });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('translations resolve the same keys per locale with interpolation (PROD-04)', async () => {
  const { translate } = await import('../../src/i18n');

  assert.equal(translate('en', 'nav.workout'), 'Workout');
  assert.equal(translate('de', 'nav.workout'), 'Training');
  assert.equal(
    translate('en', 'workout.routineMetaOther', { exercises: 4, sets: 12 }),
    '4 exercises · 12 sets',
  );
  assert.equal(
    translate('de', 'workout.routineMetaOne', { exercises: 1, sets: 3 }),
    '1 Übung · 3 Sätze',
  );
  assert.equal(
    translate('de', 'rest.getReady', { seconds: 5 }),
    'Bereit machen! (5)',
    'placeholders are interpolated',
  );
  assert.equal(
    translate('en', 'rest.getReady', {}),
    'Get Ready! ({seconds})',
    'missing params stay visible',
  );

  const missing = 'does.not.exist' as never;
  assert.equal(translate('de', missing), 'does.not.exist', 'unknown keys fall back to the key');
});

test('the provider switches locales and re-renders consumers (PROD-04)', async () => {
  const { I18nProvider, useI18n } = await import('../../src/i18n/I18nContext');

  const Probe: React.FC = () => {
    const { t, locale, setLocale } = useI18n();
    return React.createElement(
      'Text',
      null,
      `${locale}:${t('nav.workout')}`,
      React.createElement('TouchableOpacity', {
        accessibilityLabel: 'switch',
        onPress: () => setLocale(locale === 'en' ? 'de' : 'en'),
      }),
    );
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(I18nProvider, {
        initialLocale: 'en',
        children: React.createElement(Probe),
      }),
    );
  });

  const textOf = (): string => {
    const textNode = renderer.root.findAll(node => node.type === ('Text' as any))[0];
    const children = textNode.props.children as unknown[];
    return children.filter(child => typeof child === 'string').join('');
  };

  assert.equal(textOf(), 'en:Workout');

  const switcher = renderer.root.findAll(node => node.props?.accessibilityLabel === 'switch')[0];
  act(() => {
    switcher.props.onPress();
  });
  assert.equal(textOf(), 'de:Training');
});

test('a real surface renders in the second locale without screen changes (PROD-04)', async () => {
  const { I18nProvider } = await import('../../src/i18n');
  const { WorkoutOptionsMenu } = await import('../../src/screens/activeWorkout/WorkoutOptionsMenu');

  const noop = () => {};
  const element = React.createElement(I18nProvider, {
    initialLocale: 'de',
    children: React.createElement(WorkoutOptionsMenu, {
      visible: true,
      workoutName: 'Push Day',
      gymTrackingEnabled: false,
      activeGymName: null,
      showRpeColumn: false,
      bottomInset: 0,
      onClose: noop,
      onExpandAll: noop,
      onCollapseAll: noop,
      onReorder: noop,
      onChangeGym: noop,
      onAdjustDuration: noop,
      onToggleRpeColumn: noop,
      onDiscard: noop,
    } as never),
  });

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });

  const texts = renderer.root.findAllByType('Text' as never).map(node => {
    const children = node.props.children as unknown;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  });

  assert.ok(texts.includes('Alle Übungen ausklappen'));
  assert.ok(texts.includes('Training verwerfen'));
  assert.ok(texts.includes('RPE-Spalte anzeigen'));
});
