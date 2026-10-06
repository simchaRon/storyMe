import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, fonts, glow, radius, spacing, touch } from '../theme';

type Variant = 'primary' | 'accent' | 'secondary' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', disabled, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variants[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color: labelColors[variant] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: { fontSize: fonts.body, fontWeight: '700' },
});

const variants: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.indigo, ...glow(colors.indigo, 0.45) },
  accent: { backgroundColor: colors.amber, ...glow(colors.amber, 0.35) },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
};

const labelColors: Record<Variant, string> = {
  primary: colors.onPrimary,
  accent: colors.onAccent,
  secondary: colors.text,
  danger: colors.danger,
};
