import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextStyle, View } from 'react-native';

import { api, ApiError, Story } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { hasVoiceFor } from '../../src/speech';
import { speechParts } from '../../src/speechText';
import { colors, fonts, spacing, storyLineHeight } from '../../src/theme';
import { useAudioPlayback } from '../../src/useAudioPlayback';
import { BedtimeLoader } from '../../src/ui/BedtimeLoader';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { RequireAuth } from '../../src/ui/RequireAuth';
import { NarrationsCard } from '../../src/ui/NarrationsCard';
import { RecordingsCard } from '../../src/ui/RecordingsCard';
import { Screen } from '../../src/ui/Screen';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const raw = Array.isArray(id) ? id[0] : id;
  // `key` gives each story its own fresh screen state, so an old story never flashes.
  return (
    <RequireAuth>
      <StoryContent key={raw} rawId={raw} />
    </RequireAuth>
  );
}

function StoryContent({ rawId }: { rawId: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true); // from Settings. If Settings cannot load, show the button.
  const [speaking, setSpeaking] = useState(false);
  const [writing, setWriting] = useState(false); // writing the next chapter
  const [failedToken, setFailedToken] = useState(0); // bumps when a recording or audio could not start
  // One audio player for recordings and cloned-voice audio, so two sounds never play together.
  const playback = useAudioPlayback(() => setFailedToken((n) => n + 1));

  const alive = useRef(true);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const speechRun = useRef(0); // every start or stop of reading gets a new number. Old callbacks are ignored.

  // Load the story. A slow answer for an old screen is ignored.
  useEffect(() => {
    if (!/^[1-9]\d*$/.test(rawId ?? '')) {
      setError(t('story.notFound'));
      return;
    }
    const controller = new AbortController();
    setError(null);
    api
      .getStory(Number(rawId), controller.signal)
      .then(setStory)
      .catch((e) => {
        if (e instanceof ApiError && e.status === -1) return;
        setError(e instanceof ApiError && e.status === 404 ? t('story.notFound') : errorMessage(t, e));
      });
    return () => controller.abort();
  }, [rawId, reload, t]);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => alive.current && setVoiceOn(s.voice_enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      speechRun.current++;
      void Speech.stop(); // stop reading when the user leaves
    };
  }, []);

  function stopSpeech() {
    speechRun.current++;
    void Speech.stop();
    setSpeaking(false);
  }

  async function startSpeech() {
    if (!story) return;
    const mine = ++speechRun.current;
    setError(null);
    playback.stop(); // the device voice and a recording must not play together
    if (!(await hasVoiceFor(story.language))) {
      if (alive.current && mine === speechRun.current) setError(t('story.noVoice'));
      return;
    }
    if (!alive.current || mine !== speechRun.current) return;

    const language = story.language === 'he' ? 'he-IL' : 'en-US';
    const parts = speechParts(story.title, story.content);
    setSpeaking(true);

    // Read one piece at a time. The next piece starts when the last one is done.
    const readPart = (i: number) => {
      if (mine !== speechRun.current) return; // stopped, or a newer run started
      if (i >= parts.length) {
        setSpeaking(false);
        return;
      }
      try {
        Speech.speak(parts[i], {
          language,
          onDone: () => readPart(i + 1),
          onStopped: () => {
            if (mine === speechRun.current) setSpeaking(false);
          },
          onError: () => {
            if (mine !== speechRun.current) return;
            setSpeaking(false);
            setError(t('settings.voiceError'));
          },
        });
      } catch {
        setSpeaking(false);
        setError(t('settings.voiceError'));
      }
    };
    readPart(0);
  }

  async function createSequel() {
    if (!story || inFlight.current) return;
    stopSpeech();
    inFlight.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setWriting(true);
    setError(null);
    try {
      const next = await api.createSequel(story.id, controller.signal);
      // The screen closes by itself. Do not set state after this, or the old story could flash.
      if (alive.current) router.replace({ pathname: '/story/[id]', params: { id: String(next.id) } });
    } catch (e) {
      const cancelled = e instanceof ApiError && e.status === -1;
      if (alive.current) {
        setWriting(false);
        if (!cancelled) setError(errorMessage(t, e, { 429: 'create.dailyLimit', 409: 'story.parentGone' }));
      }
    } finally {
      inFlight.current = false;
    }
  }

  if (writing) {
    return (
      <Screen header={false}>
        <BedtimeLoader onCancel={() => abort.current?.abort()} />
      </Screen>
    );
  }

  // Text direction follows the language of the story, not the language of the app.
  const rtl = story?.language === 'he';
  const direction: TextStyle = { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' };

  return (
    <Screen back>
      {!story && !error && <ActivityIndicator color={colors.amber} />}

      {error && (
        <Card style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          {!story && <Button label={t('errors.retry')} onPress={() => setReload((n) => n + 1)} />}
        </Card>
      )}

      {story && (
        <>
          <Card style={styles.card}>
            <Text style={styles.chapter}>{t('story.chapter', { n: story.chapter_number })}</Text>
            <Text style={styles.source}>{t('story.meta', { age: story.child_age, minutes: story.length_minutes })}</Text>
            <Text accessibilityRole="header" style={[styles.title, direction]}>
              {story.title}
            </Text>
            {story.source_reference && (
              <Text style={styles.source}>{t('story.source', { ref: story.source_reference })}</Text>
            )}
            <View style={styles.paragraphs}>
              {story.content.split(/\n{2,}/).map((p, i) => (
                <Text key={i} style={[styles.text, direction]}>
                  {p.trim()}
                </Text>
              ))}
            </View>
          </Card>

          {voiceOn && (
            <Button
              label={t(speaking ? 'story.stop' : 'story.listen')}
              variant={speaking ? 'secondary' : 'primary'}
              onPress={() => (speaking ? stopSpeech() : void startSpeech())}
            />
          )}
          <RecordingsCard storyId={story.id} playback={playback} onPlayStart={stopSpeech} failedToken={failedToken} />
          <NarrationsCard storyId={story.id} storyLanguage={story.language} playback={playback} onPlayStart={stopSpeech} />
          <Button label={t('story.sequel')} variant="accent" onPress={() => void createSequel()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  chapter: { color: colors.amber, fontSize: fonts.small },
  title: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  source: { color: colors.textMuted, fontSize: fonts.small },
  paragraphs: { gap: spacing.md },
  text: { color: colors.text, fontSize: fonts.story, lineHeight: storyLineHeight },
  error: { color: colors.danger, fontSize: fonts.body },
});
