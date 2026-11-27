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
  const { profile, save, saveLocation, signOut } = useCitizen();
  const { colors } = useTheme();
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [location, setLocation] = useState<LocationChoice | null>(setup ? null : profile?.savedAlertLocation ?? null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function perform(action: () => Promise<void>, message: string) {
    setError('');
    setSaved('');
    setSaving(true);
    try {
      await action();
      setSaved(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;
  return (
    <Screen tab={!setup}>
      <ScreenHeader title={setup ? 'Set your location' : 'Profile'} />
      <View style={{ gap: spacing.md }}>
        {!setup && (
          <>
            <View style={{ alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: 28, backgroundColor: colors.successTint }}>
              <UserRound size={26} color={colors.accent} />
            </View>
            <InputField label="Full name" value={name} onChangeText={setName}
              editable={!saving} autoCapitalize="words" maxLength={120} />
            <InputField label="Phone number" value={profile.phone} editable={false} />
            <InputField label="Email (optional)" value={email} onChangeText={setEmail}
              editable={!saving} keyboardType="email-address" autoCapitalize="none" maxLength={254} />
            <PrimaryButton label="Save personal information" disabled={saving || locating || !name.trim()}
              onPress={() => void perform(() => save({ name: name.trim(), email: email.trim() || null }), 'Personal information saved.')} />
            <SectionTitle title="Saved location" />
            <SupportingText>{profile.savedAlertLocation?.type === 'village' ? profile.savedAlertLocation.village.name
              : profile.savedAlertLocation ? 'GPS location saved' : 'No saved location'}</SupportingText>
          </>
        )}
        <LocationField key={setup ? 'setup' : String(Boolean(profile.savedAlertLocation))} label="Saved location"
          value={location} onChange={(value) => { setLocation(value); setSaved(''); }}
          onLocating={setLocating} disabled={saving} />
        {!!error && <SupportingText error>{error}</SupportingText>}
        {!!saved && <SupportingText>{saved}</SupportingText>}
        <PrimaryButton label={setup ? 'Save location and continue' : 'Save location'} onPress={() => {
          if (!location) return;
          const input = locationInput(location);
          void perform(() => setup ? save({ name: name.trim(), email: email.trim() || null, location: input })
            : saveLocation(input), 'Alert location saved.');
        }} loading={saving} disabled={saving || locating || !location} />
        {!setup && profile.savedAlertLocation && <TextAction label="Remove saved location" disabled={saving || locating}
          onPress={() => void perform(async () => {
            await saveLocation(null);
            setLocation(null);
          }, 'Saved location removed.')} />}
        {!setup && <NavigationRow label="Appearance" icon={Moon} onPress={() => router.push('/settings')} disabled={saving} />}
        <TextAction label="Sign out" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
