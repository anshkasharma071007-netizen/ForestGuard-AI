import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/i18n';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { InputField } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { LocationField, locationInput, type LocationChoice } from '@/components/LocationField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Surface } from '@/components/Surface';
import { TextAction } from '@/components/TextAction';
import { spacing } from '@/theme';

export function CitizenProfileForm({ setup = false, section = 'location' }: { setup?: boolean; section?: 'personal' | 'location' }) {
  const { t, errorText } = useLanguage();
  const { profile, save, saveLocation, signOut } = useCitizen();
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [location, setLocation] = useState<LocationChoice | null>(setup ? null : profile?.savedAlertLocation ?? null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const pending = useRef(false);
  const personal = section === 'personal';

  async function perform(action: () => Promise<void>, message: string) {
    if (pending.current) return;
    pending.current = true;
    setError('');
    setSaved('');
    setSaving(true);
    try {
      await action();
      setSaved(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your profile.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  if (!profile) return null;
  const title = setup ? 'Set up your profile' : personal ? 'Personal information' : 'Saved location';

  return <Screen header={<ScreenHeader title={t(title)} back={!setup} />}>
    <View style={{ gap: spacing.md }}>
      {setup && <LanguageSwitcher />}
      {setup && <Feedback title={t('Welcome to Van Saathi')} detail={t('Enter your name and choose a location for nearby wildlife alerts.')} />}
      <Surface>
        {(setup || personal) && <InputField label={t('Full name')} value={name}
          onChangeText={value => { setName(value); setSaved(''); }} editable={!saving} autoCapitalize="words" autoComplete="name" maxLength={120} />}
        {personal ? <>
          <InputField label={t('Mobile number (optional)')} value={phone} onChangeText={value => { setPhone(value); setSaved(''); }}
            keyboardType="phone-pad" autoComplete="tel" editable={!saving} maxLength={16} />
          <InputField label={t('Sign-in email')} value={profile.email ?? ''} editable={false}
            hint={profile.emailVerified ? t('Verified email address') : undefined} />
        </> : <>
          {!setup && <SupportingText>{t('Your saved location is used to find nearby wildlife alerts.')}</SupportingText>}
          <LocationField label={t('Saved location')} value={location} onChange={value => { setLocation(value); setSaved(''); }}
            onLocating={setLocating} disabled={saving} />
        </>}
      </Surface>
      {!!error && <SupportingText error>{errorText(error)}</SupportingText>}
      {!!saved && <SupportingText>{t(saved)}</SupportingText>}
      {personal ? <PrimaryButton label={t('Save personal information')} loading={saving} disabled={!name.trim()}
        onPress={() => void perform(() => save({ name: name.trim(), phone: phone.trim() || null }), 'Personal information saved.')} />
        : <PrimaryButton label={setup ? t('Save location and continue') : t('Save location')}
          loading={saving} disabled={locating || !location || (setup && !name.trim())} onPress={() => {
            if (!location) return;
            const input = locationInput(location);
            void perform(() => setup ? save({ name: name.trim(), location: input }) : saveLocation(input), 'Alert location saved.');
          }} />}
      {!setup && !personal && profile.savedAlertLocation && <TextAction label={t('Remove saved location')} disabled={saving || locating}
        onPress={() => void perform(async () => { await saveLocation(null); setLocation(null); }, 'Saved location removed.')} />}
      {setup && <TextAction label={t('Sign out')} onPress={() => void signOut()} />}
    </View>
  </Screen>;
}
