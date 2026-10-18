import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { History } from 'lucide-react-native';
import { Workout } from '../types';
import { WorkoutEditModal } from '../components/WorkoutEditModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';
import { colors } from '../theme';
import { ActionSheet, Chip, ScreenHeader } from '../components/ui';
import { HistoryCard } from './history/HistoryCard';
import { useHistoryController } from './history/useHistoryController';
import { styles } from './historyStyles';

interface HistoryScreenProps {
  workoutUpdate?: Workout | null;
}

/**
 * ARCH-12: composition only. Screen state and handlers live in `useHistoryController`;
 * each list row is the extracted `HistoryCard`.
 */
const HistoryScreenInner: React.FC<HistoryScreenProps> = ({ workoutUpdate = null }) => {
  const { header, gymFilter, list, actionSheet, editModal, startModal } = useHistoryController({
    workoutUpdate,
  });

  return (
    <View style={styles.container}>
      <ScreenHeader title="History" subtitle={header.subtitle} />

      {gymFilter.visible && (
        <View style={styles.gymFilterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gymFilterScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Chip
              label="All Gyms"
              selected={gymFilter.selectedGymId === null}
              onPress={() => gymFilter.onSelectGym(null)}
              accessibilityLabel="Show all gyms"
            />
            {gymFilter.gyms.map(gym => (
              <Chip
                key={gym.id}
                label={gym.name}
                selected={gymFilter.selectedGymId === gym.id}
                onPress={() => gymFilter.onSelectGym(gym.id)}
                accessibilityLabel={`Show ${gym.name} workouts`}
                leading={<View style={[styles.gymSwatch, { backgroundColor: gym.color }]} />}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {list.loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, list.history.length === 0 && styles.emptyListContent]}
          keyboardShouldPersistTaps="handled"
          data={list.history}
          keyExtractor={item => item.id}
          // Cards are tall; render about a screen ahead rather than FlatList's default of ten.
          initialNumToRender={5}
          maxToRenderPerBatch={4}
          windowSize={5}
          renderItem={({ item }) => (
            <HistoryCard
              item={item}
              isExpanded={list.expandedId === item.id}
              detail={list.details[item.id]}
              prSummary={list.prs[item.id]}
              isLoadingDetail={list.loadingDetailId === item.id}
              gymTrackingEnabled={list.gymTrackingEnabled}
              gym={list.gymById.get(item.gymId)}
              unit={list.unit}
              onToggleExpand={list.onToggleExpand}
              onOpenMenu={list.onOpenMenu}
              onEditWorkout={list.onEditWorkout}
              onShowSetPR={list.onShowSetPR}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <History size={26} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {gymFilter.selectedGymId ? 'No workouts at this gym' : 'No workouts logged yet'}
              </Text>
              <Text style={styles.emptySub}>
                Finished workouts show up here with every set, PR and note.
              </Text>
            </View>
          )}
        />
      )}

      <ActionSheet {...actionSheet} />

      <WorkoutEditModal {...editModal} />

      <WorkoutStartModal {...startModal} />
    </View>
  );
};

/** Memoized so hidden (kept-alive) tabs skip re-rendering when the app shell updates. */
export const HistoryScreen = React.memo(HistoryScreenInner);
