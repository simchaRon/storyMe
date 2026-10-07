import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { restartApp, LANGUAGES } from '../i18n/direction';
import { setLanguage } from '../i18n';
import { colors, fonts, radius, spacing, touch } from '../theme';
import { Button } from './Button';

/**
 * One tap switches between English and עברית. The state lives here so the top bar can show the button
 * and, on a phone, a restart note under the bar (the text direction needs a restart there).
 * When the user is signed in the choice is saved on the server too.
 */
export function useLanguageToggle() {
  const { i18n } = useTranslation();
  const { status } = useAuth();
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [restartFailed, setRestartFailed] = useState(false);

  const other = LANGUAGES.find((l) => l.code !== i18n.language) ?? LANGUAGES[0];

  async function toggle() {
    const result = await setLanguage(other.code);
    setRestartNeeded(result.restartNeeded);
    setRestartFailed(false);
    if (status === 'signedIn') {
      try {
        await api.updateSettings({ preferred_language: other.code });
      } catch {
        /* the language still changed on this device. The saved choice is updated next time */
      }
    }
  }

  async function restart() {
    if (!(await restartApp())) setRestartFailed(true);
  }

  return { other, toggle, restartNeeded, restartFailed, restart };
}

type Toggle = ReturnType<typeof useLanguageToggle>;

/** The button. It shows the name of the OTHER language. */
export function LanguageButton({ toggle }: { toggle: Toggle }) {
  const { t } = useTranslation();
  const { other } = toggle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('language.switchLabel', { name: other.label })}
      accessibilityLanguage={other.code}
      onPress={() => void toggle.toggle()}
      style={styles.button}
    >
      <Text style={styles.text}>{other.label}</Text>
    </Pressable>
  );
}

/** Shown under the top bar after a switch on a phone. */
export function RestartNote({ toggle }: { toggle: Toggle }) {
  const { t } = useTranslation();
  if (!toggle.restartNeeded) return null;
  return (
    <View style={styles.restart}>
      <Text style={styles.note}>{t(toggle.restartFailed ? 'language.restartManually' : 'language.restartNeeded')}</Text>
      {!toggle.restartFailed && <Button label={t('language.restartNow')} variant="accent" onPress={() => void toggle.restart()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touch,
    minWidth: touch,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.text, fontSize: fonts.body },
  restart: { gap: spacing.sm },
  note: { color: colors.amber, fontSize: fonts.small },
});
