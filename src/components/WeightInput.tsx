import React, { useState, useEffect, useRef } from 'react';
import { TextInput, StyleProp, TextStyle } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { kgToDisplay, displayToKg } from '../utils/units';

interface Props {
  value: number;
  onCommit: (weightKg: number) => void;
  placeholder?: string;
  completed?: boolean;
  style?: StyleProp<TextStyle>;
}

export const WeightInput: React.FC<Props> = ({
  value,
  onCommit,
  placeholder,
  completed,
  style,
}) => {
  const { unit } = useSettings();
  const [rawText, setRawText] = useState<string | null>(null);
  const prevUnitRef = useRef(unit);

  // When unit changes while an edit is uncommitted, commit using the old unit first
  useEffect(() => {
    if (prevUnitRef.current !== unit) {
      if (rawText !== null) {
        const cleaned = rawText.trim().replace(',', '.');
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
          onCommit(displayToKg(parsed, prevUnitRef.current));
        }
        setRawText(null);
      }
      prevUnitRef.current = unit;
    }
  }, [unit, rawText, onCommit]);

  const displayValue = kgToDisplay(value, unit).toString();
  const shownText = rawText !== null ? rawText : displayValue;

  const handleTextChange = (text: string) => {
    setRawText(text);
    const cleaned = text.trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
      onCommit(displayToKg(parsed, unit));
    }
  };

  const handleCommit = () => {
    if (rawText !== null) {
      const cleaned = rawText.trim().replace(',', '.');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
        onCommit(displayToKg(parsed, unit));
      } else if (cleaned === '') {
        onCommit(0);
      }
      setRawText(null);
    }
  };

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      value={shownText}
      placeholder={placeholder || '0'}
      placeholderTextColor="#6B7280"
      selectTextOnFocus
      onChangeText={handleTextChange}
      onBlur={handleCommit}
      onSubmitEditing={handleCommit}
    />
  );
};
