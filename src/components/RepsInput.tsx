import React, { useState, useEffect, useRef } from 'react';
import { TextInput, StyleProp, TextStyle } from 'react-native';
import { sanitizeRepsInput } from '../workout/sets';

interface Props {
  value: number;
  onCommit: (reps: number) => void;
  placeholder?: string;
  completed?: boolean;
  style?: StyleProp<TextStyle>;
  selectTextOnFocus?: boolean;
}

export const RepsInput: React.FC<Props> = ({
  value,
  onCommit,
  placeholder,
  completed,
  style,
  selectTextOnFocus = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCommitRef = useRef(onCommit);
  latestCommitRef.current = onCommit;

  const displayValue = value > 0 ? value.toString() : '';

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const commitReps = (text: string) => {
    const cleaned = sanitizeRepsInput(text).trim();
    if (cleaned === '') {
      latestCommitRef.current(0);
      return;
    }
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
      latestCommitRef.current(parsed);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setLocalText(displayValue);
  };

  const handleTextChange = (text: string) => {
    const sanitized = sanitizeRepsInput(text);
    setLocalText(sanitized);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the commit during typing to prevent keystroke lag / cursor jumping
    debounceTimerRef.current = setTimeout(() => {
      commitReps(sanitized);
    }, 250);
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsFocused(false);
    commitReps(localText);
  };

  const shownText = isFocused ? localText : displayValue;

  return (
    <TextInput
      style={style}
      keyboardType="number-pad"
      returnKeyType="done"
      value={shownText}
      placeholder={placeholder !== undefined ? placeholder : '-'}
      placeholderTextColor="#6B7280"
      selectTextOnFocus={selectTextOnFocus}
      onFocus={handleFocus}
      onChangeText={handleTextChange}
      onBlur={handleBlur}
      onSubmitEditing={handleBlur}
    />
  );
};

