import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api, ApiError, Story } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { formatDuration, MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS } from '../../src/audioFormat';
import { getItem, setItem } from '../../src/storage';
import { colors, fonts, radius, spacing, storyLineHeight, touch } from '../../src/theme';
import { useSpeechRecorder } from '../../src/useSpeechRecorder';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { RequireAuth } from '../../src/ui/RequireAuth';
import { Screen } from '../../src/ui/Screen';

const NAME_KEY = 'dreamtale.voiceName';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveBusy = useRef(false); // blocks a second tap on Save

  const rec = useSpeechRecorder({ minSeconds: MIN_RECORDING_SECONDS, maxSeconds: MAX_RECORDING_SECONDS });

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
    let current = true;
    void getItem(NAME_KEY).then((saved) => {
      if (saved && current) setName((old) => old || saved);
    });
    return () => {
      current = false;
    };
  }, []);

  async function start() {
    setError(null);
    if (!name.trim()) return setError(t('record.needName'));
    if (!consent) return setError(t('record.needConsent'));
    await rec.start();
  }

  async function save() {
    if (saveBusy.current || storyId === null || !rec.uri) return;
    saveBusy.current = true;
    rec.pause();
    setSaving(true);
    setError(null);
    try {
      await api.uploadRecording(storyId, {
        uri: rec.uri,
        name: name.trim(),
        durationSeconds: Math.round(rec.finalSeconds),
        consent,
      });
      void setItem(NAME_KEY, name.trim());
      rec.releaseFile(); // it is on the server now
      if (rec.isAlive()) {
        router.canGoBack() ? router.back() : router.replace({ pathname: '/story/[id]', params: { id: String(storyId) } });
      }
    } catch (e) {
      if (rec.isAlive()) {
        setSaving(false);
        setError(errorMessage(t, e, { 409: 'record.tooMany', 413: 'record.tooBig', 415: 'record.badFile' }));
      }
    } finally {
      saveBusy.current = false;
    }
  }

  const recording = rec.phase === 'recording';
  const review = rec.phase === 'review';
  const shownError = error ?? (rec.problem ? t(rec.problem) : null);
  const rtl = story?.language === 'he';

  return (
    <Screen back>
      <Text accessibilityRole="header" style={styles.title}>
        {t('record.title')}
      </Text>

      {rec.phase === 'ready' && (
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

      {shownError && (
        <Text accessibilityRole="alert" style={styles.error}>
          {shownError}
        </Text>
      )}

      {(recording || review) && (
        <Text accessibilityLiveRegion="polite" style={styles.timer}>
          {recording ? t('record.recording') : t('record.review')} · {formatDuration(recording ? rec.liveSeconds : rec.finalSeconds)}
        </Text>
      )}

      {rec.phase === 'ready' && <Button label={t('record.start')} variant="accent" onPress={() => void start()} />}
      {recording && <Button label={t('record.stop')} variant="danger" onPress={() => void rec.stop()} />}
      {review && (
        <View style={styles.controls}>
          <Button
            label={t(rec.playing ? 'record.pause' : 'record.play')}
            variant="secondary"
            disabled={saving}
            onPress={rec.togglePlay}
          />
          <Button label={t(saving ? 'record.saving' : 'record.save')} disabled={saving} onPress={() => void save()} />
          <Button label={t('record.again')} variant="secondary" disabled={saving} onPress={rec.discard} />
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
