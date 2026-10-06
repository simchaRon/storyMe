import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { colors, fonts, spacing, touch } from '../theme';
import { Logo } from './Logo';

/** Top bar: logo and title on one side, a Settings (or Back) button on the other. */
export function Header({ back }: { back?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { status } = useAuth();

  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        <Logo size={36} />
        <Text style={styles.title}>{t('app.title')}</Text>
      </View>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.action}
        >
          <Text style={styles.actionText}>{t('common.back')}</Text>
        </Pressable>
      ) : status === 'signedIn' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          onPress={() => router.push('/settings')}
          style={styles.action}
        >
          <Text style={styles.actionText}>{t('settings.title')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  action: { minHeight: touch, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { color: colors.amber, fontSize: fonts.body },
});
