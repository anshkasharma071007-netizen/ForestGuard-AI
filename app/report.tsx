import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ChevronDown } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { VillageSelector } from '@/components/VillageSelector';
import { speciesOptions } from '@/data';
import { isApiConfigured, submitCommunityReport, type ReportSubmissionResponse, type Village } from '@/services/api';
import { saveStoredReport } from '@/services/report-storage';
import { radius, spacing, typography, useTheme } from '@/theme';

const categories = [
  { id: 'sighting', label: 'Animal sighting' },
  { id: 'conflict', label: 'Human-wildlife conflict' },
] as const;
const locationMethods = [
  { id: 'gps', label: 'Use my current location' },
  { id: 'village', label: 'Choose a village' },
] as const;

type Category = typeof categories[number]['id'];
type Species = typeof speciesOptions[number]['id'];
type LocationMethod = typeof locationMethods[number]['id'];
const availableLocationMethods = Platform.OS === 'web' ? locationMethods.filter(({ id }) => id === 'village') : locationMethods;
type PhotoAsset = ImagePicker.ImagePickerAsset;
type Coordinates = { lat: number; lon: number };

export default function ReportScreen() {
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category>('sighting');
  const [species, setSpecies] = useState<Species>('unidentified');
  const [showSpecies, setShowSpecies] = useState(false);
  const [photo, setPhoto] = useState<PhotoAsset | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [picking, setPicking] = useState(false);
  const [method, setMethod] = useState<LocationMethod | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [village, setVillage] = useState<Village | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ response: ReportSubmissionResponse; saved: boolean } | null>(null);
  const submissionInProgress = useRef(false);

  function changeMethod(next: LocationMethod) {
    if (next === method) return;
    setCoordinates(null);
    setVillage(null);
    setLocationError('');
    setMethod(next);
    if (next === 'gps') void captureLocation();
  }

  async function captureLocation() {
    setLocating(true);
    setCoordinates(null);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('Location permission was not granted. Choose a village instead.');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocationError('Location services are unavailable. Choose a village instead.');
        return;
      }
      const { coords } = await getCurrentPositionWithTimeout();
      setCoordinates({ lat: coords.latitude, lon: coords.longitude });
    } catch {
      setLocationError('Location could not be captured. Try again or choose a village.');
    } finally {
      setLocating(false);
    }
  }

  async function choosePhoto(source: 'camera' | 'gallery') {
    setPhotoError('');
    setPicking(true);
    try {
      if (Platform.OS !== 'web') {
        const permission = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          setPhotoError(source === 'camera' ? 'Camera permission was not granted.' : 'Photo library permission was not granted.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.75 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) setPhoto(result.assets[0]);
    } catch {
      setPhotoError('The photo could not be selected. Please try again.');
    } finally {
      setPicking(false);
    }
  }

  async function submitReport() {
    if (submissionInProgress.current || locating || picking || confirmation) return;
    setError('');
    if (!reporterName.trim()) { setError('Enter your name before submitting.'); return; }
    if (description.trim().length < 12) { setError('Description must be at least 12 characters.'); return; }
    if (!isApiConfigured) { setError('Reporting is unavailable. Your report was not sent.'); return; }
    const reportCoordinates = method === 'gps' ? coordinates : null;
    const reportVillage = method === 'village' ? village : null;
    if (!reportCoordinates && !reportVillage) {
      setError('Capture the incident location or select a village before submitting.');
      return;
    }

    submissionInProgress.current = true;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('species', species);
      formData.append('description', description.trim());
      formData.append('reporter_name', reporterName.trim());
      if (contact.trim()) formData.append('contact', contact.trim());
      if (reportCoordinates) {
        formData.append('lat', String(reportCoordinates.lat));
        formData.append('lon', String(reportCoordinates.lon));
      } else if (reportVillage) {
        formData.append('village_code', reportVillage.code);
      }
      if (photo) await appendPhoto(formData, photo);

      const response = await submitCommunityReport(formData);
      let saved = true;
      try {
        const now = new Date().toISOString();
        await saveStoredReport({
          referenceCode: response.reference_code,
          status: response.status,
          submittedAt: now,
          statusCheckedAt: now,
        });
      } catch {
        saved = false;
      }
      setConfirmation({ response, saved });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The report could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
      submissionInProgress.current = false;
    }
  }

  if (confirmation) return <Confirmation {...confirmation} />;

  return (
    <Screen>
      <ScreenHeader title="Report an incident" back />
      <View style={styles.form}>
        <Text style={[styles.reminder, { backgroundColor: colors.warningTint, color: colors.primaryText }]}>
          Keep a safe distance. Never approach wildlife to take a photo.
        </Text>
        <View style={styles.field}>
          <FieldLabel label="Incident category" />
          <ChoiceList options={categories} selected={category} onSelect={setCategory} disabled={submitting} />
        </View>
        <View style={styles.field}>
          <FieldLabel label="Animal species" />
          <Pressable accessibilityRole="button" accessibilityLabel={`Animal species: ${speciesOptions.find((item) => item.id === species)?.label}`}
            accessibilityState={{ expanded: showSpecies, disabled: submitting }} disabled={submitting}
            onPress={() => setShowSpecies(!showSpecies)}
            style={[styles.selector, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <Text style={{ flex: 1, color: colors.primaryText }}>{speciesOptions.find((item) => item.id === species)?.label}</Text>
            <ChevronDown size={18} color={colors.primaryText} style={{ transform: [{ rotate: showSpecies ? '180deg' : '0deg' }] }} />
          </Pressable>
          {showSpecies && <ChoiceList options={speciesOptions} selected={species} onSelect={(id) => {
            setSpecies(id);
            setShowSpecies(false);
          }} disabled={submitting} />}
        </View>
        <View style={styles.field}>
          <FieldLabel label="Photo (optional)" />
          {photo && <Image accessibilityLabel="Attached incident photo" source={{ uri: photo.uri }} style={styles.preview} />}
          <View style={styles.actions}>
            {Platform.OS !== 'web' && <TextAction label={photo ? 'Retake photo' : 'Take photo'}
              onPress={() => void choosePhoto('camera')} disabled={submitting || picking} />}
            <TextAction label={photo ? 'Replace from library' : 'Choose from library'}
              onPress={() => void choosePhoto('gallery')} disabled={submitting || picking} />
            {photo && <TextAction label="Remove photo" onPress={() => { setPhoto(null); setPhotoError(''); }} disabled={submitting || picking} />}
          </View>
          {picking && <Text style={{ color: colors.secondaryText }}>Opening photo picker…</Text>}
          <ErrorText text={photoError} />
        </View>
        <View style={styles.field}>
          <FieldLabel label="Incident location" />
          <Text style={{ color: colors.secondaryText }}>{Platform.OS === 'web' ? 'GPS is unavailable in the browser.' : 'Use GPS only if you’re at the incident location.'}</Text>
          <ChoiceList options={availableLocationMethods} selected={method} onSelect={changeMethod} disabled={submitting || locating} />
          {method === 'gps' && (
            <>
              {locating ? <Text accessibilityLiveRegion="polite" style={{ color: colors.secondaryText }}>Finding location…</Text> :
                <TextAction label={coordinates ? 'Capture location again' : 'Retry GPS'} onPress={() => void captureLocation()} disabled={submitting} />}

              {coordinates && <Text style={{ color: colors.primaryText }}>GPS: {coordinates.lat.toFixed(5)}, {coordinates.lon.toFixed(5)}</Text>}
              <ErrorText text={locationError} />
            </>
          )}
          {method === 'village' && <VillageSelector selected={village} onSelect={setVillage} disabled={submitting} />}
        </View>
        <InputField label="Description" value={description} onChangeText={setDescription} editable={!submitting}
          multiline maxLength={4000} placeholder="Describe what you saw" />
        <Text style={{ color: colors.secondaryText }}>Minimum 12 characters</Text>
        <InputField label="Reporter name" value={reporterName} onChangeText={setReporterName} editable={!submitting}
          maxLength={120} autoCapitalize="words" />
        <InputField label="Contact (optional)" value={contact} onChangeText={setContact} editable={!submitting}
          maxLength={80} autoCapitalize="none" placeholder="Phone or email" />
        {!isApiConfigured && <Text style={{ color: colors.secondaryText }}>Reporting is unavailable.</Text>}
        <ErrorText text={error} />
        <PrimaryButton label={submitting ? 'Submitting report…' : 'Submit report'} onPress={() => void submitReport()}
          loading={submitting} disabled={locating || picking} />
      </View>
    </Screen>
  );
}

async function getCurrentPositionWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Location timed out.')), 12000);
  });
  try {
    return await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function appendPhoto(formData: FormData, photo: PhotoAsset) {
  const name = photo.fileName ?? 'wildlife-report.jpg';
  const type = photo.mimeType ?? 'image/jpeg';
  if (Platform.OS === 'web') {
    if (photo.file) {
      formData.append('image', photo.file, name);
      return;
    }
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error('The selected photo could not be prepared for upload.');
    formData.append('image', await response.blob(), name);
    return;
  }
  formData.append('image', { uri: photo.uri, name, type } as unknown as Blob);
}

function FieldLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.label, { color: colors.primaryText }]}>{label}</Text>;
}

function ErrorText({ text }: { text: string }) {
  const { colors } = useTheme();
  return text ? <Text accessibilityLiveRegion="polite" style={{ color: colors.clay, fontSize: 15 }}>{text}</Text> : null;
}

function InputField({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.mutedText}
        style={[styles.selector, styles.input, props.multiline && styles.description, {
          backgroundColor: colors.input, borderColor: colors.border, color: colors.primaryText,
        }]} />
    </View>
  );
}

function ChoiceList<T extends string>({ options, selected, onSelect, disabled }: {
  options: readonly { id: T; label: string }[];
  selected: T | null;
  onSelect: (id: T) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.field}>
      {options.map(({ id, label }) => (
        <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: selected === id, disabled }}
          onPress={() => onSelect(id)} disabled={disabled}
          style={[styles.selector, { borderColor: colors.border, backgroundColor: selected === id ? colors.successTint : colors.card }]}>
          <Text style={{ flex: 1, color: colors.primaryText, fontSize: 15, fontWeight: selected === id ? '700' : '400' }}>{label}</Text>
          {selected === id && <Text style={{ color: colors.secondaryText }}>Selected</Text>}
        </Pressable>
      ))}
    </View>
  );
}

function Confirmation({ response, saved }: { response: ReportSubmissionResponse; saved: boolean }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <ScreenHeader title="Report received" back />
      <View style={styles.form}>
        <Text style={{ color: colors.primaryText, fontSize: 16, lineHeight: 23 }}>
          {response.message || 'Forest officials can now review your report.'}
        </Text>
        <View style={[styles.reminder, { backgroundColor: colors.card, gap: spacing.sm }]}>
          <FieldLabel label="Reference code" />
          <Text selectable style={{ color: colors.primaryText, fontFamily: typography.mono, fontSize: 21 }}>{response.reference_code}</Text>
          <Text style={{ color: colors.secondaryText }}>Status: {response.status}</Text>
        </View>
        {!saved && <ErrorText text="The report was received, but its reference could not be saved on this device. Keep the reference code to check its status." />}
        <PrimaryButton label="View report history" onPress={() => router.dismissTo('/history')} />
        <TextAction label="Return to Home" onPress={() => router.dismissTo('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: 16, fontWeight: '700' },
  reminder: { borderRadius: radius.input, padding: spacing.md, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  selector: { minHeight: 48, borderRadius: radius.input, borderWidth: 1, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { fontSize: 16 },
  description: { minHeight: 110, textAlignVertical: 'top' },
  preview: { width: '100%', height: 190, borderRadius: radius.input },
});
