import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, Voice, VoiceCapabilities } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { formatDuration } from '../src/audioFormat';
import { colors, fonts, spacing, touch } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { confirm } from '../src/ui/confirm';
import { RequireAuth } from '../src/ui/RequireAuth';
import { Screen } from '../src/ui/Screen';

export default function VoicesScreen() {
  return (
    <RequireAuth>
      <VoicesContent />
    </RequireAuth>
  );
}

function VoicesContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [caps, setCaps] = useState<VoiceCapabilities | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Load when the screen opens and when the user comes back from adding a voice.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      setError(null);
      Promise.all([api.voiceCapabilities(), api.listVoices()])
        .then(([c, list]) => {
          if (current) {
            setCaps(c);
            setVoices(list);
          }
        })
        .catch((e) => current && setError(errorMessage(t, e)));
      return () => {
        current = false;
      };
    }, [t]),
  );

  async function remove(voice: Voice) {
    const ok = await confirm(t('clone.deleteVoiceTitle'), t('clone.deleteVoiceMessage'), t('settings.confirmDelete'), t('common.cancel'));
    if (!ok) return;
    try {
      await api.deleteVoice(voice.id);
      if (alive.current) setVoices((old) => (old ?? []).filter((v) => v.id !== voice.id));
    } catch (e) {
      if (alive.current) setError(errorMessage(t, e));
    }
  }

  return (
    <Screen back>
      <Text accessibilityRole="header" style={styles.title}>
        {t('clone.manageVoices')}
      </Text>
      <Text style={styles.note}>{t('clone.intro')}</Text>

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!voices && !error && <ActivityIndicator color={colors.amber} />}

      {caps && !caps.enabled && (
        <Card>
          <Text style={styles.note}>{t('clone.notAvailable')}</Text>
        </Card>
      )}

      {voices && (
        <Card style={styles.card}>
          {voices.length === 0 && <Text style={styles.note}>{t('clone.noVoices')}</Text>}
          {voices.map((voice) => (
            <View key={voice.id} style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.name}>{voice.name}</Text>
                <Text style={styles.note}>{formatDuration(voice.duration_seconds)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('clone.deleteVoiceLabel', { name: voice.name })}
                hitSlop={8}
                onPress={() => void remove(voice)}
                style={styles.delete}
              >
                <Text style={styles.deleteText}>{t('settings.confirmDelete')}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {caps?.enabled && <Button label={t('clone.addVoice')} variant="accent" onPress={() => router.push('/voice/new')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: fonts.small },
  error: { color: colors.danger, fontSize: fonts.body },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  delete: { minHeight: touch, minWidth: touch, paddingHorizontal: spacing.sm, justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: colors.danger, fontSize: fonts.small },
});
