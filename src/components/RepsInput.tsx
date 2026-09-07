import React, { useState, useRef, useEffect } from 'react';
import { TextInput, StyleProp, TextStyle } from 'react-native';

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
  const [rawText, setRawText] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCommitRef = useRef(onCommit);
  latestCommitRef.current = onCommit;

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const displayValue = value > 0 ? value.toString() : '';
  const shownText = rawText !== null ? rawText : displayValue;

  const handleTextChange = (text: string) => {
    // Immediate local text state — responsive in ~0ms, allows empty string while editing
    setRawText(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const cleaned = text.trim();
    if (cleaned === '') {
      debounceTimerRef.current = setTimeout(() => {
        latestCommitRef.current(0);
      }, 300);
      return;
    }

    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      debounceTimerRef.current = setTimeout(() => {
        latestCommitRef.current(parsed);
      }, 80);
    }
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (rawText !== null) {
      const cleaned = rawText.trim();
      const parsed = parseInt(cleaned, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        latestCommitRef.current(parsed);
      } else {
        latestCommitRef.current(0);
      }
      setRawText(null);
    }
  };

  return (
    <TextInput
      style={style}
      keyboardType="number-pad"
      value={shownText}
      placeholder={placeholder}
      placeholderTextColor="#6B7280"
      selectTextOnFocus={selectTextOnFocus}
      onChangeText={handleTextChange}
      onBlur={handleBlur}
    />
  );
};
