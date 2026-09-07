import React, { useState, useEffect } from 'react';
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
import { calculatePlates, KG_PLATES, LB_PLATES } from '../utils/calculator';
import { useSettings } from '../context/SettingsContext';
import { kgToDisplay, displayToKg, WeightUnit } from '../utils/units';

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
  const { unit } = useSettings();
  const [modalUnit, setModalUnit] = useState<WeightUnit>(unit);
  const [targetWeight, setTargetWeight] = useState(
    unit === 'lb' ? kgToDisplay(initialWeight, 'lb').toString() : initialWeight.toString()
  );
  const [barWeight, setBarWeight] = useState(unit === 'lb' ? 45 : 20);

  useEffect(() => {
    if (visible) {
      setModalUnit(unit);
      const displayInit = unit === 'lb' ? kgToDisplay(initialWeight, 'lb') : initialWeight;
      setTargetWeight(displayInit.toString());
      setBarWeight(unit === 'lb' ? 45 : 20);
    }
  }, [visible, initialWeight, unit]);

  const handleUnitToggle = (newUnit: WeightUnit) => {
    if (newUnit === modalUnit) return;
    const currentNum = parseFloat(targetWeight);
    if (!isNaN(currentNum) && currentNum > 0) {
      const kgVal = displayToKg(currentNum, modalUnit);
      const converted = kgToDisplay(kgVal, newUnit);
      setTargetWeight(converted.toString());
    }
    setModalUnit(newUnit);
    setBarWeight(newUnit === 'lb' ? 45 : 20);
  };

  const KG_BARS = [20, 15, 10];
  const LB_BARS = [45, 35, 15];
  const bars = modalUnit === 'kg' ? KG_BARS : LB_BARS;
  const plates = modalUnit === 'kg' ? KG_PLATES : LB_PLATES;

  const numWeight = parseFloat(targetWeight) || 0;
  const calc = calculatePlates(numWeight, barWeight, plates);

  const getPlateColor = (weight: number) => {
    if (modalUnit === 'lb') {
      switch (weight) {
        case 45:
          return '#DC2626'; // Red
        case 35:
          return '#EAB308'; // Yellow
        case 25:
          return '#2563EB'; // Blue
        case 10:
          return '#16A34A'; // Green
        case 5:
          return '#FFFFFF'; // White
        case 2.5:
          return '#4B5563'; // Gray
        default:
          return '#9333EA'; // Purple
      }
    }
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
              <View style={styles.inputHeaderRow}>
                <Text style={styles.label}>Target Weight (Total Barbell Load)</Text>
                <View style={styles.unitToggleGroup}>
                  <TouchableOpacity
                    style={[styles.unitToggleBtn, modalUnit === 'kg' && styles.unitToggleBtnActive]}
                    onPress={() => handleUnitToggle('kg')}
                    accessibilityRole="button"
                    accessibilityLabel="Kilograms"
                    accessibilityState={{ selected: modalUnit === 'kg' }}
                  >
                    <Text
                      style={[
                        styles.unitToggleText,
                        modalUnit === 'kg' && styles.unitToggleTextActive,
                      ]}
                    >
                      KG
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitToggleBtn, modalUnit === 'lb' && styles.unitToggleBtnActive]}
                    onPress={() => handleUnitToggle('lb')}
                    accessibilityRole="button"
                    accessibilityLabel="Pounds"
                    accessibilityState={{ selected: modalUnit === 'lb' }}
                  >
                    <Text
                      style={[
                        styles.unitToggleText,
                        modalUnit === 'lb' && styles.unitToggleTextActive,
                      ]}
                    >
                      LB
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                <Text style={styles.unitText}>{modalUnit.toUpperCase()}</Text>
              </View>
            </View>

            {/* Bar Weight Selector */}
            <View style={styles.barSelectorGroup}>
              <Text style={styles.label}>Barbell Weight</Text>
              <View style={styles.pillRow}>
                {bars.map(w => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.pill, barWeight === w && styles.pillActive]}
                    onPress={() => setBarWeight(w)}
                  >
                    <Text style={[styles.pillText, barWeight === w && styles.pillTextActive]}>
                      {w} {modalUnit} {modalUnit === 'kg' && w === 20 ? '(Olympic)' : modalUnit === 'lb' && w === 45 ? '(Olympic)' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Results Display */}
            <View style={styles.resultBox}>
              <Text style={styles.resultSummary}>
                Weight per side: <Text style={styles.highlightText}>{calc.weightPerSide} {modalUnit}</Text>
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
                          {p.count} × {p.weight} {modalUnit}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {calc.remainder > 0 && (
                <Text style={styles.remainderText}>
                  Note: Remainder: {calc.remainder.toFixed(2)} {modalUnit} cannot be loaded with standard plates.
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Action Button */}
          {onApply && (
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                onApply(displayToKg(numWeight, modalUnit));
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
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#262A34',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#374151',
  },
  unitToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unitToggleBtnActive: {
    backgroundColor: '#3B82F6',
  },
  unitToggleText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  unitToggleTextActive: {
    color: '#FFFFFF',
  },
  label: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A34',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 54,
  },
  input: {
    flex: 1,
    height: 54,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  unitText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '700',
  },
  barSelectorGroup: {
    marginBottom: 20,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#262A34',
  },
  pillActive: {
    backgroundColor: '#3B82F6',
  },
  pillText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    gap: 8,
  },
  plateColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  plateText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  remainderText: {
    marginTop: 12,
    fontSize: 13,
    color: '#F59E0B',
  },
  applyButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
    marginTop: 6,
  },
  applyButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
