import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { X, Check, Timer } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  visible: boolean;
  initialSeconds?: number;
  exerciseName?: string;
  showApplyToAll?: boolean;
  onClose: () => void;
  onSave: (seconds: number, applyToAll?: boolean) => void;
}

const ITEM_HEIGHT = 46;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 230
const CENTER_OFFSET = ITEM_HEIGHT * 2; // 92

const MINUTES_LIST = Array.from({ length: 11 }, (_, i) => i); // 0 to 10 min
const SECONDS_LIST = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]; // 0 to 55s in 5s increments

const PRESET_TIMERS = [
  { label: 'Off', totalSec: 0 },
  { label: '30s', totalSec: 30 },
  { label: '1m', totalSec: 60 },
  { label: '1m 30s', totalSec: 90 },
  { label: '2m', totalSec: 120 },
  { label: '2m 30s', totalSec: 150 },
  { label: '3m', totalSec: 180 },
  { label: '5m', totalSec: 300 },
];

export const RestTimeWheelModal: React.FC<Props> = ({
  visible,
  initialSeconds = 90,
  exerciseName,
  showApplyToAll = false,
  onClose,
  onSave,
}) => {
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [applyToAll, setApplyToAll] = useState(false);

  const minScrollRef = useRef<ScrollView>(null);
  const secScrollRef = useRef<ScrollView>(null);

  const lastMinIndex = useRef<number>(0);
  const lastSecIndex = useRef<number>(0);

  // Synchronize on open
  useEffect(() => {
    if (visible) {
      const initial = Math.max(0, initialSeconds);
      const m = Math.floor(initial / 60);
      const s = Math.round((initial % 60) / 5) * 5;
      const safeS = s >= 60 ? 55 : s;
      const safeM = Math.min(10, m);

      setMinutes(safeM);
      setSeconds(safeS);
      setApplyToAll(false);

      const minIdx = MINUTES_LIST.indexOf(safeM);
      const secIdx = SECONDS_LIST.indexOf(safeS);

      lastMinIndex.current = minIdx >= 0 ? minIdx : 0;
      lastSecIndex.current = secIdx >= 0 ? secIdx : 0;

      // Small delay to ensure layout is ready before scrolling
      setTimeout(() => {
        minScrollRef.current?.scrollTo({
          y: (minIdx >= 0 ? minIdx : 0) * ITEM_HEIGHT,
          animated: false,
        });
        secScrollRef.current?.scrollTo({
          y: (secIdx >= 0 ? secIdx : 0) * ITEM_HEIGHT,
          animated: false,
        });
      }, 50);
    }
  }, [visible, initialSeconds]);

  const triggerHaptic = () => {
    try {
      Haptics.selectionAsync();
    } catch {
      // Ignore if not supported
    }
  };

  const handleMinScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(MINUTES_LIST.length - 1, index));
    if (clamped !== lastMinIndex.current) {
      lastMinIndex.current = clamped;
      setMinutes(MINUTES_LIST[clamped]);
      triggerHaptic();
    }
  };

  const handleSecScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(SECONDS_LIST.length - 1, index));
    if (clamped !== lastSecIndex.current) {
      lastSecIndex.current = clamped;
      setSeconds(SECONDS_LIST[clamped]);
      triggerHaptic();
    }
  };

  const selectPreset = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const safeM = Math.min(10, m);
    const safeS = SECONDS_LIST.includes(s) ? s : Math.round(s / 5) * 5;

    setMinutes(safeM);
    setSeconds(safeS);
    triggerHaptic();

    const minIdx = MINUTES_LIST.indexOf(safeM);
    const secIdx = SECONDS_LIST.indexOf(safeS);

    if (minIdx >= 0) {
      minScrollRef.current?.scrollTo({ y: minIdx * ITEM_HEIGHT, animated: true });
    }
    if (secIdx >= 0) {
      secScrollRef.current?.scrollTo({ y: secIdx * ITEM_HEIGHT, animated: true });
    }
  };

  const totalCalculatedSeconds = minutes * 60 + seconds;

  const handleConfirm = () => {
    onSave(totalCalculatedSeconds, applyToAll);
    onClose();
  };

  const formatDisplayTime = () => {
    if (totalCalculatedSeconds === 0) {
      return 'OFF';
    }
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    return `${mm} : ${ss}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Rest Timer Wheel</Text>
              {exerciseName && (
                <Text style={styles.exerciseSubtitle} numberOfLines={1}>
                  {exerciseName}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>

          {/* Big Digital Display Banner */}
          <View style={styles.displayBanner}>
            <Timer size={24} color={totalCalculatedSeconds > 0 ? '#10B981' : '#6B7280'} />
            <Text
              style={[
                styles.digitalTimeText,
                totalCalculatedSeconds === 0 && styles.digitalTimeTextOff,
              ]}
            >
              {formatDisplayTime()}
            </Text>
            <Text style={styles.digitalSubtext}>
              {totalCalculatedSeconds > 0
                ? `${minutes > 0 ? `${minutes}m ` : ''}${seconds > 0 ? `${seconds}s` : ''}`
                : 'No rest countdown'}
            </Text>
          </View>

          {/* Quick Presets Carousel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsScroll}
            keyboardShouldPersistTaps="handled"
          >
            {PRESET_TIMERS.map(p => {
              const isActive = totalCalculatedSeconds === p.totalSec;
              return (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.presetChip, isActive && styles.presetChipActive]}
                  onPress={() => selectPreset(p.totalSec)}
                >
                  <Text style={[styles.presetText, isActive && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* The Scrollable Wheel Container */}
          <View style={styles.wheelWrapper}>
            {/* Center Selection Focus Bar */}
            <View style={styles.selectionFocusBar} pointerEvents="none" />

            {/* Column Labels */}
            <View style={styles.columnLabelsRow} pointerEvents="none">
              <Text style={styles.columnLabel}>MINUTES</Text>
              <Text style={styles.columnLabel}>SECONDS</Text>
            </View>

            <View style={styles.wheelsRow}>
              {/* Minutes Wheel */}
              <View style={styles.wheelColumn}>
                <ScrollView
                  ref={minScrollRef}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  onMomentumScrollEnd={handleMinScroll}
                  onScrollEndDrag={handleMinScroll}
                  contentContainerStyle={styles.wheelContent}
                >
                  {MINUTES_LIST.map((m, idx) => {
                    const isFocused = minutes === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={styles.wheelItem}
                        onPress={() => {
                          setMinutes(m);
                          minScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
                          triggerHaptic();
                        }}
                      >
                        <Text
                          style={[styles.wheelItemText, isFocused && styles.wheelItemTextFocused]}
                        >
                          {m} <Text style={styles.wheelItemUnit}>min</Text>
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Colon Divider */}
              <View style={styles.wheelDivider}>
                <Text style={styles.colonText}>:</Text>
              </View>

              {/* Seconds Wheel */}
              <View style={styles.wheelColumn}>
                <ScrollView
                  ref={secScrollRef}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  onMomentumScrollEnd={handleSecScroll}
                  onScrollEndDrag={handleSecScroll}
                  contentContainerStyle={styles.wheelContent}
                >
                  {SECONDS_LIST.map((s, idx) => {
                    const isFocused = seconds === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={styles.wheelItem}
                        onPress={() => {
                          setSeconds(s);
                          secScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
                          triggerHaptic();
                        }}
                      >
                        <Text
                          style={[styles.wheelItemText, isFocused && styles.wheelItemTextFocused]}
                        >
                          {s.toString().padStart(2, '0')} <Text style={styles.wheelItemUnit}>sec</Text>
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>

          {/* Optional: Apply to All Toggle */}
          {showApplyToAll && (
            <TouchableOpacity
              style={styles.applyAllRow}
              onPress={() => setApplyToAll(!applyToAll)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, applyToAll && styles.checkboxActive]}>
                {applyToAll && <Check size={14} color="#000000" strokeWidth={3} />}
              </View>
              <Text style={styles.applyAllText}>
                Apply this rest timer to all exercises in routine
              </Text>
            </TouchableOpacity>
          )}

          {/* Save / Apply Button */}
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Check size={20} color="#000000" strokeWidth={2.5} />
            <Text style={styles.confirmButtonText}>
              {totalCalculatedSeconds === 0 ? 'Disable Rest Timer' : 'Set Rest Time'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#181A20',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: '#262A34',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  exerciseSubtitle: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 2,
    maxWidth: 260,
  },
  displayBanner: {
    backgroundColor: '#132822',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1C4A3F',
    marginBottom: 14,
    gap: 4,
  },
  digitalTimeText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#10B981',
    letterSpacing: 2,
    marginTop: 2,
  },
  digitalTimeTextOff: {
    color: '#9CA3AF',
  },
  digitalSubtext: {
    fontSize: 13,
    color: '#A7F3D0',
    fontWeight: '600',
  },
  presetsScroll: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#262A34',
    borderWidth: 1,
    borderColor: '#374151',
    minHeight: 38,
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#3B82F6',
  },
  presetText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  presetTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  wheelWrapper: {
    height: WHEEL_HEIGHT,
    backgroundColor: '#12141A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#262A34',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 16,
  },
  selectionFocusBar: {
    position: 'absolute',
    top: CENTER_OFFSET,
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    backgroundColor: '#202634',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    zIndex: 1,
  },
  columnLabelsRow: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    zIndex: 2,
  },
  columnLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 1,
  },
  wheelsRow: {
    flexDirection: 'row',
    flex: 1,
    zIndex: 3,
  },
  wheelColumn: {
    flex: 1,
  },
  wheelContent: {
    paddingTop: CENTER_OFFSET,
    paddingBottom: CENTER_OFFSET,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6B7280',
  },
  wheelItemTextFocused: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  wheelItemUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  wheelDivider: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  colonText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4B5563',
  },
  applyAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4B5563',
    backgroundColor: '#1E232E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  applyAllText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  confirmButton: {
    backgroundColor: '#10B981',
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
});
