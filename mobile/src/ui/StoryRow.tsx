import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StorySummary } from '../api/client';
import { colors, fonts, radius, spacing, touch } from '../theme';

type Props = {
  story: StorySummary;
  onOpen: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  /** Show "Chapter N" even for chapter 1 (used inside a series). */
  showChapter?: boolean;
};

/** One story in the library: tap the text to open it, the heart to favorite it, Delete to remove it. */
export function StoryRow({ story, onOpen, onFavorite, onDelete, showChapter }: Props) {
  const { t } = useTranslation();
  const rtl = story.language === 'he';
  const chapterLabel = story.chapter_number > 1 || showChapter ? t('story.chapter', { n: story.chapter_number }) : null;

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={story.title} onPress={onOpen} style={styles.main}>
        <Text style={[styles.title, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
          {story.title}
        </Text>
        <View style={styles.badges}>
          {chapterLabel && <Text style={styles.badge}>{chapterLabel}</Text>}
          {story.is_torah_story && <Text style={styles.badge}>{t('library.torah')}</Text>}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(story.is_favorite ? 'library.favoriteRemove' : 'library.favoriteAdd')}
          onPress={onFavorite}
          style={styles.heartButton}
        >
          <Text
            style={[styles.heart, story.is_favorite && styles.heartOn]}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            {story.is_favorite ? '♥' : '♡'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('library.deleteStory')}: ${story.title}`}
          hitSlop={8}
          onPress={onDelete}
          style={styles.deleteButton}
        >
          <Text style={styles.delete}>{t('settings.confirmDelete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: { flex: 1, minHeight: touch, justifyContent: 'center', gap: spacing.xs },
  title: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    color: colors.amber,
    fontSize: fonts.small,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  actions: { alignItems: 'center', gap: spacing.xs },
  heartButton: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  heart: { color: colors.textMuted, fontSize: 28 },
  heartOn: { color: colors.amber },
  deleteButton: { minHeight: touch, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  delete: { color: colors.danger, fontSize: fonts.small },
});
