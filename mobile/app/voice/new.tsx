import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api, VoiceCapabilities } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { formatDuration } from '../../src/audioFormat';
import { getItem, setItem } from '../../src/storage';
import { colors, fonts, radius, spacing, storyLineHeight, touch } from '../../src/theme';
import { useSpeechRecorder } from '../../src/useSpeechRecorder';
import { VOICE_SAMPLE_SCRIPT } from '../../src/voiceSample';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { RequireAuth } from '../../src/ui/RequireAuth';
import { Screen } from '../../src/ui/Screen';

const NAME_KEY = 'dreamtale.voiceName';
const FALLBACK = { min_sample_seconds: 10, max_sample_seconds: 120 };

export default function NewVoiceScreen() {
  return (
    <RequireAuth>
      <NewVoiceContent />
    </RequireAuth>
  );
}

function NewVoiceContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [caps, setCaps] = useState<VoiceCapabilities | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveBusy = useRef(false);

  const limits = caps ?? FALLBACK;
  const rec = useSpeechRecorder({ minSeconds: limits.min_sample_seconds, maxSeconds: limits.max_sample_seconds });

  useEffect(() => {
    let current = true;
    api
      .voiceCapabilities()
      .then((c) => current && setCaps(c))
      .catch((e) => current && setError(errorMessage(t, e)));
    void getItem(NAME_KEY).then((saved) => {
      if (saved && current) setName((old) => old || saved);
    });
    return () => {
      current = false;
    };
  }, [t]);

  async function start() {
    setError(null);
    if (!name.trim()) return setError(t('record.needName'));
    if (!consent) return setError(t('clone.needConsent'));
    await rec.start();
  }

  async function save() {
    if (saveBusy.current || !rec.uri) return;
    saveBusy.current = true;
    rec.pause();
    setSaving(true);
    setError(null);
    try {
      await api.createVoice({ uri: rec.uri, name: name.trim(), durationSeconds: Math.round(rec.finalSeconds), consent });
      void setItem(NAME_KEY, name.trim());
      rec.releaseFile();
      if (rec.isAlive()) router.canGoBack() ? router.back() : router.replace('/voices');
    } catch (e) {
      if (rec.isAlive()) {
        setSaving(false);
        setError(errorMessage(t, e, { 409: 'clone.voiceLimit', 413: 'record.tooBig', 415: 'record.badFile', 503: 'clone.notAvailable' }));
      }
    } finally {
      saveBusy.current = false;
    }
  }

  const recording = rec.phase === 'recording';
  const review = rec.phase === 'review';
  const problem = rec.problem === 'record.tooShort' ? t('clone.sampleTooShort', { seconds: limits.min_sample_seconds }) : rec.problem ? t(rec.problem) : null;
  const shownError = error ?? problem;

  return (
    <Screen back>
      <Text accessibilityRole="header" style={styles.title}>
        {t('clone.sampleTitle')}
      </Text>

      {caps && !caps.enabled && (
        <Card>
          <Text style={styles.note}>{t('clone.notAvailable')}</Text>
        </Card>
      )}

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
            <Text style={styles.rowLabel}>{t('clone.consent')}</Text>
            <Switch
              value={consent}
              onValueChange={setConsent}
              trackColor={{ false: colors.border, true: colors.indigo }}
              thumbColor={colors.amber}
              accessibilityLabel={t('clone.consent')}
            />
          </View>
          <Text style={styles.note}>{t('clone.consentHint')}</Text>
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

      {rec.phase === 'ready' && (
        <Button label={t('record.start')} variant="accent" disabled={caps !== null && !caps.enabled} onPress={() => void start()} />
      )}
      {recording && <Button label={t('record.stop')} variant="danger" onPress={() => void rec.stop()} />}
      {review && (
        <View style={styles.controls}>
          <Button label={t(rec.playing ? 'record.pause' : 'record.play')} variant="secondary" disabled={saving} onPress={rec.togglePlay} />
          <Button label={t(saving ? 'record.saving' : 'clone.saveVoice')} disabled={saving} onPress={() => void save()} />
          <Button label={t('record.again')} variant="secondary" disabled={saving} onPress={rec.discard} />
        </View>
      )}

      {/* The text to read. It is English, because cloned voices read English stories. */}
      <Card style={styles.card}>
        <Text style={styles.note}>{t('clone.scriptHint', { min: limits.min_sample_seconds })}</Text>
        {VOICE_SAMPLE_SCRIPT.split('\n\n').map((p, i) => (
          <Text key={i} style={styles.text}>
            {p}
          </Text>
        ))}
      </Card>
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
  text: { color: colors.text, fontSize: fonts.story, lineHeight: storyLineHeight, writingDirection: 'ltr', textAlign: 'left' },
});
