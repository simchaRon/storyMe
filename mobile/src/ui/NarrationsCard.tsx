import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, Narration, Voice } from '../api/client';
import { errorMessage } from '../api/errorMessage';
import { formatDuration } from '../audioFormat';
import { isActive, narrationFor, needsPolling, progressPercent } from '../narration';
import { colors, fonts, radius, spacing, touch } from '../theme';
import { Playback } from '../useAudioPlayback';
import { Button } from './Button';
import { Card } from './Card';
import { confirm } from './confirm';

const POLL_MS = 3000;

type Props = {
  storyId: number;
  /** A cloned voice reads English stories only. */
  storyLanguage: 'en' | 'he';
  playback: Playback;
  onPlayStart: () => void;
};

/** "Read this story in a cloned voice": make the audio (it takes minutes), see the progress, play it. */
export function NarrationsCard({ storyId, storyLanguage, playback, onPlayStart }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyVoice, setBusyVoice] = useState<number | null>(null); // a voice whose "make audio" was just tapped
  const [focused, setFocused] = useState(false); // is this screen the one the user is looking at?
  const alive = useRef(true);
  const loadingPlay = useRef(false);
  const reloadSeq = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const english = storyLanguage === 'en';

  const reload = useCallback(async () => {
    const ticket = ++reloadSeq.current; // only the newest answer is used: an older one must not undo it
    try {
      const [list, mine] = await Promise.all([api.listNarrations(storyId), api.listVoices()]);
      if (alive.current && ticket === reloadSeq.current) {
        setNarrations(list);
        setVoices(mine);
      }
    } catch {
      /* the card is a bonus. A failed refresh is tried again at the next tick */
    }
  }, [storyId]);

  // Is voice cloning set up on the server? (Asked once, and again when the screen comes back.)
  useFocusEffect(
    useCallback(() => {
      let current = true;
      setFocused(true);
      if (!english) return () => setFocused(false);
      api
        .voiceCapabilities()
        .then((caps) => {
          if (!current) return;
          setEnabled(caps.enabled);
          if (caps.enabled) void reload();
        })
        .catch(() => {});
      return () => {
        current = false;
        setFocused(false);
        playback.stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [english, reload]),
  );

  // While audio is being made, ask for news every few seconds. It stops by itself when nothing is active,
  // and while the user is on another screen.
  const polling = needsPolling(narrations);
  useEffect(() => {
    if (!polling || !focused) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [polling, focused, reload]);

  async function make(voice: Voice) {
    if (busyVoice !== null) return;
    setBusyVoice(voice.id);
    setError(null);
    try {
      await api.createNarration(storyId, voice.id);
      await reload();
    } catch (e) {
      if (alive.current) {
        setError(
          errorMessage(t, e, {
            413: 'clone.tooLong',
            422: 'clone.englishOnly',
            429: 'clone.dailyLimit',
            503: 'clone.notAvailable',
          }),
        );
      }
    } finally {
      if (alive.current) setBusyVoice(null);
    }
  }

  async function togglePlay(n: Narration) {
    const key = `nar:${n.id}`;
    if (loadingPlay.current) return;
    if (playback.playingKey === key) return playback.stop();
    loadingPlay.current = true;
    setError(null);
    try {
      const uri = await api.narrationUrl(n.id);
      if (!alive.current) return;
      onPlayStart();
      await playback.play(key, uri);
    } catch (e) {
      if (alive.current) setError(errorMessage(t, e, { 404: 'story.playFailed', 409: 'story.playFailed' }));
    } finally {
      loadingPlay.current = false;
    }
  }

  async function remove(n: Narration) {
    const ok = await confirm(
      t('story.deleteRecordingTitle'),
      t('story.deleteRecordingMessage'),
      t('settings.confirmDelete'),
      t('common.cancel'),
    );
    if (!ok) return;
    try {
      if (playback.playingKey === `nar:${n.id}`) playback.stop();
      await api.deleteNarration(n.id);
      if (alive.current) setNarrations((old) => old.filter((x) => x.id !== n.id));
    } catch (e) {
      if (alive.current) setError(errorMessage(t, e));
    }
  }

  if (!english || !enabled) return null; // nothing to show if cloning is not set up, or the story is not English

  return (
    <Card style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('clone.title')}
      </Text>

      {voices.length === 0 && <Text style={styles.note}>{t('clone.noVoices')}</Text>}

      {voices.map((voice) => {
        const n = narrationFor(voice.id, narrations);
        const playing = n !== undefined && playback.playingKey === `nar:${n.id}`;
        return (
          <View key={voice.id} style={styles.voice}>
            <Text style={styles.name}>{voice.name}</Text>

            {n === undefined && (
              <Button
                label={t('clone.makeAudio', { name: voice.name })}
                variant="secondary"
                disabled={busyVoice !== null}
                onPress={() => void make(voice)}
              />
            )}

            {n !== undefined && isActive(n) && (
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={t(n.status === 'queued' ? 'clone.waiting' : 'clone.making', { done: n.progress_done, total: n.progress_total })}
                accessibilityValue={{ min: 0, max: 100, now: progressPercent(n) }}
                style={styles.progressBox}
              >
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progressPercent(n)}%` }]} />
                </View>
                <Text style={styles.note}>
                  {n.status === 'queued' ? t('clone.waiting') : t('clone.making', { done: n.progress_done, total: n.progress_total })}
                </Text>
              </View>
            )}

            {n !== undefined && n.status === 'done' && (
              <View style={styles.row}>
                <Text style={[styles.note, styles.grow]}>{formatDuration(n.duration_seconds)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing ? t('record.stop') : t('story.playRecording', { name: voice.name })}
                  accessibilityState={{ selected: playing }}
                  onPress={() => void togglePlay(n)}
                  style={styles.play}
                >
                  <Text style={styles.playText}>{playing ? t('record.stop') : t('record.play')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('story.deleteRecordingLabel', { name: voice.name })}
                  hitSlop={8}
                  onPress={() => void remove(n)}
                  style={styles.delete}
                >
                  <Text style={styles.deleteText}>{t('settings.confirmDelete')}</Text>
                </Pressable>
              </View>
            )}

            {n !== undefined && n.status === 'failed' && (
              <View style={styles.progressBox}>
                <Text accessibilityRole="alert" style={styles.error}>
                  {n.error ?? t('errors.generic')}
                </Text>
                <Button label={t('errors.retry')} variant="secondary" disabled={busyVoice !== null} onPress={() => void make(voice)} />
              </View>
            )}
          </View>
        );
      })}

      {polling && <Text style={styles.note}>{t('clone.slowNote')}</Text>}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Button
        label={t(voices.length === 0 ? 'clone.addVoice' : 'clone.manageVoices')}
        variant="accent"
        onPress={() => {
          playback.stop();
          router.push(voices.length === 0 ? '/voice/new' : '/voices');
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  title: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: fonts.small },
  error: { color: colors.danger, fontSize: fonts.body },
  name: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  voice: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  progressBox: { gap: spacing.sm },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill, backgroundColor: colors.amber },
  play: { minHeight: touch, minWidth: touch, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' },
  playText: { color: colors.amber, fontSize: fonts.body, fontWeight: '700' },
  delete: { minHeight: touch, minWidth: touch, paddingHorizontal: spacing.sm, justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: colors.danger, fontSize: fonts.small },
});
