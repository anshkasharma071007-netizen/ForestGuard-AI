import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { InputField } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { validateCitizenPhone } from '@/services/api';
import { spacing } from '@/theme';

export default function Onboarding() {
  const { verify, signOut, logoutNotice, logoutPending } = useCitizen();
  const [register, setRegister] = useState(true);
  const [verification, setVerification] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const advancing = useRef(false);
  const [error, setError] = useState('');

  async function advance() {
    if (advancing.current) return;
    setError('');
    if (!verification) {
      if (phone.length !== 10 || !/^[6-9][0-9]{9}$/.test(phone)) {
        setError('Enter 10 digits starting with 6, 7, 8 or 9.');
        return;
      }
      if (register && !name.trim()) {
        setError('Enter your full name.');
        return;
      }
    } else if (!/^[0-9]{4}$/.test(code.trim())) {
      setError('Enter the four-digit verification code.');
      return;
    }

    advancing.current = true;
    setBusy(true);
    try {
      if (verification) {
        await verify({ phone, code: code.trim(), ...(register ? {
          name: name.trim(), email: email.trim() || undefined,
        } : {}) });
      } else {
        await validateCitizenPhone(phone);
        setVerification(true);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not continue. Try again.');
    } finally {
      advancing.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader />
      {logoutPending ? (
        <View style={{ gap: spacing.md }}>
          <ScreenHeader title="Sign out" />
          <SupportingText error={!!logoutNotice}>{logoutNotice || 'Finishing sign-out…'}</SupportingText>
          {!!logoutNotice && <PrimaryButton label="Retry sign-out" onPress={() => void signOut()} />}
        </View>
      ) : (
        <>
          <ScreenHeader title={verification ? 'Verify phone' : register ? 'Create your account' : 'Sign in'} />
          <View style={{ gap: spacing.md }}>
            {!!logoutNotice && <SupportingText error>{logoutNotice}</SupportingText>}
            {verification ? (
              <InputField label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad"
                autoComplete="one-time-code" maxLength={4} editable={!busy} />
            ) : (
              <>
                {register && <InputField label="Full name" value={name} onChangeText={setName} editable={!busy}
                  autoComplete="name" autoCapitalize="words" maxLength={120} />}
                <InputField label="Phone number" prefix="+91" value={phone} onChangeText={setPhone} keyboardType="number-pad"
                  editable={!busy} autoComplete="tel-national" hint="Enter your 10-digit Indian mobile number." />
                {register && <InputField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address"
                  editable={!busy} autoCapitalize="none" autoComplete="email" maxLength={254} />}
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
        </>
      )}
    </Screen>
  );
}
