import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api, ApiError, Lang } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { addMany } from '../src/keywords';
import { cleanPrompt, MAX_PROMPT_LENGTH } from '../src/storyText';
import { getItem, setItem } from '../src/storage';
import { AGES, DEFAULT_AGE, DEFAULT_LENGTH, LENGTHS, pickAge, pickLength } from '../src/storyOptions';
import { colors, fonts, radius, spacing } from '../src/theme';
import { BedtimeLoader } from '../src/ui/BedtimeLoader';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { ChoiceChips } from '../src/ui/ChoiceChips';
import { RequireAuth } from '../src/ui/RequireAuth';
import { Screen } from '../src/ui/Screen';
import { TagInput } from '../src/ui/TagInput';

const AGE_KEY = 'dreamtale.childAge';
const LENGTH_KEY = 'dreamtale.storyLength';
const LEVEL_KEYS = ['settings.level1', 'settings.level2', 'settings.level3', 'settings.level4', 'settings.level5'];

export default function CreateScreen() {
  return (
    <RequireAuth>
      <CreateContent />
    </RequireAuth>
  );
}

function CreateContent() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(''); // the story idea in free text
  const [draft, setDraft] = useState(''); // text typed in the box but not added yet
  const [level, setLevel] = useState(2);
  const [age, setAge] = useState<number>(DEFAULT_AGE);
  const [length, setLength] = useState<number>(DEFAULT_LENGTH);
  const [torah, setTorah] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true); // false after the screen is closed
  const inFlight = useRef(false); // true while a story is being written (blocks a second tap)
  const abort = useRef<AbortController | null>(null);
  const levelTouched = useRef(false);
  const ageTouched = useRef(false);
  const lengthTouched = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort(); // stop waiting if the user leaves
    };
  }, []);

  // Start with the age and length used last time on this device (default: age 6, 3 minutes).
  useEffect(() => {
    (async () => {
      const [savedAge, savedLength] = await Promise.all([getItem(AGE_KEY), getItem(LENGTH_KEY)]);
      if (!alive.current) return;
      if (!ageTouched.current && savedAge) setAge(pickAge(savedAge));
      if (!lengthTouched.current && savedLength) setLength(pickLength(savedLength));
    })();
  }, []);

  // Start the slider at the level from Settings, unless the user already moved it.
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        if (alive.current && !levelTouched.current) setLevel(s.default_educational_level);
      })
      .catch(() => {});
  }, []);

  async function generate() {
    if (inFlight.current) return;

    // Text typed but not added yet counts as an idea.
    let list = keywords;
    if (draft.trim() !== '') {
      const result = addMany(keywords, draft);
      list = result.list;
      setKeywords(list);
      setDraft(result.rest);
      if (result.problem) {
        setError(t(result.problem === 'full' ? 'create.keywordsFull' : 'create.keywordInvalid'));
        return;
      }
    }
    const description = cleanPrompt(prompt);
    if (list.length === 0 && description === '') {
      setError(t('create.needKeyword'));
      return;
    }

    inFlight.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    try {
      const story = await api.generateStory(
        {
          keywords: list,
          prompt: description || undefined,
          educational_level: level,
          child_age: age,
          length_minutes: length,
          language: i18n.language.startsWith('he') ? 'he' : ('en' as Lang),
          is_torah_story: torah,
        },
        controller.signal,
      );
      void setItem(AGE_KEY, String(age)); // remember for next time
      void setItem(LENGTH_KEY, String(length));
      if (alive.current) router.replace({ pathname: '/story/[id]', params: { id: String(story.id) } });
    } catch (e) {
      const cancelled = e instanceof ApiError && e.status === -1;
      if (alive.current) {
        setBusy(false);
        if (!cancelled) {
          setError(errorMessage(t, e, { 404: torah ? 'create.torahNotFound' : 'errors.generic', 429: 'create.dailyLimit' }));
        }
      }
    } finally {
      inFlight.current = false;
    }
  }

  if (busy) {
    return (
      <Screen header={false}>
        <BedtimeLoader onCancel={() => abort.current?.abort()} />
      </Screen>
    );
  }

  return (
    <Screen back>
      <Text accessibilityRole="header" style={styles.title}>
        {t('home.create')}
      </Text>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('create.keywords')}</Text>
        <Text style={styles.note}>{t('create.keywordsHint')}</Text>
        <TagInput value={keywords} onChange={setKeywords} text={draft} onTextChange={setDraft} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('create.prompt')}</Text>
        <Text style={styles.note}>{t('create.promptHint')}</Text>
        <TextInput
          style={styles.promptInput}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          numberOfLines={4}
          maxLength={MAX_PROMPT_LENGTH}
          textAlignVertical="top"
          placeholder={t('create.promptPlaceholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('create.prompt')}
        />
        <Text style={styles.note}>
          {prompt.length} / {MAX_PROMPT_LENGTH}
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('create.childAge')}</Text>
        <Text style={styles.note}>{t('create.childAgeHint')}</Text>
        <ChoiceChips
          accessibilityLabel={t('create.childAge')}
          options={AGES.map((a) => ({ value: a, label: String(a) }))}
          value={age}
          onChange={(v) => {
            ageTouched.current = true;
            setAge(v);
          }}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('create.length')}</Text>
        <Text style={styles.note}>{t('create.lengthHint')}</Text>
        <ChoiceChips
          accessibilityLabel={t('create.length')}
          options={LENGTHS.map((m) => ({ value: m, label: t('create.minutes', { n: m }) }))}
          value={length}
          onChange={(v) => {
            lengthTouched.current = true;
            setLength(v);
          }}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('create.level')}</Text>
        <Slider
          minimumValue={1}
          maximumValue={5}
          step={1}
          value={level}
          onValueChange={(v) => {
            levelTouched.current = true;
            setLevel(Math.round(v));
          }}
          minimumTrackTintColor={colors.indigo}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.amber}
          accessibilityLabel={t('create.level')}
          accessibilityValue={{ min: 1, max: 5, now: level, text: t(LEVEL_KEYS[level - 1]) }}
        />
        <Text style={styles.levelText}>
          {level} / 5 · {t(LEVEL_KEYS[level - 1])}
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('create.torah')}</Text>
          <Switch
            value={torah}
            onValueChange={setTorah}
            trackColor={{ false: colors.border, true: colors.indigo }}
            thumbColor={colors.amber}
            accessibilityLabel={t('create.torah')}
          />
        </View>
        <Text style={styles.note}>{t('create.torahHint')}</Text>
      </Card>

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Button label={t('create.generate')} variant="accent" onPress={() => void generate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  card: { gap: spacing.md },
  section: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: fonts.small },
  levelText: { color: colors.amber, fontSize: fonts.body },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.text, fontSize: fonts.body, fontWeight: '700', flexShrink: 1 },
  error: { color: colors.danger, fontSize: fonts.body },
  promptInput: {
    minHeight: 120,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: fonts.body,
    padding: spacing.md,
  },
});
