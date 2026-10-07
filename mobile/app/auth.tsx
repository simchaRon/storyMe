import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { useAuth } from '../src/auth/AuthContext';
import { Lang } from '../src/i18n/direction';
import { colors, fonts, radius, spacing, touch } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { LanguageSwitch } from '../src/ui/LanguageSwitch';
import { Logo } from '../src/ui/Logo';
import { Screen } from '../src/ui/Screen';

// Login and register on one screen. The user switches between the two with a link.
export default function AuthScreen() {
  const { t, i18n } = useTranslation();
  const { status, signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href="/" />;

  const isLogin = mode === 'login';

  async function submit() {
    const cleanEmail = email.trim();
    if (!cleanEmail.includes('@') || password.length < (isLogin ? 1 : 8)) {
      setError(t('auth.fillAll'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { access_token } = isLogin
        ? await api.login(cleanEmail, password)
        : await api.register(cleanEmail, password, i18n.language as Lang);
      await signIn(access_token);
    } catch (e) {
      setError(
        errorMessage(t, e, isLogin ? { 401: 'auth.wrongCredentials' } : { 409: 'auth.emailTaken' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={false}>
      <View style={styles.hero}>
        <Logo size={96} />
        <Text accessibilityRole="header" style={styles.title}>
          {t('app.title')}
        </Text>
        <Text style={styles.tagline}>{t('app.tagline')}</Text>
      </View>

      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>
          {t(isLogin ? 'auth.loginTitle' : 'auth.registerTitle')}
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel={t('auth.email')}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.password')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            textContentType={isLogin ? 'password' : 'newPassword'}
            accessibilityLabel={t('auth.password')}
            onSubmitEditing={() => void submit()}
            placeholderTextColor={colors.textMuted}
          />
          {!isLogin && <Text style={styles.hint}>{t('auth.passwordHint')}</Text>}
        </View>

        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}

        <Button
          label={busy ? t('common.loading') : t(isLogin ? 'auth.login' : 'auth.register')}
          disabled={busy}
          onPress={() => void submit()}
        />
        {isLogin && (
          <Link href="/forgot-password" accessibilityRole="link" style={styles.forgot}>
            {t('auth.forgotLink')}
          </Link>
        )}
        <Button
          label={t(isLogin ? 'auth.switchToRegister' : 'auth.switchToLogin')}
          variant="secondary"
          disabled={busy}
          onPress={() => {
            setMode(isLogin ? 'register' : 'login');
            setError(null);
          }}
        />
      </Card>

      <Card>
        <LanguageSwitch />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  title: { color: colors.text, fontSize: fonts.hero, fontWeight: '800' },
  tagline: { color: colors.amber, fontSize: fonts.body, textAlign: 'center' },
  card: { gap: spacing.md },
  heading: { color: colors.text, fontSize: fonts.title, fontWeight: '700' },
  field: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: fonts.small },
  hint: { color: colors.textMuted, fontSize: fonts.small },
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
  error: { color: colors.danger, fontSize: fonts.body },
  forgot: { color: colors.amber, fontSize: fonts.body, textAlign: 'center', paddingVertical: spacing.sm },
});
