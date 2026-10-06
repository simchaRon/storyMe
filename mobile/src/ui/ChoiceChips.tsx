import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, touch } from '../theme';

type Option = { value: number; label: string };

type Props = {
  /** Name for screen readers. */
  accessibilityLabel: string;
  options: Option[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

/** A row of round choices. One is selected. Easy to tap, no typing. */
export function ChoiceChips({ accessibilityLabel, options, value, onChange, disabled }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: touch,
    minHeight: touch,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  label: { color: colors.text, fontSize: fonts.body },
  labelSelected: { color: colors.onPrimary, fontWeight: '700' },
});
