import { WeightUnit } from '../utils/units';

export interface PlateVisualSpec {
  weight: number;
  height: number;
  width: number;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  label: string;
}

/**
 * Returns color, size, and label specifications for Olympic bumper and change plates.
 * Follows standard IPF / IWF color conventions:
 * 25kg / 55lb = Red
 * 20kg / 45lb = Blue
 * 15kg / 35lb = Yellow
 * 10kg / 25lb = Green
 * 5kg / 10lb = White / Grey
 * 2.5kg / 5lb = Black
 * 1.25kg / 2.5lb = Silver / Slate
 */
export function getPlateVisualSpec(weight: number, unit: WeightUnit): PlateVisualSpec {
  if (unit === 'lb') {
    switch (weight) {
      case 55:
        return { weight, height: 72, width: 18, backgroundColor: '#DC2626', borderColor: '#991B1B', textColor: '#FFFFFF', label: '55' };
      case 45:
        return { weight, height: 72, width: 17, backgroundColor: '#2563EB', borderColor: '#1D4ED8', textColor: '#FFFFFF', label: '45' };
      case 35:
        return { weight, height: 64, width: 15, backgroundColor: '#EAB308', borderColor: '#CA8A04', textColor: '#000000', label: '35' };
      case 25:
        return { weight, height: 56, width: 14, backgroundColor: '#16A34A', borderColor: '#15803D', textColor: '#FFFFFF', label: '25' };
      case 15:
        return { weight, height: 48, width: 12, backgroundColor: '#EA580C', borderColor: '#C2410C', textColor: '#FFFFFF', label: '15' };
      case 10:
        return { weight, height: 42, width: 12, backgroundColor: '#1F2937', borderColor: '#4B5563', textColor: '#FFFFFF', label: '10' };
      case 5:
        return { weight, height: 36, width: 10, backgroundColor: '#F3F4F6', borderColor: '#9CA3AF', textColor: '#111827', label: '5' };
      case 2.5:
        return { weight, height: 30, width: 9, backgroundColor: '#94A3B8', borderColor: '#64748B', textColor: '#0F172A', label: '2.5' };
      default:
        return { weight, height: 28, width: 8, backgroundColor: '#7C3AED', borderColor: '#6D28D9', textColor: '#FFFFFF', label: String(weight) };
    }
  }

  // Metric KG plates
  switch (weight) {
    case 25:
      return { weight, height: 72, width: 18, backgroundColor: '#DC2626', borderColor: '#991B1B', textColor: '#FFFFFF', label: '25' };
    case 20:
      return { weight, height: 72, width: 17, backgroundColor: '#2563EB', borderColor: '#1D4ED8', textColor: '#FFFFFF', label: '20' };
    case 15:
      return { weight, height: 64, width: 15, backgroundColor: '#EAB308', borderColor: '#CA8A04', textColor: '#000000', label: '15' };
    case 10:
      return { weight, height: 56, width: 14, backgroundColor: '#16A34A', borderColor: '#15803D', textColor: '#FFFFFF', label: '10' };
    case 5:
      return { weight, height: 46, width: 12, backgroundColor: '#F3F4F6', borderColor: '#9CA3AF', textColor: '#111827', label: '5' };
    case 2.5:
      return { weight, height: 38, width: 10, backgroundColor: '#1F2937', borderColor: '#4B5563', textColor: '#FFFFFF', label: '2.5' };
    case 1.25:
      return { weight, height: 30, width: 9, backgroundColor: '#94A3B8', borderColor: '#64748B', textColor: '#0F172A', label: '1.2' };
    default:
      return { weight, height: 28, width: 8, backgroundColor: '#7C3AED', borderColor: '#6D28D9', textColor: '#FFFFFF', label: String(weight) };
  }
}
