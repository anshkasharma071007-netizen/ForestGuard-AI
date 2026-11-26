import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Check, PawPrint, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { EvidenceImage } from '@/components/EvidenceImage';
import { IdentificationResult } from '@/components/IdentificationResult';
import { PhotoViewer } from '@/components/PhotoViewer';
import { SectionTitle } from '@/components/SectionTitle';
import { SpeciesSelector, type SpeciesSelection } from '@/components/SpeciesSelector';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { VillageSelector } from '@/components/VillageSelector';
import { speciesOptions, unknownSpecies, type CatalogSpecies } from '@/data';
import type { IdentificationState } from '@/identification';
import { getCommunitySpecies, isApiConfigured, submitCommunityReport, type ReportSubmissionResponse, type Village } from '@/services/api';
import { saveStoredReport } from '@/services/report-storage';
import { radius, sizing, spacing, typography, typeScale, useTheme } from '@/theme';

const categories = [
  { id: 'sighting', label: 'Animal Sighting', icon: PawPrint },
  { id: 'conflict', label: 'Human-Wildlife Conflict', icon: TriangleAlert },
] as const;
const locationMethods = [
  { id: 'gps', label: 'Use my current location' },
  { id: 'village', label: 'Choose a village' },
] as const;

type Category = typeof categories[number]['id'];
type LocationMethod = typeof locationMethods[number]['id'];
const availableLocationMethods = Platform.OS === 'web' ? locationMethods.filter(({ id }) => id === 'village') : locationMethods;
type PhotoAsset = ImagePicker.ImagePickerAsset;
type Attachment = { original: PhotoAsset; analysis: IdentificationState };
const descriptionLimit = 4000;
type Coordinates = { lat: number; lon: number };

export default function ReportScreen() {
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category>('sighting');
  const [species, setSpecies] = useState<SpeciesSelection>({ species: unknownSpecies });
  const [catalog, setCatalog] = useState<readonly CatalogSpecies[]>(speciesOptions);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [animalId, setAnimalId] = useState<string>();
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
  const photo = attachment?.original;
  const analysis = attachment?.analysis ?? { kind: 'idle' };
  const result = 'result' in analysis ? analysis.result : undefined;
  const activeAnimal = result?.animals.find((animal) => animal.id === animalId) ?? result?.animals[0];
  const speciesNote = species.customName ? `Reported species name: ${species.customName}` : '';
  const descriptionBudget = descriptionLimit - (speciesNote ? speciesNote.length + 2 : 0);

  useEffect(() => {
    let active = true;
    // Keep the checked-in backend catalogue available on slow or offline connections.
    getCommunitySpecies().then((items) => {
      if (active && items.length) setCatalog(items);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

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
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const [original] = result.assets;
        setAttachment({ original, analysis: { kind: 'idle' } });
        setAnimalId(undefined);
      }
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
    if (description.trim().length > descriptionBudget) {
      setError(`Shorten the description to ${descriptionBudget.toLocaleString()} characters to fit the species name.`);
      return;
    }
    if (species.species.id !== unknownSpecies.id && !catalog.some(({ id }) => id === species.species.id)) {
      setError('The species catalog changed. Choose a species from the current list.');
      return;
    }
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
      formData.append('species', species.species.id);
      formData.append('description', speciesNote ? `${description.trim()}\n\n${speciesNote}` : description.trim());
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
        <View style={styles.field}>
          <SectionTitle title="Incident type" />
          <View accessibilityRole="radiogroup" style={styles.categoryRow}>
            {categories.map(({ id, label, icon: Icon }) => {
              const selected = category === id;
              return (
                <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: submitting }}
                  disabled={submitting} onPress={() => setCategory(id)}
                  style={[styles.category, { backgroundColor: selected ? colors.successTint : colors.card,
                    borderColor: selected ? colors.focus : colors.controlBorder }]}>
                  <View style={styles.categoryIcons}>
                    <Icon size={sizing.icon} color={colors.primaryText} />
                    {selected && <Check size={sizing.icon} color={colors.focus} />}
                  </View>
                  <Text style={{ ...typeScale.card, color: colors.primaryText }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.field}>
          <SectionTitle title="Photo evidence" />
          <Text style={{ ...typeScale.body, color: colors.secondaryText }}>
            Optional. Keep a safe distance and never approach wildlife to take a photo.
          </Text>
          {photo && (
            <Pressable accessibilityRole="button" accessibilityLabel="View original incident photo"
              onPress={() => setViewerOpen(true)} style={styles.previewWrap}>
              <EvidenceImage photo={photo} style={[styles.preview, {
                aspectRatio: photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3,
              }]} overlay={result ? { ...result, activeId: activeAnimal?.id } : undefined} />
              <Text style={{ ...typeScale.supporting, color: colors.secondaryText }}>View full photo</Text>
            </Pressable>
          )}
          <View style={styles.actions}>
            {Platform.OS !== 'web' && <TextAction label={photo ? 'Retake photo' : 'Take photo'}
              onPress={() => void choosePhoto('camera')} disabled={submitting || picking} />}
            <TextAction label={photo ? 'Replace from library' : 'Choose from library'}
              onPress={() => void choosePhoto('gallery')} disabled={submitting || picking} />
            {photo && <TextAction label="Remove photo" onPress={() => {
              setAttachment(null);
              setAnimalId(undefined);
              setPhotoError('');
            }} disabled={submitting || picking} />}
          </View>
          {picking && <Text accessibilityLiveRegion="polite" style={{ ...typeScale.supporting, color: colors.secondaryText }}>Opening photo picker…</Text>}
          <ErrorText text={photoError} />
        </View>
        <IdentificationResult state={analysis} catalog={catalog} activeId={activeAnimal?.id} onSelect={setAnimalId} />
        <View style={styles.field}>
          <SectionTitle title="Species" />
          <SpeciesSelector catalog={catalog} selection={species} prediction={activeAnimal} disabled={submitting} onSelect={setSpecies} />
        </View>
        <View style={styles.field}>
          <SectionTitle title="Incident location" />
          <Text style={{ ...typeScale.supporting, color: colors.secondaryText }}>{Platform.OS === 'web' ? 'GPS is unavailable in the browser.' : 'Use GPS only if you’re at the incident location.'}</Text>
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
          multiline maxLength={descriptionBudget} placeholder="Describe what you saw" />
        <Text style={{ ...typeScale.supporting, color: colors.secondaryText }}>Minimum 12 characters.</Text>
        {!!speciesNote && <Text style={{ ...typeScale.supporting, color: colors.secondaryText }}>
          Added to your submitted description: {speciesNote}
        </Text>}
        <View style={styles.field}>
          <SectionTitle title="Reporter details" />
          <InputField label="Reporter name" value={reporterName} onChangeText={setReporterName} editable={!submitting}
            maxLength={120} autoCapitalize="words" />
          <InputField label="Contact (optional)" value={contact} onChangeText={setContact} editable={!submitting}
            maxLength={80} autoCapitalize="none" placeholder="Phone or email" />
        </View>
        {!isApiConfigured && <Text style={{ color: colors.secondaryText }}>Reporting is unavailable.</Text>}
        <ErrorText text={error} />
        <PrimaryButton label={submitting ? 'Submitting report…' : 'Submit report'} onPress={() => void submitReport()}
          loading={submitting} disabled={locating || picking} />
      </View>
      {photo && viewerOpen && <PhotoViewer photo={photo} onClose={() => setViewerOpen(false)} />}
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
  return text ? <Text accessibilityLiveRegion="polite" style={{ ...typeScale.body, color: colors.clay }}>{text}</Text> : null;
}

function InputField({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.mutedText}
        style={[styles.selector, styles.input, props.multiline && styles.description, {
          backgroundColor: colors.input, borderColor: colors.controlBorder, color: colors.primaryText,
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
          style={[styles.selector, { borderColor: selected === id ? colors.focus : colors.controlBorder, backgroundColor: selected === id ? colors.successTint : colors.card }]}>
          <Text style={{ flex: 1, ...typeScale.body, color: colors.primaryText, fontWeight: selected === id ? '700' : '400' }}>{label}</Text>
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
        <Text style={{ ...typeScale.body, color: colors.primaryText }}>
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
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  label: { ...typeScale.card },
  reminder: { borderRadius: radius.input, padding: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  selector: { minHeight: sizing.touch, borderRadius: radius.input, borderWidth: 1, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { ...typeScale.body, fontSize: 16 },
  description: { minHeight: 110, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  category: { flex: 1, minWidth: 0, minHeight: sizing.touch, borderWidth: 1, borderRadius: radius.input, padding: spacing.md, gap: spacing.sm },
  categoryIcons: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  previewWrap: { gap: spacing.xs },
  preview: { width: '100%', minHeight: 96, maxHeight: 280, borderRadius: radius.input },
});
