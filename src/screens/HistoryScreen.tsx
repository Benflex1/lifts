import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Calendar as CalendarIcon,
  Clock,
  Dumbbell,
  Repeat,
  Trophy,
} from 'lucide-react-native';
import { WorkoutHistorySummary } from '../types';
import { getWorkoutHistory } from '../database/db';
import { formatDuration } from '../utils/calculator';
import { useWorkout } from '../context/WorkoutContext';

export const HistoryScreen: React.FC<{ onStartActiveWorkout: () => void }> = ({
  onStartActiveWorkout,
}) => {
  const { startWorkout } = useWorkout();
  const [history, setHistory] = useState<WorkoutHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const list = await getWorkoutHistory();
      setHistory(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePerformAgain = async (item: WorkoutHistorySummary) => {
    await startWorkout(undefined, `${item.name}`);
    onStartActiveWorkout();
  };

  // Calculate totals
  const totalWorkouts = history.length;
  const totalVolume = history.reduce((sum, w) => sum + w.totalVolumeKg, 0);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      {/* Stats Summary Strip */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>WORKOUTS</Text>
          <Text style={styles.summaryValue}>{totalWorkouts}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>ALL-TIME VOLUME</Text>
          <Text style={styles.summaryValue}>{totalVolume.toLocaleString()} kg</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {history.map(item => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.workoutName}>{item.name}</Text>
                  <View style={styles.dateRow}>
                    <CalendarIcon size={12} color="#9CA3AF" />
                    <Text style={styles.dateText}>{formatDate(item.startTime)}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.repeatBtn}
                  onPress={() => handlePerformAgain(item)}
                >
                  <Repeat size={14} color="#10B981" />
                  <Text style={styles.repeatBtnText}>Repeat</Text>
                </TouchableOpacity>
              </View>

              {/* Metrics Row */}
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Clock size={14} color="#9CA3AF" />
                  <Text style={styles.metricText}>
                    {formatDuration(item.durationSeconds)}
                  </Text>
                </View>

                <View style={styles.metric}>
                  <Dumbbell size={14} color="#9CA3AF" />
                  <Text style={styles.metricText}>
                    {item.totalVolumeKg.toLocaleString()} kg
                  </Text>
                </View>

                <View style={styles.metric}>
                  <Trophy size={14} color="#9CA3AF" />
                  <Text style={styles.metricText}>{item.totalSets} sets</Text>
                </View>
              </View>

              {/* Exercises List Summary */}
              {item.exerciseNames.length > 0 && (
                <View style={styles.exerciseNamesBox}>
                  <Text style={styles.exerciseNamesText} numberOfLines={2}>
                    {item.exerciseNames.join(' • ')}
                  </Text>
                </View>
              )}
            </View>
          ))}

          {history.length === 0 && (
            <View style={styles.emptyBox}>
              <Dumbbell size={48} color="#2A2E3B" />
              <Text style={styles.emptyTitle}>No workouts logged yet</Text>
              <Text style={styles.emptySub}>
                Start your first workout to view your history and progression!
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  header: {
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#181A20',
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#13151B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#262A34',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  historyCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#132E27',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  repeatBtnText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
  },
  exerciseNamesBox: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#20242E',
  },
  exerciseNamesText: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
});
