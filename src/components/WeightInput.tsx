import React, { useState, useEffect, useRef } from 'react';
import { TextInput, StyleProp, TextStyle } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { kgToDisplay, displayToKg } from '../utils/units';
import { sanitizeWeightInput } from '../workout/sets';

interface Props {
  value: number;
  isEdited?: boolean;
  onCommit: (weightKg: number, isEdited?: boolean) => void;
  placeholder?: string;
  completed?: boolean;
  style?: StyleProp<TextStyle>;
}

export const WeightInput: React.FC<Props> = ({
  value,
  isEdited,
  onCommit,
  placeholder,
  completed,
  style,
}) => {
  const { unit } = useSettings();
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCommitRef = useRef(onCommit);
  latestCommitRef.current = onCommit;
  const latestUnitRef = useRef(unit);
  latestUnitRef.current = unit;
  const prevUnitRef = useRef(unit);

  const effectiveEdited = completed || (isEdited !== undefined ? isEdited : value > 0);
  const displayValue = effectiveEdited ? kgToDisplay(value, unit).toString() : '';

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // When unit changes while editing, commit using the old unit first
  useEffect(() => {
    if (prevUnitRef.current !== unit) {
      if (isFocused && localText !== '') {
        const cleaned = sanitizeWeightInput(localText).trim();
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
          latestCommitRef.current(displayToKg(parsed, prevUnitRef.current), true);
        }
      }
      prevUnitRef.current = unit;
    }
  }, [unit, isFocused, localText]);

  const commitWeight = (text: string) => {
    const cleaned = sanitizeWeightInput(text).trim();
    if (cleaned === '' || cleaned === '.') {
      latestCommitRef.current(0, false);
      return;
    }
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
      latestCommitRef.current(displayToKg(parsed, latestUnitRef.current), true);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setLocalText(displayValue);
  };

  const handleTextChange = (text: string) => {
    const sanitized = sanitizeWeightInput(text);
    setLocalText(sanitized);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the commit during typing so rapid inputs don't cause parent re-render lag or cursor jumps
    debounceTimerRef.current = setTimeout(() => {
      commitWeight(sanitized);
    }, 250);
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsFocused(false);
    commitWeight(localText);
  };

  const shownText = isFocused ? localText : displayValue;

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      returnKeyType="done"
      value={shownText}
      placeholder={placeholder !== undefined ? placeholder : '-'}
      placeholderTextColor="#6B7280"
      selectTextOnFocus
      onFocus={handleFocus}
      onChangeText={handleTextChange}
      onBlur={handleBlur}
      onSubmitEditing={handleBlur}
    />
  );
};
