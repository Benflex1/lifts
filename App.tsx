import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Dumbbell, History, BookOpen, TrendingUp } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorageProvider, useStorage } from './src/context/StorageContext';
import { WorkoutProvider, useWorkout } from './src/context/WorkoutContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { ActiveWorkoutScreen } from './src/screens/ActiveWorkoutScreen';
import { ExercisesScreen } from './src/screens/ExercisesScreen';

// PERF-11: History and Analytics are code-split, so the analytics stack (including the
// progression chart) no longer ships in the initial bundle.
const HistoryScreen = React.lazy(() =>
  import('./src/screens/HistoryScreen').then(module => ({ default: module.HistoryScreen })),
);
const AnalyticsScreen = React.lazy(() =>
  import('./src/screens/AnalyticsScreen').then(module => ({ default: module.AnalyticsScreen })),
);

import { ActiveWorkoutMiniBar } from './src/components/ActiveWorkoutMiniBar';
import { DraftResumeBanner } from './src/components/DraftResumeBanner';
import { ReadOnlyBanner } from './src/components/ReadOnlyBanner';
import { PersistenceErrorBanner } from './src/components/PersistenceErrorBanner';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { setErrorSink } from './src/utils/errorReporting';
import { setSetting } from './src/database/db';
import { DialogProvider } from './src/context/DialogContext';
import { WorkoutSummaryModal } from './src/components/WorkoutSummaryModal';
import { Workout } from './src/types';
import { saveCompletedWorkout } from './src/database/db';
import { saveCompletedWorkoutEdit } from './src/workout/completion';
import { colors } from './src/theme';
import {
  ActivationEmitter,
  TabActivationContext,
  createActivationEmitter,
} from './src/hooks/useReloadOnActivate';
import { useTabRetention } from './src/hooks/useTabRetention';
import type { TabKey } from './src/navigation/tabRoutes';
import { useWebTabHistory } from './src/navigation/useWebTabHistory';
import { useAndroidBackToWorkout } from './src/navigation/useAndroidBackToWorkout';

type Tab = TabKey;

const TABS: { key: Tab; label: string; icon: typeof Dumbbell }[] = [
  { key: 'workout', label: 'Workout', icon: Dumbbell },
  { key: 'history', label: 'History', icon: History },
  { key: 'exercises', label: 'Exercises', icon: BookOpen },
  { key: 'analytics', label: 'Progress', icon: TrendingUp },
];

/** PERF-11: heavy tabs are released after a retention window once hidden; the rest stay warm. */
const EVICTABLE_TABS: ReadonlySet<Tab> = new Set<Tab>(['history', 'analytics']);

/** Delay before the code-split tabs are warmed in the background, keeping the first switch fast. */
const TAB_PREFETCH_DELAY_MS = 1_500;

/** Lightweight placeholder while a code-split tab is downloaded. */
function TabLoadingFallback() {
  return (
    <View style={styles.tabLoadingFallback}>
      <ActivityIndicator size="small" color={colors.textMuted} />
    </View>
  );
}

function MainAppContent() {
  const { isWorkingOut, isMinimized, gyms, activeWorkout } = useWorkout();
  const insets = useSafeAreaInsets();
  const [currentTab, setCurrentTab] = useState<Tab>('workout');
  const showLogger = isWorkingOut && !isMinimized;
  const visibleTab: Tab | null = showLogger ? null : currentTab;

  // Tabs are mounted on first visit and kept alive (hidden) so switching back is instant; the
  // heavy ones are released again once they have been hidden for the retention window (PERF-11).
  const { mountedTabs, mountTab } = useTabRetention<Tab>({
    initialTab: 'workout',
    visibleTab,
    evictableTabs: EVICTABLE_TABS,
  });

  const selectTab = (tab: Tab) => {
    setCurrentTab(tab);
    mountTab(tab);
  };

  // ARCH-09/PROD-05: web URL history and shell-level Android back navigation.
  useWebTabHistory({ tab: currentTab, onSelectTab: selectTab });
  useAndroidBackToWorkout(currentTab, selectTab);

  // Warm the lazy screens shortly after startup so their first visit does not wait on the
  // network, without putting them back into the initial bundle.
  useEffect(() => {
    const timer = setTimeout(() => {
      void import('./src/screens/HistoryScreen');
      void import('./src/screens/AnalyticsScreen');
    }, TAB_PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(null);
  const [historyWorkoutUpdate, setHistoryWorkoutUpdate] = useState<Workout | null>(null);

  // One stable emitter per tab; firing it asks that tab to refresh its data in the background.
  const tabEmitters = useMemo(
    () =>
      Object.fromEntries(TABS.map(tab => [tab.key, createActivationEmitter()])) as Record<
        Tab,
        ActivationEmitter
      >,
    [],
  );
  const previousVisibleTabRef = useRef<Tab | null>(visibleTab);
  const shownTabsRef = useRef<Set<Tab>>(new Set(visibleTab ? [visibleTab] : []));

  useEffect(() => {
    const previous = previousVisibleTabRef.current;
    previousVisibleTabRef.current = visibleTab;
    if (!visibleTab || visibleTab === previous) return;
    // A tab's first appearance mounts it and it loads on its own; only returning visits refresh.
    if (shownTabsRef.current.has(visibleTab)) {
      tabEmitters[visibleTab].emit();
    } else {
      shownTabsRef.current.add(visibleTab);
    }
  }, [visibleTab, tabEmitters]);

  const handleWorkoutCompleted = (workout: Workout) => {
    setCompletedWorkout(workout);
    setHistoryWorkoutUpdate(null);
    selectTab('history');
  };

  const handleSummaryDismissed = () => {
    setCompletedWorkout(null);
    setHistoryWorkoutUpdate(null);
    selectTab('history');
  };

  const handleSummaryWorkoutUpdate = async (updated: Workout) => {
    await saveCompletedWorkoutEdit(updated, saveCompletedWorkout);
    setCompletedWorkout(updated);
    setHistoryWorkoutUpdate(updated);
  };

  return (
    <View style={styles.appWrapper}>
      <StatusBar style="light" />

      {/* Autosave failures must stay visible over both tabs and the logger. */}
      <PersistenceErrorBanner workout={activeWorkout} />

      {/* Completion summary modal surviving logger unmount */}
      <WorkoutSummaryModal
        workout={completedWorkout}
        visible={completedWorkout !== null}
        gyms={gyms}
        onUpdate={handleSummaryWorkoutUpdate}
        onDismiss={handleSummaryDismissed}
      />

      {showLogger && (
        <View style={styles.appWrapper}>
          <ReadOnlyBanner />
          <AppErrorBoundary label="Active workout">
            <ActiveWorkoutScreen onFinish={handleWorkoutCompleted} />
          </AppErrorBoundary>
        </View>
      )}

      <View style={[styles.appWrapper, showLogger && styles.hidden]}>
        {/* Screen Views */}
        <View style={styles.screenContent}>
          <ReadOnlyBanner />
          {TABS.map(tab =>
            mountedTabs.has(tab.key) ? (
              <View key={tab.key} style={[styles.tabPane, currentTab !== tab.key && styles.hidden]}>
                <AppErrorBoundary
                  label={tab.label}
                  resetKey={currentTab === tab.key ? `${tab.key}:visible` : `${tab.key}:hidden`}
                >
                  <TabActivationContext.Provider value={tabEmitters[tab.key]}>
                    <Suspense fallback={<TabLoadingFallback />}>
                      {tab.key === 'workout' && <WorkoutScreen />}
                      {tab.key === 'history' && (
                        <HistoryScreen workoutUpdate={historyWorkoutUpdate} />
                      )}
                      {tab.key === 'exercises' && <ExercisesScreen />}
                      {tab.key === 'analytics' && <AnalyticsScreen />}
                    </Suspense>
                  </TabActivationContext.Provider>
                </AppErrorBoundary>
              </View>
            ) : null,
          )}
        </View>

        {/* Paused Workout Card — placed in bottom thumb zone */}
        <DraftResumeBanner />

        {/* Persistent Mini Bar when workout is active in background */}
        <ActiveWorkoutMiniBar />

        {/* Bottom Navigation Bar */}
        <View style={[styles.bottomNav, { paddingBottom: Math.max(10, insets.bottom) }]}>
          {TABS.map(tab => {
            const active = currentTab === tab.key;
            const Icon = tab.icon;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.navTab}
                onPress={() => selectTab(tab.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: active }}
              >
                <Icon
                  size={23}
                  color={active ? colors.primary : colors.textMuted}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab.label}</Text>
                <View style={[styles.navDot, active && styles.navDotActive]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function AppRoot() {
  const { isReady, error, retry } = useStorage();

  if (!isReady && !error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={styles.logoTile}>
          <Dumbbell size={34} color={colors.onPrimary} />
        </View>
        <Text style={styles.loadingTitle}>Lifts</Text>
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={[styles.logoTile, { backgroundColor: colors.dangerSoft }]}>
          <Dumbbell size={34} color={colors.danger} />
        </View>
        <Text style={styles.loadingTitle}>Storage Error</Text>
        <Text style={styles.errorText}>{error || 'Unable to open or migrate database.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retry} accessibilityRole="button">
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SettingsProvider>
      <WorkoutProvider>
        <MainAppContent />
      </WorkoutProvider>
    </SettingsProvider>
  );
}

export default function App() {
  // Persist the latest error breadcrumb so a crash survives a reload and can be
  // inspected afterwards. Best-effort: storage may be the failing dependency, so
  // write failures are intentionally ignored here.
  useEffect(() => {
    let lastRecord = '';
    setErrorSink((error, context) => {
      const record = JSON.stringify({
        message: error.message,
        scope: context.scope,
        componentStack: typeof context.componentStack === 'string' ? context.componentStack : null,
        at: new Date().toISOString(),
      });
      if (record === lastRecord) return;
      lastRecord = record;
      setSetting('last_app_error', record).catch(() => {
        // Intentional: the in-memory breadcrumb is already recorded.
      });
    });
    return () => setErrorSink(null);
  }, []);

  return (
    <SafeAreaProvider>
      <AppErrorBoundary label="App">
        <StorageProvider>
          <DialogProvider>
            <AppRoot />
          </DialogProvider>
        </StorageProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appWrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenContent: {
    flex: 1,
  },
  tabPane: {
    flex: 1,
  },
  tabLoadingFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    display: 'none',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 6,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  navLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  navDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
    backgroundColor: 'transparent',
  },
  navDotActive: {
    backgroundColor: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 16,
  },
  errorText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  retryBtnText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
