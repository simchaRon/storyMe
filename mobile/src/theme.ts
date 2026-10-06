import { Platform, ViewStyle } from 'react-native';

// Bedtime Midnight theme. Change colors here only.
export const colors = {
  background: '#0f172a', // deep midnight
  surface: '#1e293b', // slate card
  border: '#334155',
  indigo: '#6366f1',
  amber: '#fbbf24',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  onAccent: '#0f172a', // dark text on amber
  onPrimary: '#ffffff', // light text on indigo (better contrast than dark text)
  danger: '#f87171',
} as const;

export const radius = { card: 16, button: 14, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const fonts = { body: 18, small: 14, title: 28, hero: 36, story: 22 } as const;
/** Line height for story text. Generous spacing is easier to read at bedtime. */
export const storyLineHeight = 36;

/** Min touch target size (px). Keeps buttons easy to tap on phones. */
export const touch = 48;

/** Soft glow around a card or button. Works on iOS, Android and web. */
export function glow(color: string = colors.indigo, strength = 0.35): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0 0 24px ${hexToRgba(color, strength)}` } as ViewStyle,
    default: {
      shadowColor: color,
      shadowOpacity: strength,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
  })!;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
