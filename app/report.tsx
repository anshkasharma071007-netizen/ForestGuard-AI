import { Stack, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, Image as ImageIcon, MapPin, RefreshCw, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { demoSpecies, demoVillages } from '../data';
import { isApiConfigured, submitCommunityReport, type ReportSubmissionResponse } from '../services/api';
import { saveStoredReport } from '../services/report-storage';
import { radius, spacing, typography, useTheme } from '../theme';

type Category = 'sighting' | 'conflict';
type PhotoAsset = ImagePicker.ImagePickerAsset;
type Coordinates = { lat: number; lon: number };

export default function ReportScreen() {
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category>('sighting');
  const [species, setSpecies] = useState('Unknown');
  const [photo, setPhoto] = useState<PhotoAsset | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState('Finding your location…');
  const [locating, setLocating] = useState(true);
  const [selectedVillage, setSelectedVillage] = useState(demoVillages[0].code);
  const [reporterName, setReporterName] = useState('');
  const [contact, setContact] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ReportSubmissionResponse | null>(null);
  const [showSpecies, setShowSpecies] = useState(false);
  const [showVillages, setShowVillages] = useState(false);

  useEffect(() => {
    captureLocation();
  }, []);

  const selectedVillageName = useMemo(() => demoVillages.find((village) => village.code === selectedVillage)?.name ?? 'Turia', [selectedVillage]);

  async function captureLocation() {
    setLocating(true);
    setLocationMessage('Finding your location…');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage('Location permission was not granted. Select your village below.');
        return;
      }

      const serviceEnabled = await Location.hasServicesEnabledAsync();
      if (!serviceEnabled) {
        setLocationMessage('Location services are unavailable. Select your village below.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoordinates({ lat: current.coords.latitude, lon: current.coords.longitude });
      setLocationMessage('Location captured automatically');
    } catch {
      setLocationMessage('Unable to capture location. Select your village below.');
    } finally {
      setLocating(false);
    }
  }

  async function choosePhoto(source: 'camera' | 'gallery') {
    setPhotoError('');
    try {
      const result = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (result.status !== 'granted') {
        setPhotoError(`${source === 'camera' ? 'Camera' : 'Photo library'} permission was not granted.`);
        return;
      }

      const pickerResult = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 });
      if (!pickerResult.canceled) setPhoto(pickerResult.assets[0]);
    } catch {
      setPhotoError('The photo could not be selected. Please try again.');
    }
  }

  async function submitReport() {
    if (submitting) return;
    setError('');
    if (!reporterName.trim()) { setError('Enter your name before submitting.'); return; }
    if (description.trim().length < 12) { setError('Description must be at least 12 characters.'); return; }
    if (!isApiConfigured) { setError('Demonstration mode is active. Your report was not sent because the Forest Guard service is not connected.'); return; }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('species', species);
      formData.append('description', description.trim());
      formData.append('reporter_name', reporterName.trim());
      if (contact.trim()) formData.append('contact', contact.trim());
      formData.append('village_code', selectedVillage);
      if (coordinates) {
        formData.append('lat', String(coordinates.lat));
        formData.append('lon', String(coordinates.lon));
      }
      if (photo) {
        formData.append('image', { uri: photo.uri, name: photo.fileName ?? 'wildlife-report.jpg', type: photo.mimeType ?? 'image/jpeg' } as unknown as Blob);
      }
      const response = await submitCommunityReport(formData);
      await saveStoredReport({ referenceCode: response.reference_code, status: response.status, submittedAt: new Date().toISOString() });
      setSubmitted(response);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The report could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) return <Confirmation response={submitted} />;

  return <><Stack.Screen options={{ presentation: 'modal', headerShown: false }} /><KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={20} color={colors.primaryText} /><Text style={[styles.backText, { color: colors.primaryText }]}>Back</Text></Pressable><Text style={[styles.heading, { color: colors.primaryText }]}>Report a sighting</Text><Text style={[styles.intro, { color: colors.secondaryText }]}>Share what you noticed so forest officials can review it.</Text><View style={[styles.reminder, { backgroundColor: colors.warningTint }]}><Text style={[styles.reminderText, { color: colors.secondaryText }]}>Safety reminder: never approach wildlife to capture a photograph. Keep a safe distance.</Text></View><FieldLabel label="INCIDENT CATEGORY" colors={colors} /><View style={styles.optionRow}>{[['sighting', 'Animal sighting'], ['conflict', 'Human-wildlife conflict']].map(([value, label]) => <Pressable key={value} onPress={() => setCategory(value as Category)} style={[styles.choice, { borderColor: colors.border, backgroundColor: category === value ? colors.successTint : colors.card }]}><Text style={[styles.choiceText, { color: category === value ? colors.primaryText : colors.secondaryText }]}>{label}</Text></Pressable>)}</View><FieldLabel label="ANIMAL SPECIES" colors={colors} /><SelectField label={species} open={showSpecies} onPress={() => setShowSpecies(!showSpecies)} colors={colors} />{showSpecies && <OptionList options={demoSpecies} selected={species} onSelect={(value) => { setSpecies(value); setShowSpecies(false); }} colors={colors} />}<FieldLabel label="PHOTO (OPTIONAL)" colors={colors} />{photo ? <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Image source={{ uri: photo.uri }} style={styles.preview} /><View style={styles.previewActions}><Pressable onPress={() => choosePhoto('gallery')} style={styles.smallAction}><RefreshCw size={16} color={colors.moss} /><Text style={[styles.smallActionText, { color: colors.secondaryText }]}>Replace</Text></Pressable><Pressable onPress={() => setPhoto(null)} style={styles.smallAction}><X size={17} color={colors.clay} /><Text style={[styles.smallActionText, { color: colors.secondaryText }]}>Remove</Text></Pressable></View></View> : <View style={[styles.photoBox, { backgroundColor: colors.card, borderColor: colors.border }]}><ImageIcon size={23} color={colors.moss} /><View style={styles.photoCopy}><Text style={[styles.photoTitle, { color: colors.primaryText }]}>Add a photo if safe</Text><Text style={[styles.photoDetail, { color: colors.mutedText }]}>Use your camera or choose an existing image.</Text></View><Pressable onPress={() => choosePhoto('camera')} style={[styles.photoButton, { backgroundColor: colors.successTint }]}><Camera size={18} color={colors.moss} /></Pressable><Pressable onPress={() => choosePhoto('gallery')} style={[styles.photoButton, { backgroundColor: colors.successTint }]}><ImageIcon size={18} color={colors.moss} /></Pressable></View>}{photoError ? <Text style={[styles.errorText, { color: colors.clay }]}>{photoError}</Text> : null}<FieldLabel label="LOCATION" colors={colors} /><View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}><MapPin size={20} color={coordinates ? colors.moss : colors.amber} /><View style={styles.locationCopy}><Text style={[styles.locationStatus, { color: colors.primaryText }]}>{locationMessage}</Text>{coordinates && <Text style={[styles.coordinates, { color: colors.mutedText }]}>{coordinates.lat.toFixed(5)}, {coordinates.lon.toFixed(5)}</Text>}</View>{locating ? <ActivityIndicator color={colors.moss} /> : <Pressable onPress={captureLocation} accessibilityLabel="Refresh location"><RefreshCw size={18} color={colors.moss} /></Pressable>}</View><Text style={[styles.orText, { color: colors.mutedText }]}>Or choose your village</Text><SelectField label={selectedVillageName} open={showVillages} onPress={() => setShowVillages(!showVillages)} colors={colors} />{showVillages && <OptionList options={demoVillages.map((village) => village.name)} selected={selectedVillageName} onSelect={(value) => { setSelectedVillage(demoVillages.find((village) => village.name === value)?.code ?? demoVillages[0].code); setShowVillages(false); }} colors={colors} />}<FieldLabel label="YOUR NAME" colors={colors} /><TextInput value={reporterName} onChangeText={setReporterName} placeholder="Enter your name" placeholderTextColor={colors.mutedText} style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.primaryText }]} /><FieldLabel label="CONTACT (OPTIONAL)" colors={colors} /><TextInput value={contact} onChangeText={setContact} placeholder="Phone or email" placeholderTextColor={colors.mutedText} keyboardType="phone-pad" style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.primaryText }]} /><FieldLabel label="WHAT DID YOU NOTICE?" colors={colors} /><TextInput value={description} onChangeText={setDescription} placeholder="Describe what you saw…" placeholderTextColor={colors.mutedText} multiline textAlignVertical="top" style={[styles.textarea, { backgroundColor: colors.input, borderColor: colors.border, color: colors.primaryText }]} /><Text style={[styles.counter, { color: description.trim().length < 12 ? colors.mutedText : colors.moss }]}>{description.trim().length}/12 minimum characters</Text>{error ? <Text style={[styles.errorText, { color: colors.clay }]}>{error}</Text> : null}<PrimaryButton label={submitting ? 'Submitting report…' : 'Submit report'} onPress={submitReport} />{submitting && <ActivityIndicator color={colors.moss} style={styles.loader} />}<Text style={[styles.modeText, { color: colors.mutedText }]}>{isApiConfigured ? 'Connected to Forest Guard reporting' : 'Demonstration mode · reports are not sent'}</Text></ScrollView></KeyboardAvoidingView></>;
}

function FieldLabel({ label, colors }: { label: string; colors: { mutedText: string } }) { return <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>{label}</Text>; }
function SelectField({ label, open, onPress, colors }: { label: string; open: boolean; onPress: () => void; colors: { input: string; border: string; primaryText: string } }) { return <Pressable onPress={onPress} style={[styles.select, { backgroundColor: colors.input, borderColor: colors.border }]}><Text style={[styles.selectText, { color: colors.primaryText }]}>{label}</Text><ChevronDown size={18} color={colors.primaryText} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} /></Pressable>; }
function OptionList({ options, selected, onSelect, colors }: { options: string[]; selected: string; onSelect: (value: string) => void; colors: { card: string; border: string; primaryText: string; moss: string } }) { return <View style={[styles.optionList, { backgroundColor: colors.card, borderColor: colors.border }]}>{options.map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={styles.listOption}><Text style={[styles.listText, { color: colors.primaryText }]}>{option}</Text>{option === selected && <CheckCircle2 size={17} color={colors.moss} />}</Pressable>)}</View>; }
function Confirmation({ response }: { response: ReportSubmissionResponse }) { const { colors } = useTheme(); return <View style={[styles.confirmation, { backgroundColor: colors.background }]}><View style={[styles.confirmIcon, { backgroundColor: colors.successTint }]}><CheckCircle2 size={34} color={colors.moss} /></View><Text style={[styles.confirmHeading, { color: colors.primaryText }]}>Report received</Text><Text style={[styles.confirmText, { color: colors.secondaryText }]}>{response.message || 'Forest officials can now review your report.'}</Text><View style={[styles.reference, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.fieldLabel, { color: colors.mutedText }]}>REFERENCE CODE</Text><Text style={[styles.referenceCode, { color: colors.primaryText }]}>{response.reference_code}</Text><Text style={[styles.statusText, { color: colors.moss }]}>Status: {response.status}</Text></View><PrimaryButton label="View report history" onPress={() => router.replace('/history')} /><Pressable onPress={() => router.replace('/')} style={styles.homeAction}><Text style={[styles.homeActionText, { color: colors.secondaryText }]}>Return to home</Text></Pressable></View>; }

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingTop: 24, paddingBottom: 40 }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginBottom: spacing.xl }, backText: { fontSize: 14, fontWeight: '700' }, heading: { fontFamily: typography.heading, fontSize: 28, fontWeight: '700', marginBottom: spacing.sm }, intro: { fontSize: 15, lineHeight: 23, marginBottom: spacing.lg }, reminder: { borderRadius: radius.input, padding: spacing.md, marginBottom: spacing.lg }, reminderText: { fontSize: 13, lineHeight: 19 }, fieldLabel: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', marginBottom: spacing.sm, marginTop: spacing.md }, optionRow: { gap: spacing.sm }, choice: { minHeight: 48, borderWidth: 1, borderRadius: radius.input, paddingHorizontal: spacing.md, justifyContent: 'center' }, choiceText: { fontSize: 14, fontWeight: '700' }, select: { minHeight: 52, borderWidth: 1, borderRadius: radius.input, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectText: { fontSize: 15, fontWeight: '600' }, optionList: { borderWidth: 1, borderRadius: radius.input, marginTop: spacing.sm, overflow: 'hidden' }, listOption: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, listText: { fontSize: 14 }, photoBox: { minHeight: 92, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, photoCopy: { flex: 1 }, photoTitle: { fontSize: 14, fontWeight: '700' }, photoDetail: { fontSize: 12, lineHeight: 18, marginTop: 3 }, photoButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, previewCard: { borderWidth: 1, borderRadius: radius.card, padding: spacing.sm }, preview: { width: '100%', height: 190, borderRadius: 10 }, previewActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, paddingTop: spacing.sm }, smallAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 }, smallActionText: { fontSize: 13, fontWeight: '700' }, errorText: { fontSize: 13, lineHeight: 19, marginTop: spacing.sm }, locationCard: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, locationCopy: { flex: 1 }, locationStatus: { fontSize: 14, fontWeight: '700' }, coordinates: { fontFamily: typography.mono, fontSize: 11, marginTop: 4 }, orText: { fontSize: 12, marginTop: spacing.md, marginBottom: -spacing.sm }, input: { minHeight: 52, borderWidth: 1, borderRadius: radius.input, paddingHorizontal: spacing.md, fontSize: 15 }, textarea: { minHeight: 130, borderWidth: 1, borderRadius: radius.input, padding: spacing.md, fontSize: 15, lineHeight: 22 }, counter: { fontSize: 11, textAlign: 'right', marginTop: spacing.xs }, loader: { marginTop: spacing.md }, modeText: { fontSize: 11, textAlign: 'center', marginTop: spacing.md }, confirmation: { flex: 1, padding: spacing.lg, justifyContent: 'center' }, confirmIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg }, confirmHeading: { fontFamily: typography.heading, fontSize: 28, fontWeight: '700', textAlign: 'center' }, confirmText: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl }, reference: { borderWidth: 1, borderRadius: radius.card, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.xl }, referenceCode: { fontFamily: typography.mono, fontSize: 24, fontWeight: '700', letterSpacing: 1, marginVertical: spacing.sm }, statusText: { fontSize: 13, fontWeight: '700' }, homeAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm }, homeActionText: { fontSize: 14, fontWeight: '700' } });
