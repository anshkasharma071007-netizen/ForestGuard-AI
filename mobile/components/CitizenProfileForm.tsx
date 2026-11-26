import { router } from 'expo-router';
import { Moon, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { InputField, NavigationRow } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { LocationField, locationInput, type LocationChoice } from '@/components/LocationField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { TextAction } from '@/components/TextAction';
import { spacing, useTheme } from '@/theme';

export function CitizenProfileForm({ setup = false }: { setup?: boolean }) {
  const { profile, save, signOut } = useCitizen();
  const { colors } = useTheme();
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [location, setLocation] = useState<LocationChoice | null>(profile?.location ?? null);
  const [locating, setLocating] = useState(false);
  const [operation, setOperation] = useState<'save' | 'signout'>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit() {
    if (!location || !name.trim()) {
      setError('Enter your name and select a location.');
      return;
    }
    setError('');
    setSaved(false);
    setOperation('save');
    try {
      await save({ name: name.trim(), email: email.trim() || null, location: locationInput(location) });
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your profile.');
    } finally {
      setOperation(undefined);
    }
  }

  async function leave() {
    setError('');
    setOperation('signout');
    try { await signOut(); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not sign out.');
    } finally {
      setOperation(undefined);
    }
  }

  if (!profile) return null;
  return (
    <Screen tab={!setup}>
      <ScreenHeader />
      <ScreenHeader title={setup ? 'Set your location' : 'Profile'} />
      <View style={{ gap: spacing.md }}>
        {!setup && (
          <>
            <View style={{ alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: 28, backgroundColor: colors.successTint }}>
              <UserRound size={26} color={colors.accent} />
            </View>
            <InputField label="Full name" value={name} onChangeText={(value) => { setName(value); setSaved(false); }}
              editable={!operation} autoCapitalize="words" maxLength={120} />
            <InputField label="Phone number" value={profile.phone} editable={false} />
            <InputField label="Email (optional)" value={email} onChangeText={(value) => { setEmail(value); setSaved(false); }}
              editable={!operation} keyboardType="email-address" autoCapitalize="none" maxLength={254} />
            <SectionTitle title="Saved location" />
          </>
        )}
        <LocationField label="Saved location" value={location} onChange={(value) => { setLocation(value); setSaved(false); }}
          onLocating={setLocating} disabled={!!operation} />
        {!!error && <SupportingText error>{error}</SupportingText>}
        {saved && <SupportingText>Profile saved.</SupportingText>}
        <PrimaryButton label={setup ? 'Save location and continue' : 'Save profile'} onPress={() => void submit()}
          loading={operation === 'save'} disabled={!!operation || locating || !location} />
        {!setup && <NavigationRow label="Appearance" icon={Moon} onPress={() => router.push('/settings')} disabled={!!operation} />}
        <TextAction label="Sign out" onPress={() => void leave()} loading={operation === 'signout'} disabled={!!operation || locating} />
      </View>
    </Screen>
  );
}
