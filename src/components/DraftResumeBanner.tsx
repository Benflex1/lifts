import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Trash2 } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatDuration } from '../utils/calculator';

export const DraftResumeBanner: React.FC = () => {
  const { draftAvailable, resumeDraft, discardDraft, isWorkingOut } = useWorkout();

  if (!draftAvailable || isWorkingOut) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.bannerInfo}>
        <Text style={styles.bannerTitle}>Unfinished Workout</Text>
        <Text style={styles.bannerSub}>
          {draftAvailable.name} • {formatDuration(draftAvailable.durationSeconds)}
        </Text>
      </View>
      <View style={styles.bannerActions}>
        <TouchableOpacity style={styles.discardBtn} onPress={discardDraft}>
          <Trash2 size={14} color="#EF4444" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.resumeBtn} onPress={resumeDraft}>
          <Play size={14} color="#000" fill="#000" />
          <Text style={styles.resumeBtnText}>Resume</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E232E',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D3442',
  },
  bannerInfo: { flex: 1, marginRight: 12 },
  bannerTitle: { color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  bannerSub: { color: '#9CA3AF', fontSize: 12 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discardBtn: { padding: 8, borderRadius: 8, backgroundColor: '#2A171B' },
  resumeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  resumeBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
});
