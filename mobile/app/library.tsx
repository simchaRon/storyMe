import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { api, ApiError, StorySummary } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { applyPending, groupSeries, mergePage, PendingFavorite, updateStory } from '../src/library';
import { colors, fonts, radius, spacing, touch } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { confirm } from '../src/ui/confirm';
import { RequireAuth } from '../src/ui/RequireAuth';
import { Screen } from '../src/ui/Screen';
import { SeriesCard } from '../src/ui/SeriesCard';
import { StoryRow } from '../src/ui/StoryRow';

const PAGE_SIZE = 30;
type Tab = 'all' | 'favorites';

export default function LibraryScreen() {
  return (
    <RequireAuth>
      <LibraryContent />
    </RequireAuth>
  );
}

function LibraryContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const twoColumns = width >= 800; // phones: one column. Wide web screens: two.

  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<StorySummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0); // number of the newest request. Older answers are ignored.
  const itemsRef = useRef<StorySummary[]>([]);
  itemsRef.current = items;
  const pending = useRef(new Map<number, PendingFavorite>()); // heart changes on their way to the server
  const lastLoad = useRef<'reset' | 'more'>('reset'); // what "Try again" repeats

  /**
   * Load the first `size` stories (reset) or the next page.
   * Answers from older requests are ignored, so a fast tab switch cannot show the wrong list.
   */
  const load = useCallback(
    async (which: Tab, reset: boolean, size: number = PAGE_SIZE) => {
      const mine = ++latest.current;
      const startedAt = Date.now();
      lastLoad.current = reset ? 'reset' : 'more';
      setError(null);
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const page = await api.listStories({
          favorites: which === 'favorites',
          limit: size,
          offset: reset ? 0 : itemsRef.current.length,
        });
        if (mine !== latest.current) return;
        // Heart taps that the server has not answered yet stay on screen.
        let fresh = applyPending(page, pending.current, startedAt);
        if (which === 'favorites') fresh = fresh.filter((s) => s.is_favorite);
        setItems((old) => mergePage(old, fresh, reset));
        setHasMore(page.length === size);
      } catch (e) {
        if (mine !== latest.current || (e instanceof ApiError && e.status === -1)) return;
        setError(errorMessage(t, e));
      } finally {
        if (mine === latest.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [t],
  );

  // Load when the screen opens, when the user comes back to it, and when the tab changes.
  // On coming back, load as many stories as were already on screen (up to 100), so the list does not shrink.
  useFocusEffect(
    useCallback(() => {
      const size = Math.min(100, Math.max(PAGE_SIZE, itemsRef.current.length));
      void load(tab, true, size);
      return () => {
        latest.current++; // ignore answers that arrive after the screen lost focus
      };
    }, [load, tab]),
  );

  function selectTab(next: Tab) {
    if (next === tab) return;
    setItems([]); // do not show the other tab's stories while the new tab loads
    setHasMore(false);
    setTab(next);
  }

  const open = (story: StorySummary) =>
    router.push({ pathname: '/story/[id]', params: { id: String(story.id) } });

  async function toggleFavorite(story: StorySummary) {
    const waiting = pending.current.get(story.id);
    if (waiting && waiting.doneAt === null) return; // the last tap on this heart is still on its way
    const next = !story.is_favorite;
    pending.current.set(story.id, { value: next, doneAt: null });
    setError(null);
    // Show the change at once. In the Favorites tab an un-hearted story leaves the list.
    setItems((old) =>
      tab === 'favorites' && !next ? old.filter((s) => s.id !== story.id) : updateStory(old, story.id, { is_favorite: next }),
    );
    try {
      await api.setFavorite(story.id, next);
      pending.current.set(story.id, { value: next, doneAt: Date.now() });
    } catch (e) {
      pending.current.delete(story.id);
      await load(tab, true, Math.min(100, Math.max(PAGE_SIZE, itemsRef.current.length))); // back to what the server has
      setError(errorMessage(t, e)); // after the reload, because a reload clears the error
    }
  }

  async function remove(story: StorySummary) {
    const ok = await confirm(t('library.deleteTitle'), t('library.deleteMessage'), t('settings.confirmDelete'), t('common.cancel'));
    if (!ok) return;
    try {
      await api.deleteStory(story.id);
      pending.current.delete(story.id);
      void load(tab, true, Math.min(100, Math.max(PAGE_SIZE, itemsRef.current.length)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        void load(tab, true); // it was already deleted: just refresh
      } else {
        setError(errorMessage(t, e));
      }
    }
  }

  /** "Try again" repeats the last thing that failed. A failed "load more" keeps the pages already loaded. */
  function retry() {
    void load(tab, lastLoad.current === 'reset');
  }

  const groups = useMemo(() => (tab === 'all' ? groupSeries(items) : []), [items, tab]);
  const cellStyle = twoColumns ? styles.cellTwo : styles.cellOne;

  return (
    <Screen back wide>
      <Text accessibilityRole="header" style={styles.title}>
        {t('home.library')}
      </Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['all', 'favorites'] as Tab[]).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => selectTab(id)}
            style={[styles.tab, tab === id && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>
              {t(id === 'all' ? 'library.tabAll' : 'library.tabFavorites')}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <Card style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          <Button label={t('errors.retry')} onPress={retry} />
        </Card>
      )}

      {loading && items.length === 0 && !error && <ActivityIndicator color={colors.amber} />}

      {!loading && !error && items.length === 0 && (
        <Card style={styles.card}>
          <Text style={styles.empty}>{t(tab === 'all' ? 'library.emptyAll' : 'library.emptyFavorites')}</Text>
          {tab === 'all' && <Button label={t('home.create')} variant="accent" onPress={() => router.push('/create')} />}
        </Card>
      )}

      <View style={styles.grid}>
        {tab === 'all'
          ? groups.map((group) => (
              <View key={group.key} style={cellStyle}>
                {group.stories.length === 1 ? (
                  <Card>
                    <StoryRow
                      story={group.stories[0]}
                      onOpen={() => open(group.stories[0])}
                      onFavorite={() => void toggleFavorite(group.stories[0])}
                      onDelete={() => void remove(group.stories[0])}
                    />
                  </Card>
                ) : (
                  <SeriesCard
                    group={group}
                    onOpen={open}
                    onFavorite={(s) => void toggleFavorite(s)}
                    onDelete={(s) => void remove(s)}
                  />
                )}
              </View>
            ))
          : items.map((story) => (
              <View key={story.id} style={cellStyle}>
                <Card>
                  <StoryRow
                    story={story}
                    onOpen={() => open(story)}
                    onFavorite={() => void toggleFavorite(story)}
                    onDelete={() => void remove(story)}
                  />
                </Card>
              </View>
            ))}
      </View>

      {hasMore && !loading && (
        <Button
          label={loadingMore ? t('common.loading') : t('library.loadMore')}
          variant="secondary"
          disabled={loadingMore}
          onPress={() => void load(tab, false)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fonts.title, fontWeight: '800' },
  card: { gap: spacing.md },
  error: { color: colors.danger, fontSize: fonts.body },
  empty: { color: colors.textMuted, fontSize: fonts.body },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    minHeight: touch,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  tabText: { color: colors.text, fontSize: fonts.body },
  tabTextOn: { color: colors.onPrimary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cellOne: { width: '100%' },
  cellTwo: { width: '48.5%' },
});
