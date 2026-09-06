import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { calculatePlates } from '../utils/calculator';

interface Props {
  visible: boolean;
  initialWeight?: number;
  onClose: () => void;
  onApply?: (weight: number) => void;
}

export const PlateCalculatorModal: React.FC<Props> = ({
  visible,
  initialWeight = 60,
  onClose,
  onApply,
}) => {
  const [targetWeight, setTargetWeight] = useState(initialWeight.toString());
  const [barWeight, setBarWeight] = useState(20);

  const numWeight = parseFloat(targetWeight) || 0;
  const calc = calculatePlates(numWeight, barWeight);

  const getPlateColor = (weight: number) => {
    switch (weight) {
      case 25:
        return '#DC2626'; // Red
      case 20:
        return '#2563EB'; // Blue
      case 15:
        return '#EAB308'; // Yellow
      case 10:
        return '#16A34A'; // Green
      case 5:
        return '#FFFFFF'; // White
      case 2.5:
        return '#4B5563'; // Gray
      default:
        return '#9333EA'; // Purple
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Plate Calculator</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Input Row */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Weight (Total Barbell Load)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  selectTextOnFocus={true}
                  placeholder="e.g. 100"
                  placeholderTextColor="#6B7280"
                />
                <Text style={styles.unitText}>KG</Text>
              </View>
            </View>

            {/* Bar Weight Selector */}
            <View style={styles.barSelectorGroup}>
              <Text style={styles.label}>Barbell Weight</Text>
              <View style={styles.pillRow}>
                {[20, 15, 10].map(w => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.pill, barWeight === w && styles.pillActive]}
                    onPress={() => setBarWeight(w)}
                  >
                    <Text style={[styles.pillText, barWeight === w && styles.pillTextActive]}>
                      {w} kg {w === 20 ? '(Olympic)' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Results Display */}
            <View style={styles.resultBox}>
              <Text style={styles.resultSummary}>
                Weight per side: <Text style={styles.highlightText}>{calc.weightPerSide} kg</Text>
              </Text>

              {calc.plates.length === 0 ? (
                <Text style={styles.emptyText}>
                  {numWeight <= barWeight
                    ? 'Target weight is equal to or less than bar weight.'
                    : 'No standard plates required.'}
                </Text>
              ) : (
                <View style={styles.platesList}>
                  <Text style={styles.platesSubhead}>Plates each side:</Text>
                  <View style={styles.plateChipsWrap}>
                    {calc.plates.map((p, idx) => (
                      <View
                        key={idx}
                        style={[styles.plateChip, { borderColor: getPlateColor(p.weight) }]}
                      >
                        <View
                          style={[styles.plateColorDot, { backgroundColor: getPlateColor(p.weight) }]}
                        />
                        <Text style={styles.plateText}>
                          {p.count} × {p.weight} kg
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {calc.remainder > 0 && (
                <Text style={styles.remainderText}>
                  ⚠️ Remainder: {calc.remainder.toFixed(2)} kg cannot be loaded with standard plates.
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Action Button */}
          {onApply && (
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                onApply(numWeight);
                onClose();
              }}
            >
              <Check color="#000" size={20} />
              <Text style={styles.applyButtonText}>Set as Workout Weight</Text>
            </TouchableOpacity>
          )}
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 8,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A34',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    height: 48,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  unitText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  barSelectorGroup: {
    marginBottom: 20,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#262A34',
  },
  pillActive: {
    backgroundColor: '#3B82F6',
  },
  pillText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  resultBox: {
    backgroundColor: '#20232B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2F3442',
  },
  resultSummary: {
    fontSize: 16,
    color: '#D1D5DB',
    marginBottom: 12,
  },
  highlightText: {
    color: '#10B981',
    fontWeight: '700',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
  },
  platesList: {
    marginTop: 4,
  },
  platesSubhead: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  plateChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  plateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  plateColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  plateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  remainderText: {
    marginTop: 12,
    fontSize: 12,
    color: '#F59E0B',
  },
  applyButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 4,
  },
  applyButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
