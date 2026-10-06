import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StorySummary } from '../api/client';
import { Group } from '../library';
import { colors, fonts, spacing, touch } from '../theme';
import { Card } from './Card';
import { StoryRow } from './StoryRow';

type Props = {
  group: Group<StorySummary>;
  onOpen: (story: StorySummary) => void;
  onFavorite: (story: StorySummary) => void;
  onDelete: (story: StorySummary) => void;
};

/** A story with next chapters. It shows one card. Tap it to show or hide the chapters. */
export function SeriesCard({ group, onOpen, onFavorite, onDelete }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const first = group.stories[0];
  const rtl = first.language === 'he';
  const n = group.stories.length;
  const subLine =
    first.chapter_number > 1
      ? t('library.seriesFrom', { n, from: first.chapter_number })
      : t('library.seriesCount', { n });

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${first.title}. ${subLine}. ${t(open ? 'library.hideChapters' : 'library.showChapters')}`}
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={[styles.title, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
            {first.title}
          </Text>
          <Text style={styles.sub}>{subLine}</Text>
        </View>
        <Text style={styles.toggle}>{t(open ? 'library.hideChapters' : 'library.showChapters')}</Text>
      </Pressable>

      {open && (
        <View style={styles.chapters}>
          {group.stories.map((story) => (
            <StoryRow
              key={story.id}
              story={story}
              showChapter
              onOpen={() => onOpen(story)}
              onFavorite={() => onFavorite(story)}
              onDelete={() => onDelete(story)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch },
  headerText: { flex: 1, gap: spacing.xs },
  title: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: fonts.small },
  toggle: { color: colors.amber, fontSize: fonts.small },
  chapters: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
});
