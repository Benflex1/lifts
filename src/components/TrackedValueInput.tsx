import React, { useEffect, useRef, useState } from 'react';
import { KeyboardTypeOptions, StyleProp, TextInput, TextStyle } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { sanitizeWeightInput } from '../workout/sets';
import {
  displayToMeters,
  distanceUnitFor,
  formatSetDuration,
  metersToDisplay,
  parseSetDuration,
  sanitizeDurationInput,
} from '../workout/tracking';
import { colors } from '../theme';

interface BaseProps {
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  onFocus?: (e: any, inputRef?: React.RefObject<TextInput | null>) => void;
  accessibilityLabel?: string;
}

interface Props extends BaseProps {
  format: (value: number) => string;
  parse: (text: string) => number | undefined;
  sanitize: (text: string) => string;
  keyboardType: KeyboardTypeOptions;
}

/** A set input for values that are typed in one form and stored in another, like time and distance. */
const TrackedValueInput: React.FC<Props> = ({
  value,
  onCommit,
  placeholder,
  style,
  onFocus,
  accessibilityLabel,
  format,
  parse,
  sanitize,
  keyboardType,
}) => {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCommitRef = useRef(onCommit);
  latestCommitRef.current = onCommit;

  const displayValue = value !== undefined && value > 0 ? format(value) : '';

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const commit = (text: string) => {
    const cleaned = sanitize(text).trim();
    if (cleaned === '') {
      latestCommitRef.current(undefined);
      return;
    }
    const parsed = parse(cleaned);
    if (parsed !== undefined && Number.isFinite(parsed) && parsed >= 0) latestCommitRef.current(parsed);
  };

  const handleFocus = (e: any) => {
    setIsFocused(true);
    setLocalText(displayValue);
    onFocus?.(e, inputRef);
  };

  const handleTextChange = (text: string) => {
    const sanitized = sanitize(text);
    setLocalText(sanitized);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => commit(sanitized), 250);
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsFocused(false);
    commit(localText);
  };

  return (
    <TextInput
      ref={inputRef}
      style={style}
      keyboardType={keyboardType}
      returnKeyType="done"
      value={isFocused ? localText : displayValue}
      placeholder={placeholder !== undefined ? placeholder : '-'}
      placeholderTextColor={colors.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      accessibilityLabel={accessibilityLabel}
      onFocus={handleFocus}
      onChangeText={handleTextChange}
      onBlur={handleBlur}
      onSubmitEditing={handleBlur}
    />
  );
};

/** Time typed as "45", "1:30" or "1:02:05", stored in seconds. */
export const DurationInput: React.FC<BaseProps> = (props) => (
  <TrackedValueInput
    {...props}
    format={formatSetDuration}
    parse={parseSetDuration}
    sanitize={sanitizeDurationInput}
    keyboardType="numbers-and-punctuation"
  />
);

/** Distance typed in km or miles (following the weight unit), stored in metres. */
export const DistanceInput: React.FC<BaseProps> = (props) => {
  const { unit } = useSettings();
  const distanceUnit = distanceUnitFor(unit);
  return (
    <TrackedValueInput
      {...props}
      format={(meters) => metersToDisplay(meters, distanceUnit).toString()}
      parse={(text) => {
        const parsed = parseFloat(text);
        return Number.isNaN(parsed) ? undefined : displayToMeters(parsed, distanceUnit);
      }}
      sanitize={sanitizeWeightInput}
      keyboardType="decimal-pad"
    />
  );
};
