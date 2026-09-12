import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlateCalculation } from '../types';
import { WeightUnit } from '../utils/units';
import { PlateVisualSpec, getPlateVisualSpec } from '../workout/barbell';
export type { PlateVisualSpec };
export { getPlateVisualSpec };

interface BarbellSleeveVisualProps {
  calculation?: PlateCalculation;
  unit: WeightUnit;
  compact?: boolean;
}

export const BarbellSleeveVisual: React.FC<BarbellSleeveVisualProps> = ({
  calculation,
  unit,
  compact = false,
}) => {
  if (!calculation) {
    return null;
  }

  const { barWeight, targetWeight, weightPerSide, plates, remainder } = calculation;

  // Flatten plates array: e.g. [{weight: 20, count: 2}] -> [20, 20]
  const individualPlates: number[] = [];
  for (const p of plates) {
    for (let i = 0; i < p.count; i++) {
      individualPlates.push(p.weight);
    }
  }

  const isEmptyBar = individualPlates.length === 0;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Barbell Assembly Visualizer */}
      <View style={styles.barbellWrapper}>
        {/* Shaft */}
        <View style={styles.shaft} />

        {/* Inside Flange Collar (the thick metallic stop) */}
        <View style={styles.flangeCollar}>
          <View style={styles.flangeHighlight} />
        </View>

        {/* Sleeve Tube */}
        <View style={styles.sleeveContainer}>
          <View style={styles.sleeveBar} />

          {/* Loaded Plates */}
          <View style={styles.platesRow}>
            {individualPlates.map((weight, idx) => {
              const spec = getPlateVisualSpec(weight, unit);
              return (
                <View
                  key={`plate-${idx}-${weight}`}
                  style={[
                    styles.plate,
                    {
                      height: compact ? spec.height * 0.75 : spec.height,
                      width: compact ? Math.max(9, spec.width * 0.8) : spec.width,
                      backgroundColor: spec.backgroundColor,
                      borderColor: spec.borderColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.plateLabel,
                      { color: spec.textColor },
                      compact && styles.plateLabelCompact,
                    ]}
                    numberOfLines={1}
                  >
                    {spec.label}
                  </Text>
                </View>
              );
            })}

            {/* Outside Clamp Collar (if plates loaded) */}
            {!isEmptyBar && (
              <View style={[styles.clampCollar, compact && styles.clampCollarCompact]}>
                <View style={styles.clampPin} />
              </View>
            )}

            {/* Empty Bar State Cue */}
            {isEmptyBar && (
              <View style={styles.emptySleeveNotice}>
                <Text style={styles.emptySleeveText}>Empty Bar ({barWeight} {unit})</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Plate Loading Formula Summary */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          <Text style={styles.summaryBold}>
            {barWeight > 0 ? `Bar ${barWeight} ${unit}` : 'Baseline 0'}
          </Text>
          {individualPlates.length > 0 && (
            <>
              {' + 2× ('}
              <Text style={styles.summaryHighlight}>
                {individualPlates.join(' + ')}
              </Text>
              {` ${unit}) = `}
            </>
          )}
          {individualPlates.length === 0 && ' = '}
          <Text style={styles.summaryTotal}>
            {targetWeight} {unit}
          </Text>
        </Text>

        {remainder > 0 && (
          <Text style={styles.remainderNotice}>
            ({remainder.toFixed(1)} {unit} remainder cannot be loaded)
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111319',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242834',
    padding: 12,
    marginVertical: 6,
    alignItems: 'center',
  },
  containerCompact: {
    padding: 8,
    marginVertical: 4,
  },
  barbellWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 84,
    width: '100%',
    justifyContent: 'center',
  },
  shaft: {
    width: 28,
    height: 12,
    backgroundColor: '#64748B',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  flangeCollar: {
    width: 14,
    height: 52,
    backgroundColor: '#94A3B8',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  flangeHighlight: {
    width: 3,
    height: '75%',
    backgroundColor: '#E2E8F0',
    borderRadius: 1,
  },
  sleeveContainer: {
    flex: 1,
    height: 84,
    justifyContent: 'center',
    position: 'relative',
    maxWidth: 260,
  },
  sleeveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#475569',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  platesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 3,
    paddingLeft: 2,
  },
  plate: {
    borderRadius: 3,
    borderWidth: 1.5,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  plateLabel: {
    fontSize: 9,
    fontWeight: '800',
    transform: [{ rotate: '-90deg' }],
    letterSpacing: -0.5,
  },
  plateLabelCompact: {
    fontSize: 7.5,
  },
  clampCollar: {
    width: 8,
    height: 32,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#94A3B8',
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clampCollarCompact: {
    height: 24,
    width: 6,
  },
  clampPin: {
    width: 3,
    height: 10,
    backgroundColor: '#475569',
    borderRadius: 1,
  },
  emptySleeveNotice: {
    paddingLeft: 12,
  },
  emptySleeveText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  summaryRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  summaryBold: {
    fontWeight: '700',
    color: '#E5E7EB',
  },
  summaryHighlight: {
    fontWeight: '800',
    color: '#38BDF8',
  },
  summaryTotal: {
    fontWeight: '800',
    color: '#10B981',
    fontSize: 13,
  },
  remainderNotice: {
    fontSize: 11,
    color: '#F59E0B',
    marginTop: 2,
    fontStyle: 'italic',
  },
});
