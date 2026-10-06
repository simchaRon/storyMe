import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addMany, MAX_KEYWORDS, splitKeywords } from '../keywords';
import { colors, fonts, radius, spacing, touch } from '../theme';
import { Button } from './Button';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** The text being typed. It lives in the parent, so it is not lost when the screen changes. */
  text: string;
  onTextChange: (next: string) => void;
  disabled?: boolean;
};

/** Type an idea and press Add (or Enter, or a comma). Each idea becomes a tag. Tap a tag to remove it. */
export function TagInput({ value, onChange, text, onTextChange, disabled }: Props) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);

  /** Add every piece of `raw`. Pieces that cannot be used stay in the box, so nothing is lost. */
  function commit(raw: string) {
    const result = addMany(value, raw);
    if (result.list !== value) onChange(result.list);
    onTextChange(result.rest);
    setProblem(result.problem ? t(result.problem === 'full' ? 'create.keywordsFull' : 'create.keywordInvalid') : null);
  }

  function onChangeText(next: string) {
    // A comma or a new line finishes the current idea (also when a list is pasted).
    if (splitKeywords(next).length > 1) commit(next);
    else onTextChange(next);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          onSubmitEditing={() => commit(text)}
          editable={!disabled}
          returnKeyType="done"
          submitBehavior="submit"
          placeholder={t('create.keywordPlaceholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('create.keywords')}
        />
        <Button label={t('create.add')} variant="secondary" disabled={disabled} onPress={() => commit(text)} />
      </View>

      {problem && (
        <Text accessibilityRole="alert" style={styles.problem}>
          {problem}
        </Text>
      )}

      <View style={styles.tags}>
        {value.map((word) => (
          <Pressable
            key={word}
            accessibilityRole="button"
            accessibilityLabel={t('create.removeKeyword', { word })}
            disabled={disabled}
            onPress={() => onChange(value.filter((k) => k !== word))}
            style={styles.tag}
          >
            <Text style={styles.tagText}>{word}</Text>
            <Text style={styles.tagX} importantForAccessibility="no" accessibilityElementsHidden>
              ×
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.count}>
        {value.length} / {MAX_KEYWORDS}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  input: {
    flex: 1,
    minHeight: touch,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: fonts.body,
    paddingHorizontal: spacing.md,
  },
  problem: { color: colors.danger, fontSize: fonts.small },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.indigo,
  },
  tagText: { color: colors.onPrimary, fontSize: fonts.body },
  tagX: { color: colors.onPrimary, fontSize: fonts.body, fontWeight: '700' },
  count: { color: colors.textMuted, fontSize: fonts.small },
});
