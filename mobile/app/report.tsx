import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Camera, ImageIcon, MapPin, LocateFixed, PawPrint, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { InputField, SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { EvidenceImage } from '@/components/EvidenceImage';
import { IdentificationResult } from '@/components/IdentificationResult';
import { ReportStatusPill } from '@/components/ReportRow';
import { PhotoViewer } from '@/components/PhotoViewer';
import { SectionTitle } from '@/components/SectionTitle';
import { SpeciesSelector, type SpeciesSelection } from '@/components/SpeciesSelector';
import { PrimaryButton, SecondaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { VillageSelector } from '@/components/VillageSelector';
import { speciesOptions, unknownSpecies, type CatalogSpecies } from '@/data';
import type { IdentificationState } from '@/identification';
import { ApiError, getCommunityGuidance, isApiConfigured, submitCommunityReport, type ReportSubmissionResponse, type Village } from '@/services/api';
import { saveStoredReport, submissionKey, finishSubmission } from '@/services/report-storage';
import { radius, spacing, typography, typeScale, useTheme } from '@/theme';

const categories = [
  { id: 'sighting', label: 'Sighting', icon: PawPrint },
  { id: 'conflict', label: 'Conflict', icon: TriangleAlert },
] as const;
const locationMethods = [
  { id: 'gps', label: 'Current location', icon: LocateFixed },
  { id: 'village', label: 'Choose village', icon: MapPin },
] as const;

type Category = typeof categories[number]['id'];
type LocationMethod = typeof locationMethods[number]['id'];
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
    const controller = new AbortController();
    // Keep the checked-in backend catalogue available on slow or offline connections.
    void getCommunityGuidance(controller.signal).then(({ species: items }) => {
      if (!controller.signal.aborted && items.length) setCatalog(items);
    }).catch(() => {});
    return () => controller.abort();
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
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
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
    if (!isApiConfigured) { setError('Set EXPO_PUBLIC_API_URL to the Forest Guard API address and reopen the app.'); return; }
    const reportCoordinates = method === 'gps' ? coordinates : null;
    const reportVillage = method === 'village' ? village : null;
    if (!reportCoordinates && !reportVillage) {
      setError('Capture the incident location or select a village before submitting.');
      return;
    }

    submissionInProgress.current = true;
    setSubmitting(true);
    try {
      const draft = JSON.stringify([category, species.species.id, speciesNote, description.trim(), reporterName.trim(),
        contact.trim(), reportCoordinates, reportVillage?.code, photo?.assetId, photo?.fileName, photo?.fileSize,
        photo?.file?.lastModified, photo?.assetId || photo?.fileName ? undefined : photo?.uri]);
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

      const key = await submissionKey(draft);
      formData.append('submission_key', key);
      let response: ReportSubmissionResponse;
      try {
        response = await submitCommunityReport(formData);
      } catch (failure) {
        if (failure instanceof ApiError && failure.kind === 'invalid-input') await finishSubmission(key);
        throw failure;
      }
      let saved = true;
      try {
        const now = new Date().toISOString();
        await saveStoredReport({
          referenceCode: response.reference_code,
          status: response.status,
          submittedAt: now,
          statusCheckedAt: now,
        });
        await finishSubmission(key);
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
      <ScreenHeader title="New report" back />
      <View style={styles.form}>
        <SegmentedControl label="Incident type" options={categories} value={category} onChange={setCategory} disabled={submitting} />
        <View style={styles.field}>
          <SectionTitle title={photo ? 'Photo attached' : 'Add photo'} />
          <SupportingText>Optional. Never approach wildlife for a photo.</SupportingText>
          {photo && (
            <Pressable accessibilityRole="button" accessibilityLabel="View original incident photo"
              onPress={() => setViewerOpen(true)} style={({ pressed }) => [styles.previewWrap, { opacity: pressed ? 0.84 : 1 }]}>
              <EvidenceImage photo={photo} style={[styles.preview, {
                aspectRatio: photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3,
              }]} overlay={result ? { ...result, activeId: activeAnimal?.id } : undefined} />
              <Text style={{ ...typeScale.action, color: colors.accent }}>View full photo</Text>
            </Pressable>
          )}
          <View style={styles.actions}>
            {Platform.OS !== 'web' && <View style={styles.action}>
              <SecondaryButton icon={Camera} label={photo ? 'Retake photo' : 'Camera'}
                onPress={() => void choosePhoto('camera')} disabled={submitting || picking} />
            </View>}
            <View style={styles.action}>
              <SecondaryButton icon={ImageIcon} label={photo ? 'Replace photo' : 'Gallery'}
                onPress={() => void choosePhoto('gallery')} disabled={submitting || picking} />
            </View>
          </View>
          {photo && <View style={{ alignItems: 'flex-start' }}>
            <TextAction label="Remove photo" onPress={() => {
              setAttachment(null);
              setAnimalId(undefined);
              setPhotoError('');
            }} disabled={submitting || picking} />
          </View>}
          {picking && <Feedback title="Opening photo picker…" kind="loading" />}
          {!!photoError && <SupportingText error>{photoError}</SupportingText>}
        </View>
        <IdentificationResult state={analysis} catalog={catalog} activeId={activeAnimal?.id} onSelect={setAnimalId} />
        <View style={styles.field}>
          <SectionTitle title="Species" />
          <SpeciesSelector catalog={catalog} selection={species} prediction={activeAnimal} disabled={submitting} onSelect={setSpecies} />
        </View>
        <View style={styles.field}>
          <SectionTitle title="Location" />
          <SegmentedControl label="Location method" options={locationMethods} value={method} onChange={changeMethod}
            disabled={submitting || locating} />
          {method === 'gps' && (
            <>
              {locating ? <Feedback title="Finding location…" kind="loading" />
                : <TextAction label={coordinates ? 'Capture again' : 'Retry location'} onPress={() => void captureLocation()} disabled={submitting} />}
              {coordinates && <SupportingText>GPS: {coordinates.lat.toFixed(5)}, {coordinates.lon.toFixed(5)}</SupportingText>}
              {!!locationError && <SupportingText error>{locationError}</SupportingText>}
            </>
          )}
          {method === 'village' && <VillageSelector label="Incident village" startOpen selected={village} onSelect={setVillage} disabled={submitting} />}
        </View>
        <InputField label="Description" value={description} onChangeText={setDescription} editable={!submitting}
          multiline maxLength={descriptionBudget} placeholder="Describe what you saw" hint={speciesNote
            ? `Minimum 12 characters. Added to your submitted description: ${speciesNote}` : 'Minimum 12 characters.'} />
        <InputField label="Reporter name" value={reporterName} onChangeText={setReporterName} editable={!submitting}
          maxLength={120} autoCapitalize="words" />
        <InputField label="Contact (optional)" value={contact} onChangeText={setContact} editable={!submitting}
          maxLength={80} autoCapitalize="none" placeholder="Phone or email" />
        {!isApiConfigured && <SupportingText>Reporting is unavailable on this device.</SupportingText>}
        {!!error && <SupportingText error>{error}</SupportingText>}
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
          <SectionTitle title="Reference code" />
          <Text selectable style={{ color: colors.primaryText, fontFamily: typography.mono, fontSize: 21 }}>{response.reference_code}</Text>
          <ReportStatusPill status={response.status} />
        </View>
        {!saved && <SupportingText error>The report was received, but its reference could not be saved on this device. Keep the reference code to check its status.</SupportingText>}
        <PrimaryButton label="View report history" onPress={() => router.dismissTo('/history')} />
        <TextAction label="Return to Home" onPress={() => router.dismissTo('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  reminder: { borderRadius: radius.input, padding: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: '40%' },
  previewWrap: { gap: spacing.xs },
  preview: { width: '100%', minHeight: 96, maxHeight: 280, borderRadius: radius.input },
});
