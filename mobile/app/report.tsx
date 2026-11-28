import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CircleCheck, ImageIcon, PawPrint, Send, TriangleAlert } from 'lucide-react-native';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { InputField, SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { PhotoPreview } from '@/components/PhotoPreview';
import { ReferenceCode } from '@/components/ReferenceCode';
import { IdentificationResult } from '@/components/IdentificationResult';
import { ReportStatusPill } from '@/components/ReportRow';
import { PhotoViewer } from '@/components/PhotoViewer';
import { SectionTitle } from '@/components/SectionTitle';
import { SpeciesSelector } from '@/components/SpeciesSelector';
import { PrimaryButton, SecondaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Surface } from '@/components/Surface';
import { TextAction } from '@/components/TextAction';
import { LocationField, locationInput, type LocationChoice } from '@/components/LocationField';
import { useCitizen } from '@/citizen-context';
import { otherSpecies, speciesOptions, unknownSpecies, type CatalogSpecies } from '@/data';
import type { IdentificationState } from '@/identification';
import { ApiError, getCommunityGuidance, isApiConfigured, submitCitizenReport, type ReportSubmissionResponse } from '@/services/api';
import { submissionKey, finishSubmission } from '@/services/report-storage';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const categories = [
  { id: 'sighting', label: 'Sighting', icon: PawPrint },
  { id: 'conflict', label: 'Conflict', icon: TriangleAlert },
] as const;
type Category = typeof categories[number]['id'];
type PhotoAsset = ImagePicker.ImagePickerAsset;
type Attachment = { original: PhotoAsset; analysis: IdentificationState };
const descriptionLimit = 4000;

export default function ReportScreen() {
  const { access, profile } = useCitizen();
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  const [species, setSpecies] = useState<CatalogSpecies>(unknownSpecies);
  const [otherName, setOtherName] = useState('');
  const [catalog, setCatalog] = useState<readonly CatalogSpecies[]>(speciesOptions);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [animalId, setAnimalId] = useState<string>();
  const [photoError, setPhotoError] = useState('');
  const [photoSettings, setPhotoSettings] = useState(false);
  const [picking, setPicking] = useState(false);
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [locating, setLocating] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const submitting = Boolean(progress);
  const [confirmation, setConfirmation] = useState<ReportSubmissionResponse | null>(null);
  const submissionInProgress = useRef(false);
  const photo = attachment?.original;
  const analysis = attachment?.analysis ?? { kind: 'idle' };
  const result = 'result' in analysis ? analysis.result : undefined;
  const activeAnimal = result?.animals.find((animal) => animal.id === animalId) ?? result?.animals[0];
  const animalNote = species.id === otherSpecies.id && otherName.trim() ? `Reported animal: ${otherName.trim()}` : '';
  const descriptionBudget = descriptionLimit - (animalNote ? animalNote.length + 2 : 0);
  const clearError = () => { if (error) setError(''); };

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
    setPhotoSettings(false);
    setPicking(true);
    try {
      if (Platform.OS !== 'web') {
        const permission = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          setPhotoSettings(!permission.canAskAgain);
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
        clearError();
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
      setError(`Shorten the description to ${descriptionBudget.toLocaleString()} characters to fit the animal name.`);
      return;
    }
    if (![unknownSpecies.id, otherSpecies.id].some((id) => id === species.id) && !catalog.some(({ id }) => id === species.id)) {
      setError('The animal list changed. Choose an animal from the current list.');
      return;
    }
    if (!isApiConfigured) { setError('Set EXPO_PUBLIC_API_URL to the Forest Guard API address and reopen the app.'); return; }
    if (!location || !profile) {
      setError('Choose and confirm the incident location before submitting.');
      return;
    }
    const incidentLocation = locationInput(location);
    // Keep the local retry fingerprint compatible with village drafts created before the API accepted IDs.
    const draftLocation = location.type === 'village' ? { village_code: location.village.code } : incidentLocation;

    submissionInProgress.current = true;
    setProgress(photo ? 'Preparing photograph…' : 'Submitting report…');
    try {
      const draft = JSON.stringify([title.trim(), category, species.id, animalNote, description.trim(),
        draftLocation, photo?.assetId, photo?.fileName, photo?.fileSize,
        photo?.file?.lastModified, photo?.assetId || photo?.fileName ? undefined : photo?.uri]);
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('category', category);
      formData.append('species', species.id);
      formData.append('description', [description.trim(), animalNote].filter(Boolean).join('\n\n'));
      for (const [key, value] of Object.entries(incidentLocation)) formData.append(key, String(value));
      if (photo) await appendPhoto(formData, photo);

      const key = await submissionKey(draft, profile.id, access.signal);
      formData.append('submission_key', key);
      let response: ReportSubmissionResponse;
      try {
        if (photo) setProgress('Uploading photograph and submitting report…');
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
      setProgress('');
      submissionInProgress.current = false;
    }
  }

  if (confirmation) return <Confirmation response={confirmation} />;

  return (
    <Screen header={<ScreenHeader title="Report a sighting" back />}>
      <View style={styles.form}>
        <View style={styles.field}>
          {photo ? <PhotoPreview photo={photo} label="Selected incident photograph" onExpand={() => setViewerOpen(true)}
            overlay={result ? { ...result, activeId: activeAnimal?.id } : undefined} /> :
            <View style={[styles.upload, { backgroundColor: colors.card, borderColor: colors.controlBorder }]}>
              <Camera size={34} color={colors.accent} strokeWidth={1.7} />
              <Text style={[typeScale.section, { color: colors.primaryText }]}>Add a photograph</Text>
              <Text style={[typeScale.supporting, styles.centered, { color: colors.secondaryText }]}>
                Optional. Keep your distance when photographing wildlife.
              </Text>
            </View>}
          <View style={styles.actions}>
            {Platform.OS !== 'web' && <View style={styles.action}>
              <SecondaryButton icon={Camera} label={photo ? 'Retake photo' : 'Camera'}
                onPress={() => void choosePhoto('camera')} disabled={submitting || picking} />
            </View>}
            <View style={styles.action}>
              <SecondaryButton icon={ImageIcon} label={photo ? 'Replace photo' : 'Choose from gallery'}
                onPress={() => void choosePhoto('gallery')} disabled={submitting || picking} />
            </View>
          </View>
          {photo && <TextAction label="Remove photo" onPress={() => {
            setAttachment(null);
            setAnimalId(undefined);
            setPhotoError('');
            setPhotoSettings(false);
          }} disabled={submitting || picking} />}
          {picking && <Feedback title="Opening photo picker…" kind="loading" />}
          {!!photoError && <SupportingText error>{photoError}</SupportingText>}
          {photoSettings && <TextAction label="Open device settings" onPress={() => {
            void Linking.openSettings().catch(() => setPhotoError('Open device settings to allow photo access.'));
          }} />}
        </View>
        <IdentificationResult state={analysis} catalog={catalog} activeId={activeAnimal?.id} onSelect={setAnimalId} />
        <InputField label="Title (required)" value={title} onChangeText={value => { setTitle(value); clearError(); }}
          placeholder="Briefly describe the sighting" editable={!submitting} maxLength={120} />
        <View style={styles.field}>
          <SectionTitle title="Incident category (required)" />
          <SegmentedControl label="Incident category" options={categories} value={category}
            onChange={value => { setCategory(value); clearError(); }} disabled={submitting} />
        </View>
        <View style={styles.field}>
          <SectionTitle title="Animal observed" />
          <SpeciesSelector catalog={catalog} selection={species} prediction={activeAnimal} disabled={submitting}
            onSelect={value => { setSpecies(value); clearError(); }} />
          {species.id === otherSpecies.id && <InputField label="Animal name (optional)" value={otherName}
            onChangeText={value => { setOtherName(value); clearError(); }} editable={!submitting} maxLength={80} />}
        </View>
        <View style={styles.field}>
          <SectionTitle title="Sighting location (required)" />
          <LocationField label="Sighting location" value={location} onChange={value => { setLocation(value); clearError(); }}
            onLocating={setLocating} disabled={submitting} />
        </View>
        <InputField label="Additional details (optional)" value={description}
          onChangeText={value => { setDescription(value); clearError(); }} editable={!submitting}
          multiline maxLength={descriptionBudget} placeholder="Describe what you observed" />
        {!isApiConfigured && <SupportingText>Reporting is unavailable on this device.</SupportingText>}
        {!!error && <Feedback title="Check your report" detail={error} kind="error" />}
        {!!progress && <Feedback title={progress} detail="Keep this screen open until your reference is ready." kind="loading" />}
        <PrimaryButton label="Submit report" icon={Send} onPress={() => void submitReport()}
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
    <Screen header={<ScreenHeader title="Report submitted" onBack={() => router.dismissTo('/')} />}>
      <View style={styles.form}>
        <Surface style={styles.receipt}>
          <CircleCheck size={34} color={colors.successText} />
          <SectionTitle title="Your report was received" />
          <SupportingText>Use this reference to follow your report.</SupportingText>
          <ReferenceCode code={response.reference_code} />
          <ReportStatusPill status={response.status} />
        </Surface>
        <PrimaryButton label="View report" onPress={() => router.replace({
          pathname: '/report-detail', params: { code: response.reference_code },
        })} />
        <TextAction label="Back to home" onPress={() => router.dismissTo('/')} />
        <SupportingText>Immediate danger? Call 112 or the forest helpline (1926).</SupportingText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  upload: { minHeight: 140, padding: spacing.lg, gap: spacing.xs, borderStyle: 'dashed', borderWidth: 1,
    borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  centered: { textAlign: 'center' },
  receipt: { padding: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: '40%' },
});
