import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from './ui';

interface ExerciseFilterBarProps {
  muscles: string[];
  equipment: string[];
  selectedMuscle: string;
  selectedEquipment: string;
  onSelectMuscle: (muscle: string) => void;
  onSelectEquipment: (equipment: string) => void;
}

/**
 * Two compact, horizontally scrolling filter rows: target muscle on top,
 * equipment below at a smaller size so the hierarchy reads at a glance.
 */
export function ExerciseFilterBar({
  muscles,
  equipment,
  selectedMuscle,
  selectedEquipment,
  onSelectMuscle,
  onSelectEquipment,
}: ExerciseFilterBarProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {muscles.map(muscle => (
          <Chip
            key={muscle}
            label={muscle === 'All' ? 'All Muscles' : muscle}
            selected={selectedMuscle === muscle}
            onPress={() => onSelectMuscle(muscle)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {equipment.map(item => (
          <Chip
            key={item}
            size="sm"
            label={item === 'All' ? 'Any Equipment' : item}
            selected={selectedEquipment === item}
            onPress={() => onSelectEquipment(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingBottom: 10,
  },
  row: {
    gap: 8,
    paddingHorizontal: 16,
  },
});
