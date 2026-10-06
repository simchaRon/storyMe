import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';

import { colors } from '../theme';

/**
 * DreamTale AI logo: a crescent moon, an audio soundwave and a glowing star.
 * It is drawn in code, so it is sharp at any size and needs no image file.
 */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="DreamTale AI logo">
      <Defs>
        <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.amber} stopOpacity="0.9" />
          <Stop offset="1" stopColor={colors.amber} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* crescent moon */}
      <Path d="M62 18 A36 36 0 1 0 62 82 A34 34 0 0 1 62 18 Z" fill={colors.indigo} />

      {/* soundwave */}
      <G stroke={colors.amber} strokeWidth={5} strokeLinecap="round">
        <Line x1="70" y1="42" x2="70" y2="58" />
        <Line x1="79" y1="34" x2="79" y2="66" />
        <Line x1="88" y1="40" x2="88" y2="60" />
        <Line x1="96" y1="46" x2="96" y2="54" />
      </G>

      {/* glowing star */}
      <Circle cx="82" cy="18" r="14" fill="url(#starGlow)" />
      <Path
        d="M82 8 L84.2 15.8 L92 18 L84.2 20.2 L82 28 L79.8 20.2 L72 18 L79.8 15.8 Z"
        fill={colors.amber}
      />
    </Svg>
  );
}
