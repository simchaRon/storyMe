import Slider from '@react-native-community/slider';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { api, Lang, UserSettings } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { useAuth } from '../src/auth/AuthContext';
import { colors, fonts, spacing } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { confirm } from '../src/ui/confirm';
import { LanguageSwitch } from '../src/ui/LanguageSwitch';
import { RequireAuth } from '../src/ui/RequireAuth';
import { Screen } from '../src/ui/Screen';

const LEVEL_KEYS = ['settings.level1', 'settings.level2', 'settings.level3', 'settings.level4', 'settings.level5'];

type SaveState = 'idle' | 'saving' | 'saved';

export default function SettingsScreen() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}

function SettingsContent() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [level, setLevel] = useState(2); // follows the slider while dragging
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [voiceError, setVoiceError] = useState(false);
  const settingsRef = useRef<UserSettings | null>(null);

  const apply = useCallback((s: UserSettings) => {
    settingsRef.current = s;
    setSettings(s);
    setLevel(s.default_educational_level);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      apply(await api.getSettings());
    } catch (e) {
      setError(errorMessage(t, e));
    }
  }, [apply, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stop any speech when the screen closes.
  useEffect(() => () => void Speech.stop(), []);

  /** Save one change. If the server says no, go back to the last saved values. */
  async function save(changes: Partial<UserSettings>) {
    const before = settingsRef.current;
    if (!before) return;
    setError(null);
    setSaveState('saving');
    apply({ ...before, ...changes }); // show the change at once
    try {
      apply(await api.updateSettings(changes));
      setSaveState('saved');
    } catch (e) {
      apply(before);
      setSaveState('idle');
      setError(errorMessage(t, e));
    }
  }

  function testVoice() {
    setVoiceError(false);
    try {
      void Speech.stop();
      Speech.speak(t('settings.voiceSample'), {
        language: i18n.language === 'he' ? 'he-IL' : 'en-US',
        onError: () => setVoiceError(true),
      });
    } catch {
      setVoiceError(true);
    }
  }

  async function deleteAccount() {
    const ok = await confirm(
      t('settings.deleteTitle'),
      t('settings.deleteMessage'),
      t('settings.confirmDelete'),
      t('common.cancel'),
    );
    if (!ok) return;
    try {
      await api.deleteAccount();
      await signOut();
    } catch (e) {
      setError(errorMessage(t, e));
    }
  }

  return (
    <Screen back>
      <Text accessibilityRole="header" style={styles.title}>
        {t('settings.title')}
      </Text>

      {error && (
        <Card style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          {!settings && <Button label={t('errors.retry')} onPress={() => void load()} />}
        </Card>
      )}

      {!settings && !error && <ActivityIndicator color={colors.amber} />}

      {settings && (
        <>
          <Card>
            <LanguageSwitch onChange={(lang: Lang) => void save({ preferred_language: lang })} />
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('settings.level')}</Text>
            <Slider
              minimumValue={1}
              maximumValue={5}
              step={1}
              value={level}
              onValueChange={setLevel}
              onSlidingComplete={(v) => void save({ default_educational_level: Math.round(v) })}
              minimumTrackTintColor={colors.indigo}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.amber}
              accessibilityLabel={t('settings.level')}
              accessibilityValue={{ min: 1, max: 5, now: level, text: t(LEVEL_KEYS[level - 1]) }}
            />
            <Text style={styles.levelText}>
              {level} / 5 · {t(LEVEL_KEYS[level - 1])}
            </Text>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('settings.voice')}</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.voiceEnabled')}</Text>
              <Switch
                value={settings.voice_enabled}
                onValueChange={(v) => void save({ voice_enabled: v })}
                trackColor={{ false: colors.border, true: colors.indigo }}
                thumbColor={colors.amber}
                accessibilityLabel={t('settings.voiceEnabled')}
              />
            </View>
            <Button label={t('settings.voiceTest')} variant="secondary" onPress={testVoice} />
            {voiceError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t('settings.voiceError')}
              </Text>
            )}
            <Text style={styles.note}>{t('settings.voiceNote')}</Text>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('settings.profile')}</Text>
            <Text style={styles.note}>
              {t('settings.signedInAs')} {user?.email}
            </Text>
            <Button label={t('settings.logout')} variant="secondary" onPress={() => void signOut()} />
            <Button label={t('settings.deleteAccount')} variant="danger" onPress={() => void deleteAccount()} />
          </Card>

          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {saveState === 'saving' ? t('settings.saving') : saveState === 'saved' ? t('settings.saved') : ' '}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  card: { gap: spacing.md },
  errorCard: { gap: spacing.md },
  section: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  levelText: { color: colors.amber, fontSize: fonts.body },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.text, fontSize: fonts.body, flexShrink: 1 },
  note: { color: colors.textMuted, fontSize: fonts.small },
  error: { color: colors.danger, fontSize: fonts.body },
  status: { color: colors.textMuted, fontSize: fonts.small, textAlign: 'center' },
});
