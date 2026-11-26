import { useState } from 'react';
import { View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { InputField } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { spacing } from '@/theme';

export default function Onboarding() {
  const { verify } = useCitizen();
  const [register, setRegister] = useState(true);
  const [verification, setVerification] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function advance() {
    setError('');
    if (!verification) {
      if (!phone.trim() || (register && !name.trim())) {
        setError('Enter your phone number' + (register ? ' and full name.' : '.'));
        return;
      }
      setVerification(true);
      return;
    }
    if (!/^\d{4}$/.test(code.trim())) {
      setError('Enter the four-digit verification code.');
      return;
    }
    setBusy(true);
    try {
      await verify({ phone: phone.trim(), code: code.trim(), ...(register ? {
        name: name.trim(), email: email.trim() || undefined,
      } : {}) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader />
      <ScreenHeader title={verification ? 'Verify phone' : register ? 'Create your account' : 'Sign in'} />
      <View style={{ gap: spacing.md }}>
        {verification ? (
          <InputField label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad"
            autoComplete="one-time-code" maxLength={4} editable={!busy} />
        ) : (
          <>
            {register && <InputField label="Full name" value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" maxLength={120} />}
            <InputField label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel"
              hint="Include a country code for numbers outside India." maxLength={40} />
            {register && <InputField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address"
              autoCapitalize="none" autoComplete="email" maxLength={254} />}
          </>
        )}
        {!!error && <SupportingText error>{error}</SupportingText>}
        <PrimaryButton label={verification ? 'Verify phone' : 'Continue'} onPress={() => void advance()} loading={busy} />
        <TextAction label={verification ? 'Edit phone or account details' : register ? 'Already have an account? Sign in' : 'Create an account'}
          disabled={busy} onPress={() => {
            setError('');
            setCode('');
            if (verification) setVerification(false);
            else setRegister(!register);
          }} />
      </View>
    </Screen>
  );
}
