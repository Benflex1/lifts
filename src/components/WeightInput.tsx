import React, { useState, useEffect } from 'react';
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

  const displayValue = value > 0 ? kgToDisplay(value, unit).toString() : '';
  const shownText = rawText !== null ? rawText : displayValue;

  useEffect(() => {
    setRawText(null);
  }, [value, unit]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      value={shownText}
      placeholder={placeholder || (unit === 'kg' ? '0' : '0')}
      placeholderTextColor="#6B7280"
      selectTextOnFocus
      onChangeText={setRawText}
      onBlur={() => {
        const parsed = rawText !== null ? (parseFloat(rawText) || 0) : value > 0 ? kgToDisplay(value, unit) : 0;
        onCommit(displayToKg(parsed, unit));
        setRawText(null);
      }}
      onSubmitEditing={() => {
        const parsed = rawText !== null ? (parseFloat(rawText) || 0) : value > 0 ? kgToDisplay(value, unit) : 0;
        onCommit(displayToKg(parsed, unit));
        setRawText(null);
      }}
    />
  );
};
