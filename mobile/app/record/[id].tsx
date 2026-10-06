import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api, ApiError, Story } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { formatDuration, MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS } from '../../src/audioFormat';
import { discardRecordingFile } from '../../src/recordingFile';
import { getItem, setItem } from '../../src/storage';
import { colors, fonts, radius, spacing, storyLineHeight, touch } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { RequireAuth } from '../../src/ui/RequireAuth';
import { Screen } from '../../src/ui/Screen';

const NAME_KEY = 'dreamtale.voiceName';

type Phase = 'ready' | 'recording' | 'review' | 'saving';

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const raw = Array.isArray(id) ? id[0] : id;
  return (
    <RequireAuth>
      <RecordContent key={raw} rawId={raw} />
    </RequireAuth>
  );
}

function RecordContent({ rawId }: { rawId: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  const storyId = /^[1-9]\d*$/.test(rawId ?? '') ? Number(rawId) : null;

  const [story, setStory] = useState<Story | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState<string | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const lastSeconds = useRef(0); // the length so far, kept for when the recorder stops
  const keptUri = useRef<string | null>(null); // the recorded file on the phone, so it can always be deleted
  const alive = useRef(true);
  const busy = useRef(false); // blocks double taps

  // To listen to the recording before saving it.
  const player = useAudioPlayer(phase === 'review' || phase === 'saving' ? recordedUri : null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The story text, so the reader can read it from the screen.
  useEffect(() => {
    if (storyId === null) {
      setError(t('story.notFound'));
      return;
    }
    const controller = new AbortController();
    api
      .getStory(storyId, controller.signal)
      .then(setStory)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === -1)) setError(errorMessage(t, e, { 404: 'story.notFound' }));
      });
    return () => controller.abort();
  }, [storyId, t]);

  // Remember the last name used on this device ("Mom"), so it does not need to be typed again.
  useEffect(() => {
    void getItem(NAME_KEY).then((saved) => {
      if (saved && alive.current) setName((current) => current || saved);
    });
  }, []);

  useEffect(() => {
    if (phase === 'recording') lastSeconds.current = recorderState.durationMillis / 1000;
  }, [phase, recorderState.durationMillis]);

  // Stop by itself at the longest length.
  useEffect(() => {
    if (phase === 'recording' && recorderState.durationMillis / 1000 >= MAX_RECORDING_SECONDS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recorderState.durationMillis]);

  // When the user leaves this screen: stop the microphone if it is on, put the audio mode back for
  // playback, and delete the recorded file from the phone (it was either uploaded or thrown away).
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        /* nothing to stop */
      }
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      discardRecordingFile(keptUri.current);
      keptUri.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (busy.current) return;
    setError(null);
    if (!name.trim()) return setError(t('record.needName'));
    if (!consent) return setError(t('record.needConsent'));
    busy.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!alive.current) return; // the user left while the phone asked for permission
      if (!permission.granted) return setError(t('record.noPermission'));
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!alive.current) {
        // The user left while the recorder was getting ready. The microphone must stay off.
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        return;
      }
      lastSeconds.current = 0;
      recorder.record();
      setPhase('recording');
    } catch {
      setError(t('record.failed'));
    } finally {
      busy.current = false;
    }
  }

  async function stop() {
    if (busy.current) return;
    busy.current = true;
    try {
      await recorder.stop();
      // The length from the recorder itself is more exact than the one we counted while recording.
      const seconds = Math.max(lastSeconds.current, recorder.getStatus().durationMillis / 1000);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); // play through the speaker
      const uri = recorder.uri;
      if (!alive.current) return;
      if (!uri) throw new Error('no file');
      keptUri.current = uri; // from now on it is deleted when we are done with it
      if (seconds < MIN_RECORDING_SECONDS) {
        discardRecordingFile(uri);
        keptUri.current = null;
        setPhase('ready');
        return setError(t('record.tooShort'));
      }
      setRecordedUri(uri);
      setRecordedSeconds(seconds);
      setPhase('review');
    } catch {
      if (alive.current) {
        setPhase('ready');
        setError(t('record.failed'));
      }
    } finally {
      busy.current = false;
    }
  }

  function togglePlay() {
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    if (playerStatus.didJustFinish || (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration)) {
      void player.seekTo(0);
    }
    player.play();
  }

  function recordAgain() {
    player.pause();
    discardRecordingFile(keptUri.current);
    keptUri.current = null;
    setRecordedUri(null);
    setError(null);
    setPhase('ready');
  }

  async function save() {
    if (busy.current || storyId === null || !recordedUri) return;
    busy.current = true;
    player.pause();
    setPhase('saving');
    setError(null);
    try {
      await api.uploadRecording(storyId, {
        uri: recordedUri,
        name: name.trim(),
        durationSeconds: Math.round(recordedSeconds),
        consent,
      });
      void setItem(NAME_KEY, name.trim());
      discardRecordingFile(keptUri.current); // it is on the server now
      keptUri.current = null;
      if (alive.current) router.canGoBack() ? router.back() : router.replace({ pathname: '/story/[id]', params: { id: String(storyId) } });
    } catch (e) {
      if (alive.current) {
        setPhase('review');
        setError(errorMessage(t, e, { 409: 'record.tooMany', 413: 'record.tooBig', 415: 'record.badFile' }));
      }
    } finally {
      busy.current = false;
    }
  }

  const recording = phase === 'recording';
  const seconds = recording ? recorderState.durationMillis / 1000 : recordedSeconds;
  const rtl = story?.language === 'he';

  return (
    <Screen back>
      <Text accessibilityRole="header" style={styles.title}>
        {t('record.title')}
      </Text>

      {phase === 'ready' && (
        <Card style={styles.card}>
          <Text style={styles.label}>{t('record.nameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={t('record.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('record.nameLabel')}
          />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('record.consent')}</Text>
            <Switch
              value={consent}
              onValueChange={setConsent}
              trackColor={{ false: colors.border, true: colors.indigo }}
              thumbColor={colors.amber}
              accessibilityLabel={t('record.consent')}
            />
          </View>
          <Text style={styles.note}>{t('record.consentHint')}</Text>
          <Text style={styles.note}>{t('record.tips')}</Text>
        </Card>
      )}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {(recording || phase === 'review' || phase === 'saving') && (
        <Text accessibilityLiveRegion="polite" style={styles.timer}>
          {recording ? t('record.recording') : t('record.review')} · {formatDuration(seconds)}
        </Text>
      )}

      {phase === 'ready' && <Button label={t('record.start')} variant="accent" onPress={() => void start()} />}
      {recording && <Button label={t('record.stop')} variant="danger" onPress={() => void stop()} />}
      {(phase === 'review' || phase === 'saving') && (
        <View style={styles.controls}>
          <Button
            label={t(playerStatus.playing ? 'record.pause' : 'record.play')}
            variant="secondary"
            disabled={phase === 'saving'}
            onPress={togglePlay}
          />
          <Button
            label={t(phase === 'saving' ? 'record.saving' : 'record.save')}
            disabled={phase === 'saving'}
            onPress={() => void save()}
          />
          <Button label={t('record.again')} variant="secondary" disabled={phase === 'saving'} onPress={recordAgain} />
        </View>
      )}

      {/* The story, so the reader can read it from the screen. */}
      {story && (
        <Card style={styles.card}>
          <Text
            style={[styles.storyTitle, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}
          >
            {story.title}
          </Text>
          {story.content.split(/\n{2,}/).map((p, i) => (
            <Text key={i} style={[styles.text, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>
              {p.trim()}
            </Text>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  card: { gap: spacing.md },
  label: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  input: {
    minHeight: touch,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: fonts.body,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.text, fontSize: fonts.body, flexShrink: 1 },
  note: { color: colors.textMuted, fontSize: fonts.small },
  error: { color: colors.danger, fontSize: fonts.body },
  timer: { color: colors.amber, fontSize: fonts.title, textAlign: 'center' },
  controls: { gap: spacing.sm },
  storyTitle: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  text: { color: colors.text, fontSize: fonts.story, lineHeight: storyLineHeight },
});
