import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { createDebouncer } from '../utils/debounce';

/** Long enough to absorb typing bursts, short enough to feel committed. */
const NOTE_COMMIT_DEBOUNCE_MS = 250;

interface ExerciseNoteInputProps {
  exerciseId: string;
  notes?: string;
  onCommit: (exerciseId: string, notes: string) => void;
  style?: TextInputProps['style'];
  placeholder?: string;
  placeholderTextColor?: string;
  autoFocus?: boolean;
  onFocus?: TextInputProps['onFocus'];
  accessibilityLabel?: string;
}

/**
 * Keeps note text in local state and commits it to the workout session on a
 * short debounce, flushing on blur, exercise change, or unmount. Keystrokes
 * therefore never trigger a session update or an autosave serialization.
 */
export const ExerciseNoteInput = React.memo(function ExerciseNoteInput({
  exerciseId,
  notes,
  onCommit,
  style,
  placeholder,
  placeholderTextColor,
  autoFocus,
  onFocus,
  accessibilityLabel,
}: ExerciseNoteInputProps) {
  const [text, setText] = useState(notes ?? '');

  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const exerciseIdRef = useRef(exerciseId);
  useEffect(() => {
    exerciseIdRef.current = exerciseId;
  }, [exerciseId]);

  const debouncer = useMemo(
    () =>
      createDebouncer<string>(NOTE_COMMIT_DEBOUNCE_MS, value =>
        onCommitRef.current(exerciseIdRef.current, value),
      ),
    [],
  );

  // Flush the latest text before the exercise changes or the input unmounts.
  useEffect(() => () => debouncer.flushNow(), [debouncer, exerciseId]);

  // Adopt external updates (e.g. the workout was reloaded from a draft).
  useEffect(() => {
    setText(prev => (prev === (notes ?? '') ? prev : (notes ?? '')));
  }, [notes]);

  const handleChangeText = (value: string) => {
    setText(value);
    debouncer.schedule(value);
  };

  return (
    <TextInput
      style={style}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      value={text}
      onChangeText={handleChangeText}
      onBlur={() => debouncer.flushNow()}
      onFocus={onFocus}
      autoFocus={autoFocus}
      accessibilityLabel={accessibilityLabel ?? 'Exercise note'}
      accessibilityValue={{ text: text === '' ? 'empty' : text }}
    />
  );
});
