import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import MapView, { Marker, Polyline } from 'react-native-maps';
import {
  CalendarDays,
  Check,
  Compass,
  ExternalLink,
  Eye,
  KeyRound,
  ListTodo,
  Map as MapIcon,
  MapPin,
  Navigation,
  Palette,
  Pencil,
  Plane,
  Plus,
  Route,
  Save,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';

import { sampleTrip } from './src/data/sampleTrip';
import {
  getRouteCoordinates,
  getRollingTripDates,
  getTripDayByDate,
  getStopsForDay,
  getTripProgress,
  getUpcomingStop,
  offsetCoordinates,
  resolvePlaceCoordinates,
} from './src/lib/itinerary';
import {
  DEFAULT_OWNER_PIN,
  OWNER_ACCESS_SEQUENCE,
  doesAccessSequenceUnlock,
  getVisibleSurprises,
  revealSurprise,
} from './src/lib/surprises';
import { createSocialResearchGroups } from './src/lib/socialResearch';
import {
  Coordinates,
  MapCategory,
  RevealMode,
  RevealedSurprise,
  PlaceRecommendationGroup,
  SurpriseStop,
  Trip,
  TripDay,
  TripDocument,
  TripStop,
  TripTodo,
} from './src/types/trip';

declare const process: {
  env: {
    EXPO_PUBLIC_SOCIAL_RESEARCH_ENDPOINT?: string;
    EXPO_PUBLIC_YOUTUBE_API_KEY?: string;
  };
};

type TabKey = 'map' | 'timeline' | 'todo' | 'moments';
type ThemeKey = 'light' | 'dark' | 'lilac' | 'green' | 'blue';
type CalendarMode = 'week' | 'month';
type PlanPanel = 'calendar' | 'new';

const THEME_KEY = 'roundtrip.theme.v1';
const DATA_VERSION_KEY = 'roundtrip.dataVersion.v1';
const DATA_VERSION = '2026-08-trip-v7';
const LOCAL_DATA_DIRECTORY = `${FileSystem.documentDirectory ?? ''}roundtrip-data/`;
const SURPRISES_FILE = 'surprises.json';
const STOPS_FILE = 'stops.json';
const DAYS_FILE = 'days.json';
const TODOS_FILE = 'todos.json';
const DOCUMENTS_FILE = 'documents.json';

const region = {
  latitude: 20.5,
  longitude: 64,
  latitudeDelta: 76,
  longitudeDelta: 116,
};

const revealModes: Array<{ value: RevealMode; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'time', label: 'Timed' },
  { value: 'location', label: 'Nearby' },
];

const ownerGestureSequence = OWNER_ACCESS_SEQUENCE;

const mapCategoryLegend: Array<{ category: MapCategory; label: string }> = [
  { category: 'general', label: 'Place' },
  { category: 'stay', label: 'Stay' },
  { category: 'hike', label: 'Hike' },
  { category: 'beach', label: 'Beach' },
  { category: 'activity', label: 'Plan' },
];

const editableMapCategories: Array<{ category: MapCategory; label: string }> = [
  { category: 'general', label: 'Place' },
  { category: 'stay', label: 'Stay' },
  { category: 'hike', label: 'Hike' },
  { category: 'beach', label: 'Beach' },
  { category: 'food', label: 'Food' },
  { category: 'activity', label: 'Plan' },
];

const themes: Record<
  ThemeKey,
  {
    label: string;
    background: string;
    surface: string;
    softSurface: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    accentDark: string;
  }
> = {
  light: {
    label: 'Light',
    background: '#F6F7F9',
    surface: '#FFFFFF',
    softSurface: '#F1F3F6',
    text: '#1C1E2E',
    muted: '#5D6575',
    border: '#E2E6ED',
    accent: '#F26A4F',
    accentDark: '#2B8C83',
  },
  dark: {
    label: 'Dark',
    background: '#191A22',
    surface: '#262832',
    softSurface: '#303340',
    text: '#F4F5F8',
    muted: '#C6CAD4',
    border: '#3A3E4D',
    accent: '#F7B267',
    accentDark: '#7FD1C1',
  },
  lilac: {
    label: 'Lilac',
    background: '#F5F0FF',
    surface: '#FFFFFF',
    softSurface: '#ECE2FF',
    text: '#262033',
    muted: '#6B617A',
    border: '#DDD1F4',
    accent: '#A989E8',
    accentDark: '#6F5FB8',
  },
  green: {
    label: 'Light green',
    background: '#EFF8F1',
    surface: '#FFFFFF',
    softSurface: '#DFF0E4',
    text: '#1D3025',
    muted: '#5C7164',
    border: '#CBE4D3',
    accent: '#7FBF90',
    accentDark: '#2B8C83',
  },
  blue: {
    label: 'Light blue',
    background: '#EEF7FF',
    surface: '#FFFFFF',
    softSurface: '#DDEEFF',
    text: '#1B2B3D',
    muted: '#5E7188',
    border: '#C9DEF2',
    accent: '#78AEE8',
    accentDark: '#3C76B6',
  },
};

async function readLocalJson<T>(fileName: string): Promise<T | undefined> {
  if (!FileSystem.documentDirectory) {
    return undefined;
  }

  try {
    const uri = `${LOCAL_DATA_DIRECTORY}${fileName}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return undefined;
    }

    const content = await FileSystem.readAsStringAsync(uri);
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

async function writeLocalJson(fileName: string, value: unknown) {
  if (!FileSystem.documentDirectory) {
    return;
  }

  await FileSystem.makeDirectoryAsync(LOCAL_DATA_DIRECTORY, { intermediates: true });
  await FileSystem.writeAsStringAsync(`${LOCAL_DATA_DIRECTORY}${fileName}`, JSON.stringify(value));
}

function mergeStopsWithDefaults(defaultStops: TripStop[], storedStops: TripStop[]) {
  const storedById = new Map(storedStops.map((stop) => [stop.id, stop]));
  const defaultIds = new Set(defaultStops.map((stop) => stop.id));
  const mergedDefaults = defaultStops.map((defaultStop) => storedById.get(defaultStop.id) ?? defaultStop);
  const customStops = storedStops.filter((stop) => !defaultIds.has(stop.id));

  return [...mergedDefaults, ...customStops];
}

function mergeDaysWithDefaults(defaultDays: TripDay[], storedDays: TripDay[]) {
  const storedByDate = new Map(storedDays.map((day) => [day.date, day]));
  const defaultDates = new Set(defaultDays.map((day) => day.date));

  const mergedDefaults = defaultDays.map((defaultDay) => {
    const storedDay = storedByDate.get(defaultDay.date);

    if (!storedDay) {
      return defaultDay;
    }

    return {
      ...defaultDay,
      ...storedDay,
      stops: uniqueValues([...defaultDay.stops, ...storedDay.stops]),
    };
  });

  const customDays = storedDays.filter((day) => !defaultDates.has(day.date));
  return [...mergedDefaults, ...customDays].sort(
    (left, right) => Date.parse(left.date) - Date.parse(right.date),
  );
}

function mergeRecordsWithDefaults<T extends { id: string }>(defaultRecords: T[], storedRecords: T[]) {
  const storedById = new Map(storedRecords.map((record) => [record.id, record]));
  const defaultIds = new Set(defaultRecords.map((record) => record.id));
  const mergedDefaults = defaultRecords.map((defaultRecord) => storedById.get(defaultRecord.id) ?? defaultRecord);
  const customRecords = storedRecords.filter((record) => !defaultIds.has(record.id));

  return [...mergedDefaults, ...customRecords];
}

function uniqueValues(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [now, setNow] = useState(() => new Date());
  const [ownerMode, setOwnerMode] = useState(false);
  const [ownerPin] = useState(DEFAULT_OWNER_PIN);
  const [gateVisible, setGateVisible] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState('');
  const [ownerGestureBuffer, setOwnerGestureBuffer] = useState<string[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [placeCardVisible, setPlaceCardVisible] = useState(false);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');
  const [planPanel, setPlanPanel] = useState<PlanPanel>('calendar');
  const [stops, setStops] = useState<TripStop[]>(sampleTrip.stops);
  const [days, setDays] = useState<TripDay[]>(sampleTrip.days);
  const [todos, setTodos] = useState<TripTodo[]>(sampleTrip.todos);
  const [documents, setDocuments] = useState<TripDocument[]>(sampleTrip.documents);
  const [surprises, setSurprises] = useState<SurpriseStop[]>(sampleTrip.surprises);
  const [storageReady, setStorageReady] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>('light');
  const [currentLocation, setCurrentLocation] = useState<Coordinates | undefined>();
  const [locationStatus, setLocationStatus] = useState('Location is off');
  const [selectedStopId, setSelectedStopId] = useState('mondrian-singapore');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftTeaser, setDraftTeaser] = useState('');
  const [draftAnchorId, setDraftAnchorId] = useState('mondrian-singapore');
  const [draftRevealMode, setDraftRevealMode] = useState<RevealMode>('manual');
  const [stepTitle, setStepTitle] = useState('');
  const [stepCity, setStepCity] = useState('');
  const [stepDate, setStepDate] = useState('2026-08-06');
  const [stepNotes, setStepNotes] = useState('');
  const [stepGuideEnabled, setStepGuideEnabled] = useState(true);
  const [stepGuideStatus, setStepGuideStatus] = useState('');
  const [editingStopId, setEditingStopId] = useState<string | undefined>();
  const [editTitle, setEditTitle] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editMapCategory, setEditMapCategory] = useState<MapCategory>('general');

  const theme = themes[themeKey];

  const trip: Trip = useMemo(
    () => ({
      ...sampleTrip,
      stops,
      days,
      todos,
      documents,
      surprises,
    }),
    [days, documents, stops, surprises, todos],
  );

  const selectedStop = useMemo(
    () => trip.stops.find((stop) => stop.id === selectedStopId) ?? trip.stops[0],
    [selectedStopId, trip.stops],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadStorage() {
      try {
        const [
          storedTheme,
          storedDataVersion,
          storedSurprises,
          storedStops,
          storedDays,
          storedTodos,
          storedDocuments,
        ] =
          await Promise.all([
            SecureStore.getItemAsync(THEME_KEY),
            SecureStore.getItemAsync(DATA_VERSION_KEY),
            readLocalJson<SurpriseStop[]>(SURPRISES_FILE),
            readLocalJson<TripStop[]>(STOPS_FILE),
            readLocalJson<TripDay[]>(DAYS_FILE),
            readLocalJson<TripTodo[]>(TODOS_FILE),
            readLocalJson<TripDocument[]>(DOCUMENTS_FILE),
          ]);

        if (!mounted) {
          return;
        }

        if (storedTheme && storedTheme in themes) {
          setThemeKey(storedTheme as ThemeKey);
        }

        const shouldLoadStoredTrip = storedDataVersion === DATA_VERSION;

        if (Array.isArray(storedStops) && storedStops.length > 0) {
          setStops(
            shouldLoadStoredTrip
              ? storedStops
              : mergeStopsWithDefaults(sampleTrip.stops, storedStops),
          );
        }

        if (Array.isArray(storedDays) && storedDays.length > 0) {
          setDays(
            shouldLoadStoredTrip
              ? storedDays
              : mergeDaysWithDefaults(sampleTrip.days, storedDays),
          );
        }

        if (Array.isArray(storedTodos)) {
          setTodos(
            shouldLoadStoredTrip
              ? storedTodos
              : mergeRecordsWithDefaults(sampleTrip.todos, storedTodos),
          );
        }

        if (Array.isArray(storedDocuments)) {
          setDocuments(storedDocuments);
        }

        if (Array.isArray(storedSurprises)) {
          setSurprises(
            shouldLoadStoredTrip
              ? storedSurprises
              : mergeRecordsWithDefaults(sampleTrip.surprises, storedSurprises),
          );
        }
      } catch {
        setLocationStatus('Local storage unavailable');
      } finally {
        if (mounted) {
          setStorageReady(true);
        }
      }
    }

    loadStorage();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!placeCardVisible) {
      setEditingStopId(undefined);
    }
  }, [placeCardVisible]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    Promise.all([
      writeLocalJson(SURPRISES_FILE, surprises),
      writeLocalJson(STOPS_FILE, stops),
      writeLocalJson(DAYS_FILE, days),
      writeLocalJson(TODOS_FILE, todos),
      writeLocalJson(DOCUMENTS_FILE, documents),
      SecureStore.setItemAsync(THEME_KEY, themeKey),
      SecureStore.setItemAsync(DATA_VERSION_KEY, DATA_VERSION),
    ]).catch(() => {
      setLocationStatus('Could not save local app data');
    });
  }, [days, documents, storageReady, stops, surprises, themeKey, todos]);

  const completedStopIds = useMemo(
    () =>
      trip.stops
        .filter((stop) => Date.parse(stop.startsAt) < now.getTime())
        .map((stop) => stop.id),
    [now, trip.stops],
  );

  const visibleSurprises = useMemo(
    () => {
      if (!ownerMode) {
        return [];
      }

      return getVisibleSurprises(surprises, {
        ownerMode,
        now,
        currentLocation,
        completedStopIds,
      });
    },
    [completedStopIds, currentLocation, now, ownerMode, surprises],
  );

  const visibleDates = useMemo(() => getRollingTripDates(trip, now, 2), [now, trip]);
  const firstVisibleDay = useMemo(
    () => getTripDayByDate(trip, visibleDates[0]),
    [trip, visibleDates],
  );
  const secondVisibleDay = useMemo(
    () => getTripDayByDate(trip, visibleDates[1]),
    [trip, visibleDates],
  );
  const firstVisibleStops = useMemo(
    () => (firstVisibleDay ? getStopsForDay(trip, firstVisibleDay) : []),
    [firstVisibleDay, trip],
  );
  const secondVisibleStops = useMemo(
    () => (secondVisibleDay ? getStopsForDay(trip, secondVisibleDay) : []),
    [secondVisibleDay, trip],
  );
  const upcomingStop = useMemo(() => getUpcomingStop(trip.stops, now), [now, trip.stops]);
  const progress = useMemo(() => getTripProgress(trip.stops, now), [now, trip.stops]);

  function handleOwnerGestureStep(step: string) {
    if (!settingsVisible) {
      return;
    }

    const nextBuffer = [...ownerGestureBuffer, step].slice(-ownerGestureSequence.length);
    setOwnerGestureBuffer(nextBuffer);

    if (doesAccessSequenceUnlock(nextBuffer, ownerGestureSequence)) {
      setOwnerGestureBuffer([]);

      if (ownerMode) {
        setOwnerMode(false);
        setGateVisible(false);
        setSettingsVisible(false);
        setPinEntry('');
        setPinError('');
        return;
      }

      setSettingsVisible(false);
      setPinEntry('');
      setPinError('');
      setTimeout(() => setGateVisible(true), 250);
    }
  }

  function closeSettings() {
    handleOwnerGestureStep('close-settings');
    setSettingsVisible(false);
  }

  function unlockOwnerMode() {
    if (pinEntry.trim() !== ownerPin) {
      setPinError('Wrong code');
      return;
    }

    setOwnerMode(true);
    setGateVisible(false);
    setPinEntry('');
    setPinError('');
    setActiveTab('moments');
  }

  async function requestLocation() {
    setLocationStatus('Finding you...');
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      setLocationStatus('Location permission denied');
      return;
    }

    const location = await Location.getCurrentPositionAsync({});
    setCurrentLocation({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    setLocationStatus('Location on');
  }

  function addSurprise() {
    const title = draftTitle.trim();
    const message = draftMessage.trim();

    if (!title || !message) {
      return;
    }

    const anchor = trip.stops.find((stop) => stop.id === draftAnchorId) ?? trip.stops[0];
    const newSurprise: SurpriseStop = {
      id: `surprise-${Date.now()}`,
      title,
      city: anchor.city,
      country: anchor.country,
      anchorStopId: anchor.id,
      coordinates: offsetCoordinates(anchor.coordinates, surprises.length),
      message,
      teaser: draftTeaser.trim() || `A surprise is waiting near ${anchor.city}.`,
      revealMode: draftRevealMode,
      revealAt: draftRevealMode === 'time' ? anchor.startsAt : undefined,
      revealRadiusMeters: draftRevealMode === 'location' ? 500 : undefined,
      visibility: 'hidden',
      createdBy: 'owner',
      createdAt: new Date().toISOString(),
    };

    setSurprises((current) => [newSurprise, ...current]);
    setDraftTitle('');
    setDraftMessage('');
    setDraftTeaser('');
    setDraftRevealMode('manual');
  }

  async function addStep() {
    const title = stepTitle.trim();
    const city = stepCity.trim() || title;
    const notes = stepNotes.trim() || 'New trip step. Add details later.';

    if (!title) {
      return;
    }

    if (stepGuideEnabled) {
      setStepGuideStatus('Researching TikTok and YouTube tips...');
    }

    const fallback: Coordinates = trip.stops[0]?.coordinates ?? {
      latitude: region.latitude,
      longitude: region.longitude,
    };
    const coordinates = await resolveTypedPlaceCoordinates(`${title} ${city}`, fallback);
    const recommendations = stepGuideEnabled ? await createGuideForPlace(title, city) : undefined;
    const stopId = `step-${Date.now()}`;
    const newStop: TripStop = {
      id: stopId,
      title,
      city,
      country: inferCountry(`${title} ${city}`),
      startsAt: `${stepDate}T10:00:00+08:00`,
      coordinates,
      kind: 'stay',
      notes,
      travelModeFromPrevious: 'car',
      mapVisibility: 'marker',
      mapCategory: inferMapCategory(`${title} ${city}`),
      recommendations,
      coverColor: theme.accentDark,
    };

    const existingDay = days.find((day) => day.date === stepDate);
    const nextDays = existingDay
      ? days.map((day) =>
          day.id === existingDay.id ? { ...day, stops: [...day.stops, stopId] } : day,
        )
      : [
          ...days,
          {
            id: `day-${stepDate}`,
            date: stepDate,
            title: city,
            summary: 'Added from the app.',
            stops: [stopId],
          },
        ].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

    setStops((current) => [...current, newStop]);
    setDays(nextDays);
    setSelectedStopId(stopId);
    setPlaceCardVisible(true);
    setStepTitle('');
    setStepCity('');
    setStepNotes('');
    setStepGuideStatus('');
  }

  function openStopCard(stopId: string) {
    setSelectedStopId(stopId);
    setPlaceCardVisible(true);
  }

  function beginStopEdit(stop: TripStop) {
    setEditingStopId(stop.id);
    setEditTitle(stop.title);
    setEditCity(stop.city);
    setEditDate(stop.startsAt.slice(0, 10));
    setEditNotes(stop.notes);
    setEditMapCategory(stop.mapCategory ?? inferMapCategory(`${stop.title} ${stop.city}`));
  }

  function cancelStopEdit() {
    setEditingStopId(undefined);
    setEditTitle('');
    setEditCity('');
    setEditDate('');
    setEditNotes('');
  }

  function saveStopEdit(stopId: string) {
    const title = editTitle.trim();
    const city = editCity.trim();
    const date = editDate.trim();

    if (!title || !city || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return;
    }

    const existingStop = stops.find((stop) => stop.id === stopId);

    setStops((current) =>
      current.map((stop) =>
        stop.id === stopId
          ? {
              ...stop,
              title,
              city,
              startsAt: replaceIsoDate(stop.startsAt, date),
              notes: editNotes.trim() || 'New trip step. Add details later.',
              mapCategory: editMapCategory,
            }
          : stop,
      ),
    );

    if (existingStop && existingStop.startsAt.slice(0, 10) !== date) {
      setDays((current) => moveStopToDate(current, stopId, date, city));
    }

    setEditingStopId(undefined);
  }

  function requestDeleteStop(stopId: string) {
    const stop = stops.find((item) => item.id === stopId);

    if (!stop) {
      return;
    }

    Alert.alert('Delete card?', `Delete ${stop.title} from the trip?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteStop(stopId),
      },
    ]);
  }

  function deleteStop(stopId: string) {
    const remainingStops = stops.filter((stop) => stop.id !== stopId);
    const nextSelected = getStopsInDateOrder(remainingStops).find(isMapPlaceStop) ?? remainingStops[0];

    setStops(remainingStops);
    setDays((current) =>
      current.map((day) => ({ ...day, stops: day.stops.filter((id) => id !== stopId) })),
    );
    setDocuments((current) => current.filter((document) => document.linkedStopId !== stopId));
    setTodos((current) =>
      current.map((todo) =>
        todo.linkedStopId === stopId ? { ...todo, linkedStopId: undefined } : todo,
      ),
    );
    setSurprises((current) =>
      current.map((surprise) =>
        surprise.anchorStopId === stopId ? { ...surprise, anchorStopId: undefined } : surprise,
      ),
    );
    setSelectedStopId(nextSelected?.id ?? '');
    setEditingStopId(undefined);
    setPlaceCardVisible(false);
  }

  function revealNow(surpriseId: string) {
    setSurprises((current) => revealSurprise(current, surpriseId));
  }

  async function addPdfToStop(stopId: string) {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    const documentId = `document-${Date.now()}`;
    let documentUri = asset.uri;

    try {
      const directory = `${FileSystem.documentDirectory ?? ''}trip-documents/`;
      if (FileSystem.documentDirectory) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        documentUri = `${directory}${documentId}-${safeName}`;
        await FileSystem.copyAsync({ from: asset.uri, to: documentUri });
      }
    } catch {
      documentUri = asset.uri;
    }

    const newDocument: TripDocument = {
      id: documentId,
      name: asset.name,
      uri: documentUri,
      linkedStopId: stopId,
      mimeType: asset.mimeType,
      addedAt: new Date().toISOString(),
    };

    setDocuments((current) => [newDocument, ...current]);
  }

  function openDocument(document: TripDocument) {
    Linking.openURL(document.uri);
  }

  function toggleTodo(todoId: string) {
    setTodos((current) =>
      current.map((todo) => (todo.id === todoId ? { ...todo, done: !todo.done } : todo)),
    );
  }

  return (
    <SafeAreaView style={[styles.shell, { backgroundColor: theme.background }]}>
      <StatusBar style={themeKey === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Roundtrip</Text>
          <Text style={[styles.title, { color: theme.text }]}>{sampleTrip.title}</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.datePill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Plane size={17} color={theme.accentDark} />
            <Text style={[styles.datePillText, { color: theme.text }]}>Aug 2-31</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSettingsVisible(true)}
            style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <SettingsIcon size={20} color={theme.text} />
          </Pressable>
        </View>
      </View>

      {activeTab === 'map' && (
        <MapScreen
          currentLocation={currentLocation}
          locationStatus={locationStatus}
          progress={progress}
          requestLocation={requestLocation}
          selectedStop={selectedStop}
          onOpenStop={openStopCard}
          theme={theme}
          firstVisibleDate={visibleDates[0]}
          firstVisibleDay={firstVisibleDay}
          firstVisibleStops={firstVisibleStops}
          secondVisibleDate={visibleDates[1]}
          secondVisibleDay={secondVisibleDay}
          secondVisibleStops={secondVisibleStops}
          trip={trip}
          upcomingStop={upcomingStop}
          visibleSurprises={visibleSurprises}
        />
      )}

      {activeTab === 'timeline' && (
        <TimelineScreen
          addStep={addStep}
          calendarMode={calendarMode}
          guideEnabled={stepGuideEnabled}
          guideStatus={stepGuideStatus}
          onOpenStop={openStopCard}
          planPanel={planPanel}
          setCalendarMode={setCalendarMode}
          setGuideEnabled={setStepGuideEnabled}
          setPlanPanel={setPlanPanel}
          setStepCity={setStepCity}
          setStepDate={setStepDate}
          setStepNotes={setStepNotes}
          setStepTitle={setStepTitle}
          stepCity={stepCity}
          stepDate={stepDate}
          stepNotes={stepNotes}
          stepTitle={stepTitle}
          theme={theme}
          trip={trip}
          windowStartDate={visibleDates[0]}
        />
      )}

      {activeTab === 'todo' && (
        <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
          <TodoSection theme={theme} toggleTodo={toggleTodo} trip={trip} />
        </ScrollView>
      )}

      {activeTab === 'moments' && (
        <MomentsScreen
          addSurprise={addSurprise}
          draftAnchorId={draftAnchorId}
          draftMessage={draftMessage}
          draftRevealMode={draftRevealMode}
          draftTeaser={draftTeaser}
          draftTitle={draftTitle}
          ownerMode={ownerMode}
          revealNow={revealNow}
          setDraftAnchorId={setDraftAnchorId}
          setDraftMessage={setDraftMessage}
          setDraftRevealMode={setDraftRevealMode}
          setDraftTeaser={setDraftTeaser}
          setDraftTitle={setDraftTitle}
          theme={theme}
          trip={trip}
          visibleSurprises={visibleSurprises}
        />
      )}

      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TabButton
          active={activeTab === 'map'}
          icon={(color) => <MapIcon size={18} color={color} />}
          label="Map"
          onPress={() => setActiveTab('map')}
          theme={theme}
        />
        <TabButton
          active={activeTab === 'timeline'}
          icon={(color) => <CalendarDays size={18} color={color} />}
          label="Plan"
          onPress={() => setActiveTab('timeline')}
          theme={theme}
        />
        <TabButton
          active={activeTab === 'todo'}
          icon={(color) => <ListTodo size={18} color={color} />}
          label="Todo"
          onPress={() => setActiveTab('todo')}
          theme={theme}
        />
        <TabButton
          active={activeTab === 'moments'}
          icon={(color) => <Sparkles size={18} color={color} />}
          label={ownerMode ? 'Studio' : 'Moments'}
          onPress={() => setActiveTab('moments')}
          theme={theme}
        />
      </View>

      <PlaceCardModal
        addPdfToStop={addPdfToStop}
        documents={selectedStop ? trip.documents.filter((document) => document.linkedStopId === selectedStop.id) : []}
        editCity={editCity}
        editDate={editDate}
        editMapCategory={editMapCategory}
        editNotes={editNotes}
        editTitle={editTitle}
        isEditing={selectedStop?.id === editingStopId}
        onCancelEdit={cancelStopEdit}
        onClose={() => setPlaceCardVisible(false)}
        onDeleteStop={requestDeleteStop}
        openDocument={openDocument}
        onSaveEdit={saveStopEdit}
        onStartEdit={beginStopEdit}
        setEditCity={setEditCity}
        setEditDate={setEditDate}
        setEditMapCategory={setEditMapCategory}
        setEditNotes={setEditNotes}
        setEditTitle={setEditTitle}
        stop={selectedStop}
        theme={theme}
        visible={placeCardVisible}
      />

      <SettingsModal
        onClose={closeSettings}
        onHiddenGestureStep={handleOwnerGestureStep}
        setThemeKey={setThemeKey}
        theme={theme}
        themeKey={themeKey}
        visible={settingsVisible}
      />

      <OwnerGateModal
        error={pinError}
        onClose={() => setGateVisible(false)}
        onSubmit={unlockOwnerMode}
        pin={pinEntry}
        setPin={setPinEntry}
        theme={theme}
        visible={gateVisible}
      />
    </SafeAreaView>
  );
}

function MapScreen({
  currentLocation,
  firstVisibleDate,
  firstVisibleDay,
  firstVisibleStops,
  locationStatus,
  onOpenStop,
  progress,
  requestLocation,
  secondVisibleDate,
  secondVisibleDay,
  secondVisibleStops,
  selectedStop,
  theme,
  trip,
  upcomingStop,
  visibleSurprises,
}: {
  currentLocation?: Coordinates;
  firstVisibleDate: string;
  firstVisibleDay?: TripDay;
  firstVisibleStops: TripStop[];
  locationStatus: string;
  onOpenStop: (stopId: string) => void;
  progress: number;
  requestLocation: () => void;
  secondVisibleDate: string;
  secondVisibleDay?: TripDay;
  secondVisibleStops: TripStop[];
  selectedStop?: TripStop;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  upcomingStop?: TripStop;
  visibleSurprises: RevealedSurprise[];
}) {
  const routeStops = useMemo(() => getStopsInDateOrder(trip.stops), [trip.stops]);
  const mapStops = useMemo(() => routeStops.filter(isMapPlaceStop), [routeStops]);

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.mapPanelLarge, { backgroundColor: theme.softSurface }]}>
        <MapView initialRegion={region} style={StyleSheet.absoluteFill}>
          {routeStops.slice(1).map((stop, index) => {
            const previous = routeStops[index];
            return (
              <Polyline
                coordinates={
                  stop.routeCoordinates ??
                  getRouteCoordinates(previous.coordinates, stop.coordinates, stop.travelModeFromPrevious)
                }
                key={`${previous.id}-${stop.id}`}
                lineDashPattern={stop.travelModeFromPrevious === 'flight' ? [10, 8] : undefined}
                strokeColor={getRouteColor(stop, theme)}
                strokeWidth={stop.travelModeFromPrevious === 'flight' ? 3 : 4}
              />
            );
          })}
          {mapStops.map((stop) => (
            <Marker
              coordinate={stop.coordinates}
              key={stop.id}
              onPress={() => onOpenStop(stop.id)}
              description={getMarkerDescription(stop)}
              title={getMarkerTitle(stop)}
            >
              <View
                style={[
                  styles.emojiMarker,
                  { backgroundColor: stop.coverColor },
                ]}
              >
                <Text style={styles.emojiMarkerText}>{getStopEmoji(stop)}</Text>
              </View>
            </Marker>
          ))}
          {visibleSurprises
            .filter((surprise) => surprise.coordinates)
            .map((surprise) => (
              <Marker
                coordinate={surprise.coordinates!}
                description={
                  surprise.currentVisibility === 'revealed' ? surprise.message : surprise.teaser
                }
                key={surprise.id}
                title={surprise.currentVisibility === 'revealed' ? surprise.title : 'Locked surprise'}
                tracksViewChanges={false}
              >
                <View style={[styles.emojiMarker, { backgroundColor: theme.accent }]}>
                  <Text style={styles.emojiMarkerText}>
                    {surprise.currentVisibility === 'revealed' ? '🎁' : '✨'}
                  </Text>
                </View>
              </Marker>
            ))}
          {currentLocation && (
            <Marker coordinate={currentLocation} pinColor={theme.text} title="You are here" />
          )}
        </MapView>
        <View style={[styles.mapBadge, { backgroundColor: theme.surface }]}>
          <Route size={16} color={theme.text} />
          <Text style={[styles.mapBadgeText, { color: theme.text }]}>{progress}% planned</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mapLegend}>
        {mapCategoryLegend.map((item) => (
          <View
            key={item.category}
            style={[styles.legendChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={styles.legendEmoji}>{getMapCategoryEmoji(item.category)}</Text>
            <Text style={[styles.legendText, { color: theme.text }]}>{item.label}</Text>
          </View>
        ))}
      </ScrollView>

      {selectedStop && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenStop(selectedStop.id)}
          style={[styles.selectedMiniCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={styles.settingsTripEmoji}>{getStopEmoji(selectedStop)}</Text>
          <View style={styles.flexOne}>
            <Text style={[styles.compactTitle, { color: theme.text }]}>{selectedStop.title}</Text>
            <Text style={[styles.compactMeta, { color: theme.muted }]}>Open full place card</Text>
          </View>
          <ExternalLink size={16} color={theme.text} />
        </Pressable>
      )}

      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.panelHeader}>
          <View style={styles.flexOne}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>Next up</Text>
            <Text style={[styles.panelTitle, { color: theme.text }]}>
              {upcomingStop?.title ?? 'Trip complete'}
            </Text>
          </View>
          <Compass size={22} color={theme.accentDark} />
        </View>
        <Text style={[styles.bodyText, { color: theme.muted }]}>
          {upcomingStop?.notes ?? 'All planned stops are behind you. Time to turn this into memories.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={requestLocation}
          style={[styles.locationButton, { backgroundColor: theme.accentDark }]}
        >
          <Navigation size={18} color="#FFFFFF" />
          <Text style={styles.locationButtonText}>{locationStatus}</Text>
        </Pressable>
      </View>

      <DayPlanSection
        date={firstVisibleDate}
        day={firstVisibleDay}
        emptyText="No planned trip places on this date."
        onOpenStop={onOpenStop}
        stops={firstVisibleStops}
        theme={theme}
      />
      <DayPlanSection
        date={secondVisibleDate}
        day={secondVisibleDay}
        emptyText="No planned trip places on this date."
        onOpenStop={onOpenStop}
        stops={secondVisibleStops}
        theme={theme}
      />
    </ScrollView>
  );
}

function SelectedStopCard({
  addPdfToStop,
  documents,
  editCity,
  editDate,
  editMapCategory,
  editNotes,
  editTitle,
  isEditing,
  onCancelEdit,
  openDocument,
  onSaveEdit,
  setEditCity,
  setEditDate,
  setEditMapCategory,
  setEditNotes,
  setEditTitle,
  stop,
  theme,
}: {
  addPdfToStop: (stopId: string) => void;
  documents: TripDocument[];
  editCity: string;
  editDate: string;
  editMapCategory: MapCategory;
  editNotes: string;
  editTitle: string;
  isEditing: boolean;
  onCancelEdit: () => void;
  openDocument: (document: TripDocument) => void;
  onSaveEdit: (stopId: string) => void;
  setEditCity: (value: string) => void;
  setEditDate: (value: string) => void;
  setEditMapCategory: (value: MapCategory) => void;
  setEditNotes: (value: string) => void;
  setEditTitle: (value: string) => void;
  stop: TripStop;
  theme: (typeof themes)[ThemeKey];
}) {
  return (
    <View>
      <View style={styles.panelHeader}>
        <View style={styles.flexOne}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>{stop.city}</Text>
          <Text style={[styles.panelTitle, { color: theme.text }]}>{stop.title}</Text>
        </View>
        <MapPin size={22} color={theme.accent} />
      </View>

      {stop.photos && stop.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRail}>
          {stop.photos.map((photo) => (
            <Image key={photo} source={{ uri: photo }} style={styles.stopPhoto} />
          ))}
        </ScrollView>
      )}

      {isEditing ? (
        <View style={styles.editCardArea}>
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Title</Text>
          <TextInput
            onChangeText={setEditTitle}
            placeholder="Card title"
            placeholderTextColor="#8A92A3"
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            value={editTitle}
          />
          <View style={styles.twoColumnRow}>
            <TextInput
              onChangeText={setEditCity}
              placeholder="Area"
              placeholderTextColor="#8A92A3"
              style={[
                styles.input,
                styles.flexOne,
                { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
              ]}
              value={editCity}
            />
            <TextInput
              onChangeText={setEditDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#8A92A3"
              style={[
                styles.input,
                styles.dateInput,
                { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
              ]}
              value={editDate}
            />
          </View>
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryEditRail}>
            {editableMapCategories.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item.category}
                onPress={() => setEditMapCategory(item.category)}
                style={[
                  styles.categoryEditChip,
                  { backgroundColor: theme.softSurface, borderColor: theme.border },
                  editMapCategory === item.category && {
                    backgroundColor: theme.text,
                    borderColor: theme.text,
                  },
                ]}
              >
                <Text style={styles.legendEmoji}>{getMapCategoryEmoji(item.category)}</Text>
                <Text
                  style={[
                    styles.legendText,
                    { color: theme.text },
                    editMapCategory === item.category && { color: theme.surface },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Notes</Text>
          <TextInput
            multiline
            onChangeText={setEditNotes}
            placeholder="Add notes for this place"
            placeholderTextColor="#8A92A3"
            style={[
              styles.input,
              styles.multilineInput,
              { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
            ]}
            value={editNotes}
          />
          <View style={styles.editActionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onSaveEdit(stop.id)}
              style={[styles.editSaveButton, { backgroundColor: theme.text }]}
            >
              <Save size={16} color={theme.surface} />
              <Text style={[styles.revealButtonText, { color: theme.surface }]}>Save</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onCancelEdit}
              style={[styles.editCancelButton, { backgroundColor: theme.softSurface }]}
            >
              <X size={16} color={theme.text} />
              <Text style={[styles.revealButtonText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Notes</Text>
          <Text style={[styles.placeNotesText, { color: theme.text, backgroundColor: theme.softSurface }]}>
            {stop.notes}
          </Text>
        </>
      )}
      {stop.address && (
        <Text style={[styles.addressText, { color: theme.text }]}>{stop.address}</Text>
      )}
      {stop.bookingReference && (
        <Text style={[styles.addressText, { color: theme.text }]}>
          Booking reference: {stop.bookingReference}
        </Text>
      )}
      {stop.links && stop.links.length > 0 && (
        <View style={styles.linkRow}>
          {stop.links.map((link) => (
            <Pressable
              accessibilityRole="link"
              key={link.url}
              onPress={() => Linking.openURL(link.url)}
              style={[styles.linkButton, { backgroundColor: theme.softSurface }]}
            >
              <ExternalLink size={15} color={theme.text} />
              <Text style={[styles.linkButtonText, { color: theme.text }]}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.documentHeader}>
        <Text style={[styles.controlLabel, { color: theme.muted }]}>PDFs and tickets</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => addPdfToStop(stop.id)}
          style={[styles.smallActionButton, { backgroundColor: theme.text }]}
        >
          <Plus size={15} color={theme.surface} />
          <Text style={[styles.smallActionText, { color: theme.surface }]}>Add PDF</Text>
        </Pressable>
      </View>
      {documents.length === 0 ? (
        <Text style={[styles.compactMeta, { color: theme.muted }]}>No PDFs attached yet.</Text>
      ) : (
        documents.map((document) => (
          <Pressable
            accessibilityRole="button"
            key={document.id}
            onPress={() => openDocument(document)}
            style={[styles.documentCard, { backgroundColor: theme.softSurface }]}
          >
            <Text style={styles.documentIcon}>PDF</Text>
            <View style={styles.flexOne}>
              <Text style={[styles.compactTitle, { color: theme.text }]} numberOfLines={1}>
                {document.name}
              </Text>
              <Text style={[styles.compactMeta, { color: theme.muted }]}>
                Added {formatDate(document.addedAt.slice(0, 10))}
              </Text>
            </View>
            <ExternalLink size={16} color={theme.text} />
          </Pressable>
        ))
      )}

      {stop.recommendations && stop.recommendations.length > 0 && (
        <View style={styles.recommendationsArea}>
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Place guide</Text>
          {stop.recommendations.map((group) => (
            <View key={group.id} style={styles.recommendationGroup}>
              <View style={styles.recommendationHeader}>
                <Text style={styles.recommendationIcon}>{group.icon}</Text>
                <Text style={[styles.recommendationTitle, { color: theme.text }]}>{group.title}</Text>
              </View>
              {group.items.map((item) => (
                <Pressable
                  accessibilityRole={item.url ? 'link' : 'button'}
                  disabled={!item.url}
                  key={item.id}
                  onPress={() => item.url && Linking.openURL(item.url)}
                  style={[styles.recommendationItem, { borderColor: theme.border }]}
                >
                  <View style={styles.flexOne}>
                    <View style={styles.recommendationTitleRow}>
                      <Text style={[styles.compactTitle, styles.flexOne, { color: theme.text }]}>
                        {item.title}
                      </Text>
                      {item.sourceLabel && (
                        <Text style={[styles.sourceBadge, { color: theme.accentDark }]}>
                          {item.sourceLabel}
                        </Text>
                      )}
                    </View>
                    {item.notes && (
                      <Text style={[styles.compactMeta, { color: theme.muted }]}>{item.notes}</Text>
                    )}
                  </View>
                  {item.url && <ExternalLink size={16} color={theme.text} />}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PlaceCardModal({
  addPdfToStop,
  documents,
  editCity,
  editDate,
  editMapCategory,
  editNotes,
  editTitle,
  isEditing,
  onCancelEdit,
  onClose,
  onDeleteStop,
  openDocument,
  onSaveEdit,
  onStartEdit,
  setEditCity,
  setEditDate,
  setEditMapCategory,
  setEditNotes,
  setEditTitle,
  stop,
  theme,
  visible,
}: {
  addPdfToStop: (stopId: string) => void;
  documents: TripDocument[];
  editCity: string;
  editDate: string;
  editMapCategory: MapCategory;
  editNotes: string;
  editTitle: string;
  isEditing: boolean;
  onCancelEdit: () => void;
  onClose: () => void;
  onDeleteStop: (stopId: string) => void;
  openDocument: (document: TripDocument) => void;
  onSaveEdit: (stopId: string) => void;
  onStartEdit: (stop: TripStop) => void;
  setEditCity: (value: string) => void;
  setEditDate: (value: string) => void;
  setEditMapCategory: (value: MapCategory) => void;
  setEditNotes: (value: string) => void;
  setEditTitle: (value: string) => void;
  stop?: TripStop;
  theme: (typeof themes)[ThemeKey];
  visible: boolean;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActionsVisible(false);
    }
  }, [visible]);

  if (!stop) {
    return null;
  }

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.placeModalPanel, { backgroundColor: theme.surface }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalActionCluster}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActionsVisible((current) => !current)}
              style={[styles.modalActionButton, { backgroundColor: theme.softSurface }]}
            >
              <Pencil size={19} color={theme.text} />
            </Pressable>
            {actionsVisible && (
              <View style={[styles.cardActionMenu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setActionsVisible(false);
                    onStartEdit(stop);
                  }}
                  style={styles.cardActionItem}
                >
                  <Pencil size={16} color={theme.text} />
                  <Text style={[styles.cardActionText, { color: theme.text }]}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setActionsVisible(false);
                    onDeleteStop(stop.id);
                  }}
                  style={styles.cardActionItem}
                >
                  <Trash2 size={16} color="#C5392D" />
                  <Text style={[styles.cardActionText, { color: '#C5392D' }]}>Delete</Text>
                </Pressable>
              </View>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.modalCloseButton, { backgroundColor: theme.softSurface }]}
          >
            <X size={20} color={theme.text} />
          </Pressable>
          <ScrollView showsVerticalScrollIndicator={false}>
            <SelectedStopCard
              addPdfToStop={addPdfToStop}
              documents={documents}
              editCity={editCity}
              editDate={editDate}
              editMapCategory={editMapCategory}
              editNotes={editNotes}
              editTitle={editTitle}
              isEditing={isEditing}
              onCancelEdit={onCancelEdit}
              openDocument={openDocument}
              onSaveEdit={onSaveEdit}
              setEditCity={setEditCity}
              setEditDate={setEditDate}
              setEditMapCategory={setEditMapCategory}
              setEditNotes={setEditNotes}
              setEditTitle={setEditTitle}
              stop={stop}
              theme={theme}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DayPlanSection({
  date,
  day,
  emptyText,
  onOpenStop,
  stops,
  theme,
}: {
  date: string;
  day?: TripDay;
  emptyText: string;
  onOpenStop: (stopId: string) => void;
  stops: TripStop[];
  theme: (typeof themes)[ThemeKey];
}) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{formatDate(date)}</Text>
          {day && <Text style={[styles.sectionMeta, { color: theme.muted }]}>{day.title}</Text>}
        </View>
        <Text style={[styles.sectionMeta, { color: theme.muted }]}>
          {day ? `${stops.length} places` : 'Real date'}
        </Text>
      </View>
      {stops.length === 0 ? (
        <View style={[styles.emptyMini, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.compactMeta, { color: theme.muted }]}>{emptyText}</Text>
        </View>
      ) : (
        stops.map((stop) => (
          <StopCard key={stop.id} onPress={() => onOpenStop(stop.id)} stop={stop} theme={theme} />
        ))
      )}
    </View>
  );
}

function CalendarSection({
  mode,
  onOpenStop,
  setMode,
  theme,
  trip,
  windowStartDate,
}: {
  mode: CalendarMode;
  onOpenStop: (stopId: string) => void;
  setMode: (mode: CalendarMode) => void;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  windowStartDate: string;
}) {
  const visibleDays = useMemo(
    () => getCalendarDays(trip.days, mode, windowStartDate),
    [mode, trip.days, windowStartDate],
  );

  return (
    <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.panelHeader}>
        <View style={styles.flexOne}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Calendar</Text>
          <Text style={[styles.panelTitle, { color: theme.text }]}>
            {mode === 'week' ? 'Weekly view' : 'Monthly view'}
          </Text>
        </View>
      </View>
      <View style={styles.segmentRow}>
        {(['week', 'month'] as CalendarMode[]).map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => setMode(option)}
            style={[
              styles.segment,
              { backgroundColor: theme.surface, borderColor: theme.border },
              mode === option && { backgroundColor: theme.text, borderColor: theme.text },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: theme.text },
                mode === option && { color: theme.surface },
              ]}
            >
              {option === 'week' ? 'Week' : 'Month'}
            </Text>
          </Pressable>
        ))}
      </View>
      {visibleDays.map((day) => {
        const stops = getStopsForDay(trip, day);
        return (
          <View key={day.id} style={[styles.calendarRow, { borderColor: theme.border }]}>
            <View style={styles.calendarDateCell}>
              <Text style={[styles.calendarDay, { color: theme.text }]}>{day.date.slice(8, 10)}</Text>
              <Text style={[styles.compactMeta, { color: theme.muted }]}>
                {formatWeekday(day.date)}
              </Text>
            </View>
            <View style={styles.flexOne}>
              <Text style={[styles.compactTitle, { color: theme.text }]}>{day.title}</Text>
              {stops.map((stop) => (
                <Pressable
                  accessibilityRole="button"
                  key={stop.id}
                  onPress={() => onOpenStop(stop.id)}
                  style={styles.calendarStop}
                >
                  <Text style={styles.calendarStopEmoji}>{getStopEmoji(stop)}</Text>
                  <Text style={[styles.compactMeta, { color: theme.muted }]}>{stop.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TodoSection({
  theme,
  toggleTodo,
  trip,
}: {
  theme: (typeof themes)[ThemeKey];
  toggleTodo: (todoId: string) => void;
  trip: Trip;
}) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>To do</Text>
        <Text style={[styles.sectionMeta, { color: theme.muted }]}>
          {trip.todos.filter((todo) => !todo.done).length} open
        </Text>
      </View>
      {trip.todos.map((todo) => (
        <Pressable
          accessibilityRole="button"
          key={todo.id}
          onPress={() => toggleTodo(todo.id)}
          style={[styles.todoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View
            style={[
              styles.todoCheck,
              { borderColor: todo.done ? theme.accentDark : theme.border },
              todo.done && { backgroundColor: theme.accentDark },
            ]}
          >
            {todo.done && <Check size={16} color="#FFFFFF" />}
          </View>
          <View style={styles.flexOne}>
            <Text style={[styles.compactTitle, { color: theme.text }]}>{todo.title}</Text>
            <Text style={[styles.bodyText, { color: theme.muted }]}>{todo.notes}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function TimelineScreen({
  addStep,
  calendarMode,
  guideEnabled,
  guideStatus,
  onOpenStop,
  planPanel,
  setCalendarMode,
  setGuideEnabled,
  setPlanPanel,
  setStepCity,
  setStepDate,
  setStepNotes,
  setStepTitle,
  stepCity,
  stepDate,
  stepNotes,
  stepTitle,
  theme,
  trip,
  windowStartDate,
}: {
  addStep: () => void;
  calendarMode: CalendarMode;
  guideEnabled: boolean;
  guideStatus: string;
  onOpenStop: (stopId: string) => void;
  planPanel: PlanPanel;
  setCalendarMode: (mode: CalendarMode) => void;
  setGuideEnabled: (value: boolean) => void;
  setPlanPanel: (panel: PlanPanel) => void;
  setStepCity: (value: string) => void;
  setStepDate: (value: string) => void;
  setStepNotes: (value: string) => void;
  setStepTitle: (value: string) => void;
  stepCity: string;
  stepDate: string;
  stepNotes: string;
  stepTitle: string;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  windowStartDate: string;
}) {
  const canAddStep =
    stepTitle.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(stepDate) &&
    guideStatus.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.segmentRow}>
        {(['calendar', 'new'] as PlanPanel[]).map((panel) => (
          <Pressable
            accessibilityRole="button"
            key={panel}
            onPress={() => setPlanPanel(panel)}
            style={[
              styles.segment,
              { backgroundColor: theme.surface, borderColor: theme.border },
              planPanel === panel && { backgroundColor: theme.text, borderColor: theme.text },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: theme.text },
                planPanel === panel && { color: theme.surface },
              ]}
            >
              {panel === 'calendar' ? 'Calendar' : 'New'}
            </Text>
          </Pressable>
        ))}
      </View>

      {planPanel === 'calendar' ? (
        <CalendarSection
          mode={calendarMode}
          onOpenStop={onOpenStop}
          setMode={setCalendarMode}
          theme={theme}
          trip={trip}
          windowStartDate={windowStartDate}
        />
      ) : (
        <>
          <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.panelHeader}>
              <View style={styles.flexOne}>
                <Text style={[styles.eyebrow, { color: theme.muted }]}>Add place</Text>
                <Text style={[styles.panelTitle, { color: theme.text }]}>New place or idea</Text>
              </View>
              <Plus size={22} color={theme.accent} />
            </View>
            <TextInput
              onChangeText={setStepTitle}
              placeholder="Place, e.g. Gili Islands"
              placeholderTextColor="#8A92A3"
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
              value={stepTitle}
            />
            <View style={styles.twoColumnRow}>
              <TextInput
                onChangeText={setStepCity}
                placeholder="Area"
                placeholderTextColor="#8A92A3"
                style={[
                  styles.input,
                  styles.flexOne,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
                ]}
                value={stepCity}
              />
              <TextInput
                onChangeText={setStepDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8A92A3"
                style={[
                  styles.input,
                  styles.dateInput,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
                ]}
                value={stepDate}
              />
            </View>
            <TextInput
              multiline
              onChangeText={setStepNotes}
              placeholder="Notes, categories, or why it belongs here"
              placeholderTextColor="#8A92A3"
              style={[
                styles.input,
                styles.multilineInput,
                { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
              ]}
              value={stepNotes}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: guideEnabled }}
              onPress={() => setGuideEnabled(!guideEnabled)}
              style={[styles.guideToggle, { backgroundColor: theme.softSurface }]}
            >
              <View
                style={[
                  styles.todoCheck,
                  { borderColor: guideEnabled ? theme.accentDark : theme.border },
                  guideEnabled && { backgroundColor: theme.accentDark },
                ]}
              >
                {guideEnabled && <Check size={16} color="#FFFFFF" />}
              </View>
              <View style={styles.flexOne}>
            <Text style={[styles.compactTitle, { color: theme.text }]}>Create guide card</Text>
            <Text style={[styles.compactMeta, { color: theme.muted }]}>
              Adds social-video research, starter categories, and map links for this place.
            </Text>
          </View>
        </Pressable>
        {guideStatus ? (
          <Text style={[styles.compactMeta, { color: theme.accentDark }]}>{guideStatus}</Text>
        ) : null}
        <Pressable
              accessibilityRole="button"
              disabled={!canAddStep}
              onPress={addStep}
              style={[
                styles.addButton,
                { backgroundColor: theme.accent },
                !canAddStep && styles.addButtonDisabled,
              ]}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add place</Text>
            </Pressable>
          </View>

          {trip.days.map((day, dayIndex) => {
            const dayStops = getStopsForDay(trip, day);
            return (
              <View key={day.id} style={styles.dayBlock}>
                <View style={[styles.dayMarker, { backgroundColor: theme.text }]}>
                  <Text style={[styles.dayNumber, { color: theme.surface }]}>{dayIndex + 1}</Text>
                </View>
                <View style={[styles.dayBody, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.dayDate, { color: theme.accentDark }]}>{formatDate(day.date)}</Text>
                  <Text style={[styles.dayTitle, { color: theme.text }]}>{day.title}</Text>
                  <Text style={[styles.bodyText, { color: theme.muted }]}>{day.summary}</Text>
                  {dayStops.map((stop) => (
                    <Pressable
                      accessibilityRole="button"
                      key={stop.id}
                      onPress={() => onOpenStop(stop.id)}
                      style={styles.compactStop}
                    >
                      <View style={[styles.compactDot, { backgroundColor: stop.coverColor }]} />
                      <View style={styles.compactText}>
                        <Text style={[styles.compactTitle, { color: theme.text }]}>{stop.title}</Text>
                        <Text style={[styles.compactMeta, { color: theme.muted }]}>
                          {formatTime(stop.startsAt)} - {stop.city}
                        </Text>
                      </View>
                      <ExternalLink size={15} color={theme.text} />
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function MomentsScreen({
  addSurprise,
  draftAnchorId,
  draftMessage,
  draftRevealMode,
  draftTeaser,
  draftTitle,
  ownerMode,
  revealNow,
  setDraftAnchorId,
  setDraftMessage,
  setDraftRevealMode,
  setDraftTeaser,
  setDraftTitle,
  theme,
  trip,
  visibleSurprises,
}: {
  addSurprise: () => void;
  draftAnchorId: string;
  draftMessage: string;
  draftRevealMode: RevealMode;
  draftTeaser: string;
  draftTitle: string;
  ownerMode: boolean;
  revealNow: (surpriseId: string) => void;
  setDraftAnchorId: (value: string) => void;
  setDraftMessage: (value: string) => void;
  setDraftRevealMode: (value: RevealMode) => void;
  setDraftTeaser: (value: string) => void;
  setDraftTitle: (value: string) => void;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  visibleSurprises: RevealedSurprise[];
}) {
  const canAdd = draftTitle.trim().length > 0 && draftMessage.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      {ownerMode && (
        <View style={[styles.studioPanel, { backgroundColor: theme.softSurface, borderColor: theme.border }]}>
          <View style={styles.panelHeader}>
            <View style={styles.flexOne}>
              <Text style={[styles.eyebrow, { color: theme.muted }]}>Owner only</Text>
              <Text style={[styles.panelTitle, { color: theme.text }]}>Surprise Studio</Text>
            </View>
            <KeyRound size={22} color={theme.accent} />
          </View>
          <TextInput
            onChangeText={setDraftTitle}
            placeholder="Title"
            placeholderTextColor="#8A92A3"
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            value={draftTitle}
          />
          <TextInput
            multiline
            onChangeText={setDraftMessage}
            placeholder="Reveal message"
            placeholderTextColor="#8A92A3"
            style={[
              styles.input,
              styles.multilineInput,
              { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
            ]}
            value={draftMessage}
          />
          <TextInput
            onChangeText={setDraftTeaser}
            placeholder="Optional teaser"
            placeholderTextColor="#8A92A3"
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            value={draftTeaser}
          />
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Reveal</Text>
          <View style={styles.segmentRow}>
            {revealModes.map((mode) => (
              <Pressable
                accessibilityRole="button"
                key={mode.value}
                onPress={() => setDraftRevealMode(mode.value)}
                style={[
                  styles.segment,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  draftRevealMode === mode.value && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: theme.text },
                    draftRevealMode === mode.value && { color: theme.surface },
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Near</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.anchorScroll}>
            {trip.stops.slice(0, 10).map((stop) => (
              <Pressable
                accessibilityRole="button"
                key={stop.id}
                onPress={() => setDraftAnchorId(stop.id)}
                style={[
                  styles.anchorChip,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  draftAnchorId === stop.id && { backgroundColor: theme.accentDark, borderColor: theme.accentDark },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.anchorChipText,
                    { color: theme.text },
                    draftAnchorId === stop.id && styles.anchorChipTextActive,
                  ]}
                >
                  {stop.city}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            disabled={!canAdd}
            onPress={addSurprise}
            style={[
              styles.addButton,
              { backgroundColor: theme.accent },
              !canAdd && styles.addButtonDisabled,
            ]}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add surprise</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {ownerMode ? 'All surprises' : 'Moments'}
        </Text>
        <Text style={[styles.sectionMeta, { color: theme.muted }]}>
          {ownerMode ? `${visibleSurprises.length} visible` : 'Trip notes'}
        </Text>
      </View>

      {visibleSurprises.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Sparkles size={24} color={theme.accentDark} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {ownerMode ? 'Nothing revealed yet' : 'No moments yet'}
          </Text>
          <Text style={[styles.bodyText, { color: theme.muted }]}>
            {ownerMode
              ? 'The shared trip stays clean until a surprise is ready.'
              : 'Photos and little travel notes can live here during the trip.'}
          </Text>
        </View>
      )}

      {visibleSurprises.map((surprise) => (
        <View
          key={surprise.id}
          style={[styles.surpriseCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.surpriseIcon, { backgroundColor: theme.accent }]}>
            {surprise.currentVisibility === 'revealed' ? (
              <Eye size={20} color="#1C1E2E" />
            ) : (
              <Sparkles size={20} color="#1C1E2E" />
            )}
          </View>
          <View style={styles.surpriseBody}>
            <Text style={[styles.surpriseTitle, { color: theme.text }]}>
              {surprise.currentVisibility === 'revealed' ? surprise.title : 'Locked surprise'}
            </Text>
            <Text style={[styles.bodyText, { color: theme.muted }]}>
              {surprise.currentVisibility === 'revealed'
                ? surprise.message
                : surprise.teaser ?? 'Something is waiting.'}
            </Text>
            <Text style={[styles.compactMeta, { color: theme.muted }]}>
              {surprise.city} - {surprise.revealMode}
            </Text>
            {ownerMode && surprise.visibility !== 'revealed' && (
              <Pressable
                accessibilityRole="button"
                onPress={() => revealNow(surprise.id)}
                style={[styles.revealButton, { backgroundColor: theme.text }]}
              >
                <Check size={16} color={theme.surface} />
                <Text style={[styles.revealButtonText, { color: theme.surface }]}>Reveal now</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function SettingsScreen({
  onHiddenGestureStep,
  setThemeKey,
  theme,
  themeKey,
}: {
  onHiddenGestureStep: (step: string) => void;
  setThemeKey: (themeKey: ThemeKey) => void;
  theme: (typeof themes)[ThemeKey];
  themeKey: ThemeKey;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.panelHeader}>
          <View style={styles.flexOne}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>Settings</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onHiddenGestureStep('appearance-title')}
            >
              <Text style={[styles.panelTitle, { color: theme.text }]}>Appearance</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onHiddenGestureStep('palette')}
            style={[styles.iconButton, { backgroundColor: theme.softSurface }]}
          >
            <Palette size={22} color={theme.accent} />
          </Pressable>
        </View>
        <View style={styles.themeGrid}>
          {(Object.keys(themes) as ThemeKey[]).map((key) => {
            const option = themes[key];
            return (
              <Pressable
                accessibilityRole="button"
                key={key}
                onPress={() => setThemeKey(key)}
                style={[
                  styles.themeOption,
                  { backgroundColor: option.background, borderColor: themeKey === key ? option.accentDark : theme.border },
                ]}
              >
                <View style={[styles.themeSwatch, { backgroundColor: option.accent }]} />
                <Text style={[styles.themeOptionText, { color: option.text }]}>{option.label}</Text>
                {themeKey === key && <Check size={16} color={option.text} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function SettingsModal({
  onClose,
  onHiddenGestureStep,
  setThemeKey,
  theme,
  themeKey,
  visible,
}: {
  onClose: () => void;
  onHiddenGestureStep: (step: string) => void;
  setThemeKey: (themeKey: ThemeKey) => void;
  theme: (typeof themes)[ThemeKey];
  themeKey: ThemeKey;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.settingsModalPanel, { backgroundColor: theme.background }]}>
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: theme.text }]}>Settings</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.iconButton, { backgroundColor: theme.surface }]}
            >
              <X size={20} color={theme.text} />
            </Pressable>
          </View>
          <SettingsScreen
            onHiddenGestureStep={onHiddenGestureStep}
            setThemeKey={setThemeKey}
            theme={theme}
            themeKey={themeKey}
          />
        </View>
      </View>
    </Modal>
  );
}

function StopCard({
  onPress,
  stop,
  theme,
}: {
  onPress?: () => void;
  stop: TripStop;
  theme: (typeof themes)[ThemeKey];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.stopCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={[styles.stopColor, { backgroundColor: stop.coverColor }]} />
      <View style={styles.stopCardBody}>
        <View style={styles.stopTitleRow}>
          <Text style={[styles.stopTitle, { color: theme.text }]}>{stop.title}</Text>
          <Text style={[styles.stopTime, { color: theme.accent }]}>{formatTime(stop.startsAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <MapPin size={14} color={theme.accentDark} />
          <Text style={[styles.compactMeta, { color: theme.muted }]}>
            {stop.city}, {stop.country}
          </Text>
        </View>
        <Text style={[styles.bodyText, { color: theme.muted }]}>{stop.notes}</Text>
        {stop.bookingReference && (
          <Text style={[styles.addressText, { color: theme.text }]}>Ref: {stop.bookingReference}</Text>
        )}
      </View>
    </Pressable>
  );
}

function TabButton({
  active,
  icon,
  label,
  onPress,
  theme,
}: {
  active: boolean;
  icon: (color: string) => React.ReactNode;
  label: string;
  onPress: () => void;
  theme: (typeof themes)[ThemeKey];
}) {
  const color = active ? theme.surface : theme.muted;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tabButton, active && { backgroundColor: theme.text }]}
    >
      {icon(color)}
      <Text style={[styles.tabText, { color }, label === 'Settings' && styles.tabTextSmall]}>
        {label}
      </Text>
    </Pressable>
  );
}

function OwnerGateModal({
  error,
  onClose,
  onSubmit,
  pin,
  setPin,
  theme,
  visible,
}: {
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  pin: string;
  setPin: (value: string) => void;
  theme: (typeof themes)[ThemeKey];
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.modalBackdrop}
      >
        <View style={[styles.gatePanel, { backgroundColor: theme.surface }]}>
          <View style={styles.panelHeader}>
            <View style={styles.flexOne}>
              <Text style={[styles.eyebrow, { color: theme.muted }]}>Private</Text>
              <Text style={[styles.panelTitle, { color: theme.text }]}>Enter code</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.iconButton, { backgroundColor: theme.softSurface }]}
            >
              <X size={20} color={theme.text} />
            </Pressable>
          </View>
          <TextInput
            autoFocus
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={setPin}
            placeholder="Code"
            placeholderTextColor="#8A92A3"
            secureTextEntry
            style={[
              styles.pinInput,
              { backgroundColor: theme.softSurface, borderColor: theme.border, color: theme.text },
            ]}
            value={pin}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={onSubmit}
            style={[styles.unlockButton, { backgroundColor: theme.text }]}
          >
            <KeyRound size={18} color={theme.surface} />
            <Text style={[styles.unlockButtonText, { color: theme.surface }]}>Unlock</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getStopsInDateOrder(stops: TripStop[]) {
  return stops.slice().sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}

function isMapPlaceStop(stop: TripStop) {
  if (stop.mapVisibility === 'route-only') {
    return false;
  }

  if (stop.kind === 'arrival') {
    return false;
  }

  if (stop.travelModeFromPrevious === 'flight' && stop.title.toLowerCase().includes('flight')) {
    return false;
  }

  return true;
}

function getCalendarDays(days: TripDay[], mode: CalendarMode, windowStartDate: string) {
  const sortedDays = days
    .slice()
    .sort((left, right) => Date.parse(`${left.date}T12:00:00`) - Date.parse(`${right.date}T12:00:00`));

  if (mode === 'week') {
    const endDate = addIsoDays(windowStartDate, 7);
    return sortedDays.filter((day) => day.date >= windowStartDate && day.date < endDate);
  }

  const month = windowStartDate.slice(0, 7);
  return sortedDays.filter((day) => day.date.startsWith(month));
}

function addIsoDays(date: string, offsetDays: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

function replaceIsoDate(value: string, date: string) {
  return value.replace(/^\d{4}-\d{2}-\d{2}/, date);
}

function moveStopToDate(days: TripDay[], stopId: string, date: string, title: string) {
  const cleanedDays = days.map((day) => ({
    ...day,
    stops: day.stops.filter((id) => id !== stopId),
  }));
  const existingDay = cleanedDays.find((day) => day.date === date);

  if (existingDay) {
    return cleanedDays.map((day) =>
      day.date === date ? { ...day, stops: uniqueValues([...day.stops, stopId]) } : day,
    );
  }

  return [
    ...cleanedDays,
    {
      id: `day-${date}`,
      date,
      title,
      summary: 'Added from the app.',
      stops: [stopId],
    },
  ].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}

function inferCountry(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes('singapore')) {
    return 'Singapore';
  }

  if (normalized.includes('zurich') || normalized.includes('zürich')) {
    return 'Switzerland';
  }

  return 'Indonesia';
}

async function resolveTypedPlaceCoordinates(
  query: string,
  fallback: Coordinates,
): Promise<Coordinates> {
  const localCoordinates = resolvePlaceCoordinates(query, fallback);
  if (!sameCoordinates(localCoordinates, fallback)) {
    return localCoordinates;
  }

  try {
    const results = await Location.geocodeAsync(query);
    const first = results[0];
    if (first) {
      return {
        latitude: first.latitude,
        longitude: first.longitude,
      };
    }
  } catch {
    // Keep the local fallback when device geocoding is unavailable.
  }

  return localCoordinates;
}

function sameCoordinates(left: Coordinates, right: Coordinates) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function inferMapCategory(value: string): MapCategory {
  const normalized = value.toLowerCase();

  if (
    normalized.includes('bromo') ||
    normalized.includes('ijen') ||
    normalized.includes('mount') ||
    normalized.includes('hike') ||
    normalized.includes('volcano')
  ) {
    return 'hike';
  }

  if (
    normalized.includes('gili') ||
    normalized.includes('beach') ||
    normalized.includes('surf') ||
    normalized.includes('komodo') ||
    normalized.includes('labuan bajo') ||
    normalized.includes('lombok')
  ) {
    return 'beach';
  }

  if (
    normalized.includes('hotel') ||
    normalized.includes('stay') ||
    normalized.includes('resort') ||
    normalized.includes('villa')
  ) {
    return 'stay';
  }

  if (
    normalized.includes('restaurant') ||
    normalized.includes('food') ||
    normalized.includes('bar') ||
    normalized.includes('cafe')
  ) {
    return 'food';
  }

  return 'general';
}

async function createGuideForPlace(title: string, city: string): Promise<PlaceRecommendationGroup[]> {
  const label = `${title} ${city}`.trim();
  const socialGroups = await createSocialResearchGroups(label, {
    backendEndpoint: process.env.EXPO_PUBLIC_SOCIAL_RESEARCH_ENDPOINT,
    youtubeApiKey: process.env.EXPO_PUBLIC_YOUTUBE_API_KEY,
  });

  return [...socialGroups, ...createLocalGuideForPlace(label)];
}

function createLocalGuideForPlace(label: string): PlaceRecommendationGroup[] {
  const normalized = label.toLowerCase();

  if (normalized.includes('gili')) {
    return [
      createGuideGroup('food', 'Food', '🍜', label, ['beach dinner', 'seafood', 'cafes']),
      createGuideGroup('sea', 'Sea / beaches', '🏖️', label, ['snorkeling', 'sunset beach', 'boat trip']),
      createGuideGroup('photo', 'Photos to collect', '📷', label, ['sunset viewpoint', 'snorkeling photos', 'island bike route']),
    ];
  }

  if (normalized.includes('komodo') || normalized.includes('labuan bajo')) {
    return [
      createGuideGroup('boats', 'Boats / islands', '⛵', label, ['Komodo National Park tours', 'Padar Island', 'Pink Beach']),
      createGuideGroup('food', 'Food', '🍜', label, ['sunset dinner', 'seafood', 'cafes']),
      createGuideGroup('photo', 'Photos to collect', '📷', label, ['Padar viewpoint', 'boat deck', 'snorkeling spots']),
    ];
  }

  if (normalized.includes('bromo') || normalized.includes('ijen')) {
    return [
      createGuideGroup('hikes', 'Hikes', '⛰️', label, ['sunrise viewpoint', 'guided hike', 'weather and safety']),
      createGuideGroup('logistics', 'Logistics', '🚗', label, ['driver', 'hotel pickup', 'warm clothes']),
      createGuideGroup('photo', 'Photos to collect', '📷', label, ['sunrise viewpoint', 'crater view', 'jeep route']),
    ];
  }

  if (normalized.includes('bali') || normalized.includes('ubud') || normalized.includes('canggu') || normalized.includes('uluwatu')) {
    return [
      createGuideGroup('food', 'Food', '🍜', label, ['restaurants', 'local food', 'cafes']),
      createGuideGroup('bars', 'Bars / sunset', '🍸', label, ['cocktails', 'sunset bar', 'date night']),
      createGuideGroup('sightseeing', 'Sightseeing', '👀', label, ['temples', 'rice terraces', 'day trips']),
      createGuideGroup('beaches', 'Beaches / surf', '🏄', label, ['surf lesson', 'beach club', 'swimming beach']),
      createGuideGroup('photo', 'Photos to collect', '📷', label, ['viewpoints', 'hotel photos', 'sunset spots']),
    ];
  }

  return [
    createGuideGroup('food', 'Food', '🍜', label, ['restaurants', 'local food', 'cafes']),
    createGuideGroup('bars', 'Bars / restaurants', '🍸', label, ['cocktails', 'date night', 'nice restaurants']),
    createGuideGroup('sightseeing', 'Sightseeing', '👀', label, ['things to do', 'best viewpoints', 'walking route']),
    createGuideGroup('beaches', 'Beaches / nature', '🏖️', label, ['beaches', 'parks', 'nature spots']),
    createGuideGroup('photo', 'Photos to collect', '📷', label, ['best photo spots', 'views', 'places to photograph']),
  ];
}

function createGuideGroup(
  id: string,
  title: string,
  icon: string,
  place: string,
  searches: string[],
): PlaceRecommendationGroup {
  return {
    id: `${id}-${slugify(place)}`,
    title,
    icon,
    items: searches.map((search) => ({
      id: `${id}-${slugify(place)}-${slugify(search)}`,
      title: toTitleCase(search),
      notes: `Starter search for ${search} around ${place}.`,
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${search} ${place}`)}`,
    })),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStopEmoji(stop: TripStop) {
  return getMapCategoryEmoji(stop.mapCategory ?? inferMapCategory(`${stop.title} ${stop.city}`), stop);
}

function getMapCategoryEmoji(category: MapCategory, stop?: TripStop) {
  if (category === 'general') {
    return '📍';
  }

  if (category === 'stay') {
    return '🏠';
  }

  if (category === 'hike') {
    return '⛰️';
  }

  if (category === 'beach') {
    return stop?.title.toLowerCase().includes('komodo') ? '⛵' : '🏖️';
  }

  if (category === 'food') {
    return '🍽️';
  }

  if (category === 'activity') {
    return '👀';
  }

  if (category === 'travel') {
    return '✈️';
  }

  return '📍';
}

function getMarkerTitle(stop: TripStop) {
  if (stop.id === 'zurich-departure') {
    return 'LX176 Zurich to Singapore';
  }

  if (stop.id === 'lx176-arrival') {
    return 'Arrive in Singapore';
  }

  if (stop.id === 'east-java-transfer') {
    return 'Bromo volcano base';
  }

  if (stop.id === 'mount-bromo') {
    return 'Hiking Mount Bromo';
  }

  if (stop.id === 'bali-flight-tbd') {
    return 'Flight to Bali';
  }

  if (stop.id === 'lombok-gili-islands') {
    return 'Lombok and Gili Islands';
  }

  if (stop.id === 'labuan-bajo-komodo') {
    return 'Labuan Bajo and Komodo';
  }

  if (stop.id === 'sq346-arrival-zurich') {
    return 'SQ346 Singapore to Zurich';
  }

  return stop.title;
}

function getMarkerDescription(stop: TripStop) {
  if (stop.id === 'zurich-departure') {
    return 'Overnight flight from Zurich to Singapore.';
  }

  if (stop.id === 'lx176-arrival') {
    return 'Landing at Changi on LX176.';
  }

  if (stop.id === 'east-java-transfer') {
    return 'Base for Mount Bromo and possible nearby volcano hikes.';
  }

  if (stop.id === 'mount-bromo') {
    return 'Sunrise hike at Mount Bromo.';
  }

  if (stop.id === 'lombok-gili-islands') {
    return 'Sea days, surf, snorkeling, and the Gili Islands.';
  }

  if (stop.id === 'labuan-bajo-komodo') {
    return 'Base for Komodo boats, islands, and snorkeling.';
  }

  if (stop.id === 'sq346-arrival-zurich') {
    return 'Singapore to Zurich on SQ346.';
  }

  if (stop.kind === 'stay') {
    return `Stay in ${stop.city}.`;
  }

  if (stop.travelModeFromPrevious === 'flight') {
    return stop.bookingReference
      ? `${stop.title}. Booking reference ${stop.bookingReference}.`
      : stop.title;
  }

  return stop.notes;
}

function getRouteColor(stop: TripStop, theme: (typeof themes)[ThemeKey]) {
  if (stop.travelModeFromPrevious === 'flight') {
    return '#3C76B6';
  }

  if (stop.travelModeFromPrevious === 'boat') {
    return '#27A9E0';
  }

  return theme.accent;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${value}T12:00:00`));
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    height: 48,
    justifyContent: 'center',
    marginTop: 14,
  },
  addButtonDisabled: {
    backgroundColor: '#B9BFC9',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  addressText: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  anchorChip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginRight: 8,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  anchorChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  anchorChipTextActive: {
    color: '#FFFFFF',
  },
  anchorScroll: {
    marginTop: 8,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  calendarDateCell: {
    alignItems: 'center',
    width: 46,
  },
  calendarDay: {
    fontSize: 20,
    fontWeight: '900',
  },
  calendarRow: {
    alignItems: 'flex-start',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  calendarStop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 5,
  },
  calendarStopEmoji: {
    fontSize: 15,
  },
  cardActionItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  cardActionMenu: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    minWidth: 118,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '900',
  },
  categoryEditChip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 36,
    marginRight: 8,
    paddingHorizontal: 10,
  },
  categoryEditRail: {
    marginTop: 8,
  },
  compactDot: {
    borderRadius: 5,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  compactMeta: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  compactStop: {
    alignItems: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    minHeight: 46,
    paddingVertical: 6,
  },
  compactText: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 14,
    textTransform: 'uppercase',
  },
  datePill: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  dateInput: {
    width: 126,
  },
  dayBlock: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  dayBody: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  dayDate: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dayMarker: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '900',
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyMini: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  documentCard: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  documentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  documentIcon: {
    color: '#C5392D',
    fontSize: 12,
    fontWeight: '900',
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  editCancelButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    justifyContent: 'center',
  },
  editCardArea: {
    marginTop: 2,
  },
  editSaveButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    justifyContent: 'center',
  },
  emojiMarker: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: 36,
  },
  emojiMarkerText: {
    fontSize: 19,
  },
  errorText: {
    color: '#C5392D',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  flexOne: {
    flex: 1,
  },
  gatePanel: {
    borderRadius: 8,
    padding: 18,
    width: '86%',
  },
  guideToggle: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    minHeight: 56,
    paddingHorizontal: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    marginTop: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  linkButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  legendChip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    marginRight: 8,
    paddingHorizontal: 10,
  },
  legendEmoji: {
    fontSize: 15,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '800',
  },
  locationButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    marginTop: 16,
    paddingHorizontal: 14,
  },
  locationButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  mapBadge: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 7,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'absolute',
    top: 12,
  },
  mapBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  mapLegend: {
    marginTop: -4,
  },
  mapPanelLarge: {
    borderRadius: 8,
    height: 470,
    overflow: 'hidden',
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(28, 30, 46, 0.42)',
    flex: 1,
    justifyContent: 'center',
  },
  modalActionButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  modalActionCluster: {
    alignItems: 'flex-end',
    position: 'absolute',
    right: 58,
    top: 14,
    zIndex: 3,
  },
  modalCloseButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 36,
    zIndex: 2,
  },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: '#B9BFC9',
    borderRadius: 3,
    height: 5,
    marginBottom: 12,
    width: 46,
  },
  multilineInput: {
    minHeight: 86,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  ownerPill: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  ownerPillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  photoRail: {
    marginBottom: 12,
  },
  placeNotesText: {
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
    padding: 12,
  },
  placeModalPanel: {
    borderRadius: 8,
    maxHeight: '92%',
    padding: 16,
    width: '94%',
  },
  pinInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 24,
    fontWeight: '900',
    height: 54,
    letterSpacing: 0,
    paddingHorizontal: 14,
  },
  primaryPanel: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  revealButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    height: 36,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  revealButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  recommendationGroup: {
    marginTop: 12,
  },
  recommendationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  recommendationIcon: {
    fontSize: 18,
  },
  recommendationItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  recommendationsArea: {
    marginTop: 8,
  },
  recommendationTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  recommendationTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  routeDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  routeTapLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  screenContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 118,
  },
  secretRail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
    paddingBottom: 8,
    paddingTop: 12,
  },
  secretTap: {
    alignItems: 'center',
    gap: 5,
    minWidth: 72,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 38,
    justifyContent: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '800',
  },
  selectedMiniCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  settingsModalPanel: {
    borderRadius: 8,
    maxHeight: '88%',
    padding: 16,
    width: '92%',
  },
  shell: {
    flex: 1,
  },
  settingsTripEmoji: {
    fontSize: 22,
  },
  settingsTripRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  smallActionButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '900',
  },
  sourceBadge: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  stopCard: {
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stopCardBody: {
    flex: 1,
    padding: 14,
  },
  stopColor: {
    width: 7,
  },
  stopPhoto: {
    backgroundColor: '#D9DEE8',
    borderRadius: 8,
    height: 150,
    marginRight: 10,
    width: 230,
  },
  stopTime: {
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 10,
  },
  stopTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  stopTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  studioPanel: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  surpriseBody: {
    flex: 1,
  },
  surpriseCard: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  surpriseIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  surpriseTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  tabBar: {
    borderRadius: 8,
    borderWidth: 1,
    bottom: 22,
    flexDirection: 'row',
    gap: 5,
    left: 18,
    padding: 6,
    position: 'absolute',
    right: 18,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    height: 44,
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '900',
  },
  tabTextSmall: {
    fontSize: 11,
  },
  themeGrid: {
    gap: 10,
  },
  themeOption: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  themeOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  themeSwatch: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  title: {
    flexShrink: 1,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 1,
  },
  todoCard: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  todoCheck: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  unlockButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    height: 46,
    justifyContent: 'center',
    marginTop: 14,
  },
  unlockButtonText: {
    fontSize: 15,
    fontWeight: '900',
  },
});
