import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Logo } from '../src/ui/Logo';
import { RequireAuth } from '../src/ui/RequireAuth';
import { Screen } from '../src/ui/Screen';

// Home screen: create a story, or open the library.
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <RequireAuth>
      <Screen>
        <View style={styles.hero}>
          <Logo size={120} />
          <Text accessibilityRole="header" style={styles.title}>
            {t('app.title')}
          </Text>
          <Text style={styles.tagline}>{t('app.tagline')}</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.welcome}>{t('home.welcome')}</Text>
          <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
          <Button label={t('home.create')} onPress={() => router.push('/create')} />
          <Button label={t('home.library')} variant="secondary" onPress={() => router.push('/library')} />
        </Card>
      </Screen>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  title: { color: colors.text, fontSize: fonts.hero, fontWeight: '800' },
  tagline: { color: colors.amber, fontSize: fonts.body, textAlign: 'center' },
  card: { gap: spacing.md },
  welcome: { color: colors.text, fontSize: fonts.title, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fonts.body },
});
