import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { Mail, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { InputField } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Surface } from '@/components/Surface';
import { TextAction } from '@/components/TextAction';
import { sendCitizenCode } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';

export default function Onboarding() {
  const { t, errorText } = useLanguage();
  const { verify, signOut, logoutNotice, logoutPending } = useCitizen();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const advancing = useRef(false);
  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!sentTo || !waitSeconds) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [now, sentTo, waitSeconds]);

  async function advance(verifyCode: boolean) {
    if (advancing.current) return;
    setError('');
    const address = email.trim();
    if (!verifyCode && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    if (verifyCode && !/^[0-9]{6}$/.test(code)) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    advancing.current = true;
    setBusy(true);
    try {
      if (verifyCode) {
        await verify({ email: sentTo, code });
      } else {
        const retryAfter = await sendCitizenCode(address);
        const requestedAt = Date.now();
        setResendAt(requestedAt + retryAfter * 1000);
        setNow(requestedAt);
        setSentTo(address);
        setCode('');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not continue. Try again.');
    } finally {
      advancing.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen header={<ScreenHeader />}>
      <View style={styles.layout}>
        <Surface style={styles.form}>
          <LanguageSwitcher />
          <View style={[styles.icon, { backgroundColor: colors.softAccent }]}>
            {sentTo ? <ShieldCheck size={25} color={colors.accent} /> : <Mail size={25} color={colors.accent} />}
          </View>
          <Text accessibilityRole="header" style={[typeScale.screen, { color: colors.primaryText }]}>
            {logoutPending ? t('Sign out') : sentTo ? t('Check your email') : t('Sign in with email')}
          </Text>
          {!!logoutNotice && <SupportingText error>{errorText(logoutNotice)}</SupportingText>}
          {logoutPending ? (
            logoutNotice ? <PrimaryButton label={t('Retry sign-out')} onPress={() => void signOut()} />
              : <SupportingText>{t('Finishing sign-out…')}</SupportingText>
          ) : <>
            {sentTo ? <>
              <SupportingText>{t('We sent a six-digit code to {email}. It expires in five minutes.', { email: sentTo })}</SupportingText>
              <InputField label={t('Verification code')} value={code} onChangeText={input => setCode(input.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy}
                placeholder={t('6-digit code')} returnKeyType="done" onSubmitEditing={() => void advance(true)} />
            </> : <InputField label={t('Email address')} value={email} onChangeText={setEmail} keyboardType="email-address"
              editable={!busy} autoCapitalize="none" autoComplete="email" maxLength={254}
              placeholder="you@example.com" returnKeyType="go" onSubmitEditing={() => void advance(false)} />}
            {!!error && <SupportingText error>{errorText(error)}</SupportingText>}
            <PrimaryButton label={sentTo ? t('Verify code') : t('Send code')} onPress={() => void advance(Boolean(sentTo))} loading={busy} />
            {!!sentTo && <>
              <TextAction label={waitSeconds ? t('Resend code in {seconds}s', { seconds: waitSeconds }) : t('Resend code')}
                disabled={busy || !!waitSeconds} onPress={() => void advance(false)} />
              <TextAction label={t('Use a different email')} disabled={busy} onPress={() => { setSentTo(''); setError(''); setCode(''); }} />
            </>}
          </>}
        </Surface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  layout: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingTop: spacing.lg },
  form: { padding: spacing.lg, gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
});
