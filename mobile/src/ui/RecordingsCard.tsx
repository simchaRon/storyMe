import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, Recording } from '../api/client';
import { errorMessage } from '../api/errorMessage';
import { formatDuration } from '../audioFormat';
import { colors, fonts, spacing, touch } from '../theme';
import { Playback } from '../useAudioPlayback';
import { Button } from './Button';
import { Card } from './Card';
import { confirm } from './confirm';

type Props = {
  storyId: number;
  /** The one audio player of the story screen. */
  playback: Playback;
  /** Called when a recording is about to play, so the device voice can be stopped. */
  onPlayStart: () => void;
  /** Shown when the player could not start. Changes each time it happens. */
  failedToken: number;
  /** The device voice (automatic reader). When given, it is shown as the first row of the card. */
  autoReader?: { speaking: boolean; onToggle: () => void };
};

/** The recordings of one story (people reading it aloud), with play, delete and "record your voice". */
export function RecordingsCard({ storyId, playback, onPlayStart, failedToken, autoReader }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const loading = useRef(false); // blocks a second tap while the address is being fetched

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (failedToken > 0) setError(t('story.playFailed'));
  }, [failedToken, t]);

  // Load the list when the screen opens and when the user comes back from the record screen.
  // When the screen loses focus (for example the record screen opens), playback stops, so the
  // earlier recording is not caught by the microphone.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      api
        .listRecordings(storyId)
        .then((list) => current && setRecordings(list))
        .catch(() => {}); // the list is a bonus. The story still works without it
      return () => {
        current = false;
        playback.stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storyId]),
  );

  async function toggle(rec: Recording) {
    const key = `rec:${rec.id}`;
    if (loading.current) return;
    if (playback.playingKey === key) return playback.stop();
    loading.current = true;
    setError(null);
    try {
      const uri = await api.recordingUrl(rec.id); // the address expires, so ask each time
      if (!alive.current) return;
      onPlayStart(); // only now: if the address could not be fetched, the device voice keeps going
      await playback.play(key, uri);
    } catch (e) {
      if (alive.current) setError(errorMessage(t, e, { 404: 'story.playFailed' }));
    } finally {
      loading.current = false;
    }
  }

  async function remove(rec: Recording) {
    const ok = await confirm(
      t('story.deleteRecordingTitle'),
      t('story.deleteRecordingMessage'),
      t('settings.confirmDelete'),
      t('common.cancel'),
    );
    if (!ok) return;
    try {
      if (playback.playingKey === `rec:${rec.id}`) playback.stop();
      await api.deleteRecording(rec.id);
      if (alive.current) setRecordings((old) => old.filter((r) => r.id !== rec.id));
    } catch (e) {
      if (alive.current) setError(errorMessage(t, e));
    }
  }

  function openRecordScreen() {
    playback.stop(); // do not play while the microphone is about to start
    router.push({ pathname: '/record/[id]', params: { id: String(storyId) } });
  }

  return (
    <Card style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('story.voices')}
      </Text>

      {autoReader && (
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={1}>
              {t('story.autoReader')}
            </Text>
            <Text style={styles.note}>{t('story.autoReaderNote')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={autoReader.speaking ? t('story.stop') : t('story.autoReaderPlay')}
            accessibilityState={{ selected: autoReader.speaking }}
            onPress={autoReader.onToggle}
            style={styles.play}
          >
            <Text style={styles.playText}>{autoReader.speaking ? t('record.stop') : t('record.play')}</Text>
          </Pressable>
        </View>
      )}

      {recordings.length === 0 && <Text style={styles.note}>{t('story.voicesEmpty')}</Text>}

      {recordings.map((rec) => {
        const playing = playback.playingKey === `rec:${rec.id}`;
        return (
          <View key={rec.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {rec.name}
              </Text>
              <Text style={styles.note}>{formatDuration(rec.duration_seconds)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? t('record.stop') : t('story.playRecording', { name: rec.name })}
              accessibilityState={{ selected: playing }}
              onPress={() => void toggle(rec)}
              style={styles.play}
            >
              <Text style={styles.playText}>{playing ? t('record.stop') : t('record.play')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('story.deleteRecordingLabel', { name: rec.name })}
              hitSlop={8}
              onPress={() => void remove(rec)}
              style={styles.delete}
            >
              <Text style={styles.deleteText}>{t('settings.confirmDelete')}</Text>
            </Pressable>
          </View>
        );
      })}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Button label={t('story.recordCta')} variant="accent" onPress={openRecordScreen} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  title: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: fonts.small },
  error: { color: colors.danger, fontSize: fonts.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  play: { minHeight: touch, minWidth: touch, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' },
  playText: { color: colors.amber, fontSize: fonts.body, fontWeight: '700' },
  delete: { minHeight: touch, minWidth: touch, paddingHorizontal: spacing.sm, justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: colors.danger, fontSize: fonts.small },
});
