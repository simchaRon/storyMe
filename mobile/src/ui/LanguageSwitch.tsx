import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { restartApp, LANGUAGES, Lang } from '../i18n/direction';
import { setLanguage } from '../i18n';
import { colors, fonts, radius, spacing, touch } from '../theme';
import { Button } from './Button';

/**
 * English / עברית toggle. Changing it also flips the layout between LTR and RTL.
 * `onChange` runs after the language changed (use it to save the choice on the server).
 */
export function LanguageSwitch({ onChange }: { onChange?: (lang: Lang) => void }) {
  const { t, i18n } = useTranslation();
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [restartFailed, setRestartFailed] = useState(false);

  async function choose(lang: Lang) {
    if (lang === i18n.language) return;
    const result = await setLanguage(lang);
    setRestartNeeded(result.restartNeeded);
    setRestartFailed(false);
    onChange?.(lang);
  }

  async function restart() {
    if (!(await restartApp())) setRestartFailed(true);
  }

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      <Text style={styles.title}>{t('common.language')}</Text>
      <View style={styles.row}>
        {LANGUAGES.map(({ code, label }) => {
          const selected = i18n.language === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityLanguage={code}
              accessibilityState={{ checked: selected }}
              onPress={() => void choose(code)}
              style={[styles.option, selected && styles.selected]}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {restartNeeded && (
        <View style={styles.restart}>
          <Text style={styles.note}>{t(restartFailed ? 'language.restartManually' : 'language.restartNeeded')}</Text>
          {!restartFailed && <Button label={t('language.restartNow')} variant="accent" onPress={() => void restart()} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { color: colors.textMuted, fontSize: fonts.small },
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    minHeight: touch,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  label: { color: colors.text, fontSize: fonts.body },
  labelSelected: { color: colors.onPrimary, fontWeight: '700' },
  restart: { gap: spacing.sm },
  note: { color: colors.amber, fontSize: fonts.small },
});
