import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiError } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { colors, fonts, radius, spacing, touch } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Screen } from '../src/ui/Screen';

/** The page the e-mail link opens: `/reset-password?token=...`. The user chooses a new password. */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkBad, setLinkBad] = useState(false); // the server said the link is not valid

  async function submit() {
    if (password.length < 8) return setError(t('auth.passwordShort'));
    if (password !== again) return setError(t('auth.passwordsDiffer'));
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setLinkBad(e instanceof ApiError && e.status === 400);
      setError(errorMessage(t, e, { 400: 'auth.resetInvalid' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>
          {t('auth.resetTitle')}
        </Text>

        {done ? (
          <>
            <Text accessibilityRole="alert" style={styles.ok}>
              {t('auth.resetDone')}
            </Text>
            <Link href="/auth" accessibilityRole="link" style={styles.link}>
              {t('auth.backToLogin')}
            </Link>
          </>
        ) : !token ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              {t('auth.resetInvalid')}
            </Text>
            <Link href="/forgot-password" accessibilityRole="link" style={styles.link}>
              {t('auth.askNewLink')}
            </Link>
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.newPassword')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={t('auth.newPassword')}
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.hint}>{t('auth.passwordHint')}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.repeatPassword')}</Text>
              <TextInput
                style={styles.input}
                value={again}
                onChangeText={setAgain}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={t('auth.repeatPassword')}
                onSubmitEditing={() => void submit()}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Button label={busy ? t('common.loading') : t('auth.savePassword')} disabled={busy} onPress={() => void submit()} />
            {linkBad && (
              <Link href="/forgot-password" accessibilityRole="link" style={styles.link}>
                {t('auth.askNewLink')}
              </Link>
            )}
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  heading: { color: colors.text, fontSize: fonts.title, fontWeight: '700' },
  ok: { color: colors.amber, fontSize: fonts.body },
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
  link: { color: colors.amber, fontSize: fonts.body, textAlign: 'center', paddingVertical: spacing.sm },
});
