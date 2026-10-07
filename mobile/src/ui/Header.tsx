import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { colors, fonts, spacing, touch } from '../theme';
import { LanguageButton, RestartNote, useLanguageToggle } from './LanguageButton';
import { Logo } from './Logo';

/** Top bar: logo and title on one side, a language button and a Settings (or Back) button on the other. */
export function Header({ back }: { back?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, user, signOut } = useAuth();
  const language = useLanguageToggle();

  return (
    <View style={styles.wrap}>
    <View style={styles.bar}>
      <View style={styles.brand}>
        <Logo size={36} />
        <Text style={styles.title}>{t('app.title')}</Text>
      </View>
      <View style={styles.actions}>
      <LanguageButton toggle={language} />
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
    </View>
    {status === 'signedIn' && user && (
      <View style={styles.account}>
        <Text style={styles.email} numberOfLines={1}>
          {t('settings.signedInAs')} {user.email}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings.logout')} onPress={() => void signOut()} style={styles.action}>
          <Text style={styles.logoutText}>{t('settings.logout')}</Text>
        </Pressable>
      </View>
    )}
    <RestartNote toggle={language} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: fonts.body, fontWeight: '700' },
  action: { minHeight: touch, justifyContent: 'center', paddingHorizontal: spacing.sm },
  account: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  email: { flex: 1, color: colors.textMuted, fontSize: fonts.small },
  logoutText: { color: colors.danger, fontSize: fonts.small },
  actionText: { color: colors.amber, fontSize: fonts.body },
});
