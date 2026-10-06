import { Redirect } from 'expo-router';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { colors, fonts, spacing } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Screen } from './Screen';

/** Wrap a screen that needs a logged-in user. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retry } = useAuth();
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <View style={styles.center} accessibilityLabel={t('common.loading')}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }
  if (status === 'signedOut') return <Redirect href="/auth" />;
  if (status === 'offline') {
    return (
      <Screen header={false}>
        <Card style={styles.card}>
          <Text style={styles.text}>{t('errors.network')}</Text>
          <Button label={t('errors.retry')} onPress={() => void retry()} />
        </Card>
      </Screen>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  card: { gap: spacing.md, marginTop: spacing.xl },
  text: { color: colors.text, fontSize: fonts.body },
});
