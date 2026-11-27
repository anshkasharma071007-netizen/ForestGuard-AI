import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImageIcon, PawPrint, TriangleAlert } from 'lucide-react-native';
import { File } from 'expo-file-system';
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
import { LocationField, locationInput, type LocationChoice } from '@/components/LocationField';
import { useCitizen } from '@/citizen-context';
import { speciesOptions, unknownSpecies, type CatalogSpecies } from '@/data';
import type { IdentificationState } from '@/identification';
import { ApiError, getCommunityGuidance, isApiConfigured, submitCitizenReport, type ReportSubmissionResponse } from '@/services/api';
import { submissionKey, finishSubmission } from '@/services/report-storage';
import { radius, spacing, typography, typeScale, useTheme } from '@/theme';

const categories = [
  { id: 'sighting', label: 'Sighting', icon: PawPrint },
  { id: 'conflict', label: 'Conflict', icon: TriangleAlert },
] as const;
type Category = typeof categories[number]['id'];
type PhotoAsset = ImagePicker.ImagePickerAsset;
type Attachment = { original: PhotoAsset; analysis: IdentificationState };
const descriptionLimit = 4000;

export default function ReportScreen() {
  const { colors } = useTheme();
  const { access, profile } = useCitizen();
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  const [species, setSpecies] = useState<SpeciesSelection>({ species: unknownSpecies });
  const [catalog, setCatalog] = useState<readonly CatalogSpecies[]>(speciesOptions);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [animalId, setAnimalId] = useState<string>();
  const [photoError, setPhotoError] = useState('');
  const [picking, setPicking] = useState(false);
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [locating, setLocating] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<ReportSubmissionResponse | null>(null);
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
    if (!title.trim()) { setError('Enter a report title.'); return; }
    if (!category) { setError('Choose an incident category.'); return; }
    if (description.trim().length > descriptionBudget) {
      setError(`Shorten the description to ${descriptionBudget.toLocaleString()} characters to fit the species name.`);
      return;
    }
    if (species.species.id !== unknownSpecies.id && !catalog.some(({ id }) => id === species.species.id)) {
      setError('The species catalog changed. Choose a species from the current list.');
      return;
    }
    if (!isApiConfigured) { setError('Set EXPO_PUBLIC_API_URL to the Forest Guard API address and reopen the app.'); return; }
    if (!location || !profile) {
      setError('Capture the incident location or select a village before submitting.');
      return;
    }
    const incidentLocation = locationInput(location);
    // Keep the local retry fingerprint compatible with village drafts created before the API accepted IDs.
    const draftLocation = location.type === 'village' ? { village_code: location.village.code } : incidentLocation;

    submissionInProgress.current = true;
    setSubmitting(true);
    try {
      const draft = JSON.stringify([title.trim(), category, species.species.id, speciesNote, description.trim(),
        draftLocation, photo?.assetId, photo?.fileName, photo?.fileSize,
        photo?.file?.lastModified, photo?.assetId || photo?.fileName ? undefined : photo?.uri]);
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('category', category);
      formData.append('species', species.species.id);
      formData.append('description', [description.trim(), speciesNote].filter(Boolean).join('\n\n'));
      for (const [key, value] of Object.entries(incidentLocation)) formData.append(key, String(value));
      if (photo) await appendPhoto(formData, photo);

      const key = await submissionKey(draft, profile.id, access.signal);
      formData.append('submission_key', key);
      let response: ReportSubmissionResponse;
      try {
        response = await submitCitizenReport(access, formData);
      } catch (failure) {
        if (failure instanceof ApiError && failure.kind === 'invalid-input') await finishSubmission(key, profile.id);
        throw failure;
      }
      if (!access.signal.aborted) setConfirmation(response);
      await finishSubmission(key, profile.id).catch(() => {});
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The report could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
      submissionInProgress.current = false;
    }
  }

  if (confirmation) return <Confirmation response={confirmation} />;

  return (
    <Screen>
      <ScreenHeader title="New report" back />
      <View style={styles.form}>
        <InputField label="Title (required)" value={title} onChangeText={setTitle} editable={!submitting} maxLength={120} />
        <InputField label="Description (optional)" value={description} onChangeText={setDescription} editable={!submitting}
          multiline maxLength={descriptionBudget} placeholder="Describe what you saw" hint={speciesNote || undefined} />
        <View style={styles.field}>
          <SectionTitle title="Incident category (required)" />
          <SegmentedControl label="Incident category" options={categories} value={category} onChange={setCategory} disabled={submitting} />
        </View>
        <View style={styles.field}>
          <SectionTitle title="Species" />
          <SpeciesSelector catalog={catalog} selection={species} prediction={activeAnimal} disabled={submitting} onSelect={setSpecies} />
        </View>
        <View style={styles.field}>
          <SectionTitle title="Incident location (required)" />
          <LocationField label="Incident location" value={location} onChange={setLocation} onLocating={setLocating} disabled={submitting} />
        </View>
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
        {!isApiConfigured && <SupportingText>Reporting is unavailable on this device.</SupportingText>}
        {!!error && <SupportingText error>{error}</SupportingText>}
        <PrimaryButton label={submitting ? 'Submitting report…' : 'Submit report'} onPress={() => void submitReport()}
          loading={submitting} disabled={locating || picking} />
      </View>
      {photo && viewerOpen && <PhotoViewer photo={photo} onClose={() => setViewerOpen(false)} />}
    </Screen>
  );
}

async function appendPhoto(formData: FormData, photo: PhotoAsset) {
  const name = photo.fileName ?? 'wildlife-report.jpg';

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

  const file = new File(photo.uri);
  formData.append('image', file, name);
}

function Confirmation({ response }: { response: ReportSubmissionResponse }) {
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
        <PrimaryButton label="View report" onPress={() => router.replace({
          pathname: '/report-detail', params: { code: response.reference_code },
        })} />
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
