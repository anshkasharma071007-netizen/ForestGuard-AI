import { useLanguage } from '@/i18n';
import type { Translate } from '@/i18n/translate';
import { LocateFixed, MapPin, Search } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { InputField, NavigationRow, SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { Surface } from '@/components/Surface';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RiskMapSurface } from '@/components/RiskMapSurface';
import { TextAction } from '@/components/TextAction';
import { getCurrentCoordinates, LocationPermissionError, openLocationSettings } from '@/services/device-location';
import { reverseCitizenLocation, searchCitizenPlaces, type Coordinates, type LocationInput,
  type Place, type SavedLocation } from '@/services/api';
import { spacing, useTheme } from '@/theme';

type Method = 'gps' | 'search' | 'map';
export type LocationChoice = SavedLocation;

export function locationInput(value: LocationChoice): LocationInput {
  return value.type === 'gps' ? { lat: value.lat, lon: value.lon, label: value.label } : { village_id: value.village.id };
}

export function locationName(value: LocationChoice, t: Translate) {
  return value.type === 'village' ? value.village.name : displayCoordinateLabel(value.label, value, t) ?? t('Selected coordinates');
}

const methods = [
  { id: 'gps', label: 'Use current location', icon: LocateFixed },
  { id: 'search', label: 'Search address', icon: Search },
  { id: 'map', label: 'Choose on map', icon: MapPin },
] as const;

const india = { lat: 22.4, lon: 79.2 };
const pointLabel = ({ lat, lon }: Coordinates) => `Map point (${lat.toFixed(5)}, ${lon.toFixed(5)})`;

export function displayCoordinateLabel(label: string | undefined, point: Coordinates, t: Translate) {
  return label === pointLabel(point) ? t('Map point ({lat}, {lon})', { lat: point.lat.toFixed(5), lon: point.lon.toFixed(5) }) : label;
}

export function LocationField({ label, value, onChange, disabled, onLocating }: {
  label: string; value: LocationChoice | null; onChange: (value: LocationChoice, method: Method) => void;
  disabled?: boolean; onLocating?: (locating: boolean) => void;
}) {
  const { t, errorText } = useLanguage();
  const { profile, access } = useCitizen();
  const { colors } = useTheme();
  const initialCenter = value ?? profile?.location ?? india;
  const [method, setMethod] = useState<Method | null>(null);
  const [candidate, setCandidate] = useState<Place | null>(null);
  const [camera, setCamera] = useState({ center: initialCenter, zoom: initialCenter === india ? 5 : 14, recenter: 0 });
  const [text, setText] = useState('');
  const [search, setSearch] = useState<{ text: string; mode: 'autocomplete' | 'search'; revision: number } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const selection = useRef<AbortController | null>(null);

  useEffect(() => () => selection.current?.abort(), []);

  useEffect(() => {
    if (method !== 'search' || !search || search.text.trim().length < 3) return;
    const controller = new AbortController();
    const delay = setTimeout(async () => {
      setSearching(true);
      try {
        setPlaces(await searchCitizenPlaces(access, search.text.trim(), search.mode, controller.signal));
        setSearched(true);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not search for places.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, search.mode === 'search' ? 0 : 350);
    return () => { clearTimeout(delay); controller.abort(); };
  }, [access, method, search]);

  function stopLocating() {
    selection.current?.abort();
    setLocating(false);
    onLocating?.(false);
  }

  function showPoint(point: Coordinates) {
    setCamera(previous => ({ center: point, zoom: 15, recenter: previous.recenter + 1 }));
  }

  async function labelPoint(point: Coordinates, controller: AbortController) {
    const fallback = pointLabel(point);
    setCandidate({ ...point, label: fallback });
    try {
      const name = await reverseCitizenLocation(access, point, controller.signal);
      if (!controller.signal.aborted && name) setCandidate({ ...point, label: name });
    } catch {
      // The selected coordinates remain usable when reverse geocoding is unavailable.
    }
  }

  async function capture() {
    const controller = new AbortController();
    selection.current = controller;
    setLocating(true);
    onLocating?.(true);
    try {
      const point = await getCurrentCoordinates();
      if (controller.signal.aborted) return;
      showPoint(point);
      await labelPoint(point, controller);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setSettings(failure instanceof LocationPermissionError && !failure.canAskAgain && Platform.OS !== 'web');
      setError(failure instanceof Error ? failure.message : 'Could not get your location. Try again.');
    } finally {
      if (!controller.signal.aborted) {
        setLocating(false);
        onLocating?.(false);
      }
    }
  }

  function changeMethod(next: Method) {
    if (disabled || (method === next && next !== 'gps')) return;
    stopLocating();
    setMethod(next);
    setCandidate(null);
    setError('');
    setSettings(false);
    setSearching(false);
    if (next === 'gps') void capture();
    if (next === 'map') showPoint(value ?? profile?.location ?? india);
    if (next === 'map' && !value && !profile?.location) setCamera(previous => ({ ...previous, zoom: 5 }));
  }

  async function pickPoint(point: Coordinates) {
    if (disabled) return;
    selection.current?.abort();
    const controller = new AbortController();
    selection.current = controller;
    setMethod('map');
    setError('');
    setSettings(false);
    setLocating(true);
    onLocating?.(true);
    await labelPoint(point, controller);
    if (!controller.signal.aborted) {
      setLocating(false);
      onLocating?.(false);
    }
  }

  function searchFor(input: string, mode: 'autocomplete' | 'search') {
    setPlaces([]);
    setSearched(false);
    setSearching(false);
    setError('');
    setCandidate(null);
    setSearch(previous => ({ text: input, mode, revision: (previous?.revision ?? 0) + 1 }));
  }

  return <View style={{ gap: spacing.sm }}>
    {value && <Surface style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.softAccent }}>
      <MapPin size={18} color={colors.accent} /><View style={{ flex: 1 }}><SupportingText>{locationName(value, t)}</SupportingText></View>
    </Surface>}
    <SegmentedControl<Method> label={label} options={methods.map(option => ({ ...option, label: t(option.label) }))} value={method} onChange={changeMethod} disabled={disabled} />
    {method === 'search' && <>
      <InputField label={t('Address, area or landmark')} value={text} editable={!disabled} autoCapitalize="words"
        maxLength={160} returnKeyType="search" onSubmitEditing={() => searchFor(text, 'search')}
        onChangeText={input => { setText(input); searchFor(input, 'autocomplete'); }} />
      <TextAction label={t('Search')} disabled={disabled || text.trim().length < 3} onPress={() => searchFor(text, 'search')} />
      {searching && <Feedback title={t('Searching addresses…')} kind="loading" />}
      {searched && !places.length && !candidate && <SupportingText>{t('No matching places in India.')}</SupportingText>}
      {places.map((place, index) => <NavigationRow key={`${place.lat},${place.lon},${index}`} label={place.label}
        disabled={disabled} icon={MapPin} onPress={() => {
          setPlaces([]);
          setSearched(false);
          setCandidate(place);
          showPoint(place);
        }} />)}
    </>}
    {(method === 'map' || candidate) && <>
      <SupportingText>{t('Tap the map to adjust the selected point.')}</SupportingText>
      <RiskMapSurface scene={{ ...camera, picker: true, pin: candidate ?? undefined, radiusM: 0, zones: [] }}
        onPick={pickPoint} />
    </>}
    {locating && <Feedback title={candidate ? t('Looking up the location name…') : t('Finding your location…')} kind="loading" />}
    {!!error && <SupportingText error>{errorText(error)}</SupportingText>}
    {!!error && method === 'search' && <TextAction label={t('Retry search')} disabled={disabled || text.trim().length < 3}
      onPress={() => searchFor(text, 'search')} />}
    {settings && <TextAction label={t('Open Settings')} onPress={() => {
      void openLocationSettings().catch(() => setError('Open device Settings to allow location access.'));
    }} />}
    {candidate && <>
      <InputField label={t('Location name')} value={displayCoordinateLabel(candidate.label, candidate, t)} maxLength={250} editable={!locating && !disabled}
        onChangeText={name => setCandidate({ ...candidate, label: name })} />
      <SupportingText>{candidate.lat.toFixed(5)}, {candidate.lon.toFixed(5)}</SupportingText>
      <PrimaryButton label={t('Confirm location')} disabled={disabled || locating || !candidate.label.trim()}
        onPress={() => {
          if (!method) return;
          onChange({ ...candidate, type: 'gps', label: candidate.label.trim() }, method);
          setMethod(null);
          setCandidate(null);
        }} />
    </>}
  </View>;
}
