import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, Recording } from '../api/client';
import { errorMessage } from '../api/errorMessage';
import { formatDuration } from '../audioFormat';
import { colors, fonts, spacing, touch } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { confirm } from './confirm';

const START_TIMEOUT_MS = 15000; // if a recording has not started playing by then, give up

type Props = {
  storyId: number;
  /** Called when a recording is about to play, so the device voice can be stopped. */
  onPlayStart: () => void;
  /** When this number changes, any recording that is playing stops (the device voice started). */
  stopToken: number;
};

/** The recordings of one story (people reading it aloud), with play, delete and "record your voice". */
export function RecordingsCard({ storyId, onPlayStart, stopToken }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [source, setSource] = useState<{ uri: string } | null>(null);
  const [wantPlay, setWantPlay] = useState(false);
  const alive = useRef(true);
  const loading = useRef(false); // blocks a second tap while the address is being fetched

  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const stopPlayback = useCallback(() => {
    try {
      player.pause();
    } catch {
      /* not playing */
    }
    setWantPlay(false);
    setPlayingId(null);
  }, [player]);

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
        stopPlayback();
      };
    }, [storyId, stopPlayback]),
  );

  // Start playing as soon as the new player exists.
  useEffect(() => {
    if (source && wantPlay) {
      player.play();
      setWantPlay(false);
    }
  }, [source, wantPlay, player]);

  useEffect(() => {
    if (status.didJustFinish) setPlayingId(null);
  }, [status.didJustFinish]);

  // If a recording never starts (the link expired, the file is gone, no network), do not stay on "Stop".
  useEffect(() => {
    if (playingId === null) return;
    const timer = setTimeout(() => {
      if (!statusRef.current.playing && !statusRef.current.isLoaded) {
        stopPlayback();
        if (alive.current) setError(t('story.playFailed'));
      }
    }, START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [playingId, stopPlayback, t]);

  useEffect(() => {
    stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopToken]);

  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        /* already gone */
      }
    },
    [player],
  );

  async function toggle(rec: Recording) {
    if (loading.current) return;
    if (playingId === rec.id) return stopPlayback();
    loading.current = true;
    setError(null);
    try {
      const uri = await api.recordingUrl(rec.id); // the address expires, so ask each time
      if (!alive.current) return;
      onPlayStart(); // only now: if the address could not be fetched, the device voice keeps going
      stopPlayback();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      setSource({ uri });
      setPlayingId(rec.id);
      setWantPlay(true);
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
      if (playingId === rec.id) stopPlayback();
      await api.deleteRecording(rec.id);
      if (alive.current) setRecordings((old) => old.filter((r) => r.id !== rec.id));
    } catch (e) {
      if (alive.current) setError(errorMessage(t, e));
    }
  }

  function openRecordScreen() {
    stopPlayback(); // do not play while the microphone is about to start
    router.push({ pathname: '/record/[id]', params: { id: String(storyId) } });
  }

  return (
    <Card style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('story.voices')}
      </Text>

      {recordings.length === 0 && <Text style={styles.note}>{t('story.voicesEmpty')}</Text>}

      {recordings.map((rec) => {
        const playing = playingId === rec.id;
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
