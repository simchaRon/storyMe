import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../src/api/client';
import { errorMessage } from '../src/api/errorMessage';
import { colors, fonts, radius, spacing, touch } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Screen } from '../src/ui/Screen';

/** "Forgot your password?": the user types an email and gets a link to choose a new password. */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const clean = email.trim();
    if (!clean.includes('@')) {
      setError(t('auth.fillAll'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(clean);
      setSent(true); // the same message for every email: we never say whether the email has an account
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>
          {t('auth.forgotTitle')}
        </Text>

        {sent ? (
          <Text accessibilityRole="alert" style={styles.ok}>
            {t('auth.linkSent')}
          </Text>
        ) : (
          <>
            <Text style={styles.note}>{t('auth.forgotText')}</Text>
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
                onSubmitEditing={() => void submit()}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Button label={busy ? t('common.loading') : t('auth.sendLink')} disabled={busy} onPress={() => void submit()} />
          </>
        )}

        <Link href="/auth" accessibilityRole="link" style={styles.link}>
          {t('auth.backToLogin')}
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  heading: { color: colors.text, fontSize: fonts.title, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: fonts.body },
  ok: { color: colors.amber, fontSize: fonts.body },
  field: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: fonts.small },
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
