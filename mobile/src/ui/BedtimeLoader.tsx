import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';
import { Button } from './Button';
import { Logo } from './Logo';

const MESSAGES = ['create.loading1', 'create.loading2', 'create.loading3'];

/**
 * A calm, slow animation while a story is being written. The logo "breathes" and the text changes.
 * With `onCancel`, a button lets the user stop waiting.
 */
export function BedtimeLoader({ onCancel }: { onCancel?: () => void }) {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 4000);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <View style={styles.wrap}>
      {/* One accessible block for the screen reader. The cancel button stays outside it. */}
      <View
        style={styles.info}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${t(MESSAGES[index])} ${t('create.loadingNote')}`}
      >
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <Logo size={140} />
        </Animated.View>
        <Text style={styles.message}>{t(MESSAGES[index])}</Text>
        <Text style={styles.note}>{t('create.loadingNote')}</Text>
      </View>

      {onCancel && (
        <View style={styles.cancel}>
          <Button label={t('create.cancel')} variant="secondary" onPress={onCancel} />
          <Text style={styles.note}>{t('create.cancelNote')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  info: { alignItems: 'center', gap: spacing.md },
  message: { color: colors.amber, fontSize: fonts.title, textAlign: 'center' },
  note: { color: colors.textMuted, fontSize: fonts.small, textAlign: 'center' },
  cancel: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
});
