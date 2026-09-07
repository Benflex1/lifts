import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Dumbbell, History, BookOpen, BarChart3 } from 'lucide-react-native';
import { WorkoutProvider, useWorkout } from './src/context/WorkoutContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { initDatabase } from './src/database/db';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { ActiveWorkoutScreen } from './src/screens/ActiveWorkoutScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ExercisesScreen } from './src/screens/ExercisesScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';

import { ActiveWorkoutMiniBar } from './src/components/ActiveWorkoutMiniBar';
import { DraftResumeBanner } from './src/components/DraftResumeBanner';

type Tab = 'workout' | 'history' | 'exercises' | 'analytics';

function MainAppContent() {
  const { isWorkingOut, isMinimized } = useWorkout();
  const [currentTab, setCurrentTab] = useState<Tab>('workout');

  // If in an active gym session and NOT minimized, show gym floor logger directly
  if (isWorkingOut && !isMinimized) {
    return (
      <View style={styles.appWrapper}>
        <StatusBar style="light" />
        <ActiveWorkoutScreen onFinish={() => setCurrentTab('history')} />
      </View>
    );
  }

  return (
    <View style={styles.appWrapper}>
      <StatusBar style="light" />

      {/* Screen Views */}
      <View style={styles.screenContent}>
        <DraftResumeBanner />
        {currentTab === 'workout' && (
          <WorkoutScreen onStartActiveWorkout={() => {}} />
        )}
        {currentTab === 'history' && (
          <HistoryScreen onStartActiveWorkout={() => {}} />
        )}
        {currentTab === 'exercises' && <ExercisesScreen />}
        {currentTab === 'analytics' && <AnalyticsScreen />}
      </View>

      {/* Persistent Mini Bar when workout is active in background */}
      <ActiveWorkoutMiniBar />

      {/* Modern Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setCurrentTab('workout')}
          activeOpacity={0.7}
        >
          <Dumbbell
            size={22}
            color={currentTab === 'workout' ? '#3B82F6' : '#6B7280'}
          />
          <Text
            style={[
              styles.navLabel,
              currentTab === 'workout' && styles.navLabelActive,
            ]}
          >
            Workout
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setCurrentTab('history')}
          activeOpacity={0.7}
        >
          <History
            size={22}
            color={currentTab === 'history' ? '#3B82F6' : '#6B7280'}
          />
          <Text
            style={[
              styles.navLabel,
              currentTab === 'history' && styles.navLabelActive,
            ]}
          >
            History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setCurrentTab('exercises')}
          activeOpacity={0.7}
        >
          <BookOpen
            size={22}
            color={currentTab === 'exercises' ? '#3B82F6' : '#6B7280'}
          />
          <Text
            style={[
              styles.navLabel,
              currentTab === 'exercises' && styles.navLabelActive,
            ]}
          >
            Exercises
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setCurrentTab('analytics')}
          activeOpacity={0.7}
        >
          <BarChart3
            size={22}
            color={currentTab === 'analytics' ? '#3B82F6' : '#6B7280'}
          />
          <Text
            style={[
              styles.navLabel,
              currentTab === 'analytics' && styles.navLabelActive,
            ]}
          >
            Analytics
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
      } catch (err) {
        console.error('Failed to initialize database:', err);
      } finally {
        setDbReady(true);
      }
    }
    prepare();
  }, []);

  if (!dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <Dumbbell size={48} color="#3B82F6" />
        <Text style={styles.loadingTitle}>LIFTS</Text>
        <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 20 }} />
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

const styles = StyleSheet.create({
  appWrapper: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  screenContent: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: '#181A20',
    borderTopWidth: 1,
    borderTopColor: '#262A34',
    paddingBottom: 10,
    paddingTop: 8,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  navLabelActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 12,
  },
});
