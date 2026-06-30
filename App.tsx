import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import Constants from 'expo-constants';
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
  Save,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';

import { sampleTrip } from './src/data/sampleTrip';
import {
  CloudUserProfile,
  CloudTripData,
  TripSummary,
  createCloudTripDataFromTrip,
  createCloudAccount,
  createTripOnCloud,
  findUserProfile,
  getCurrentCloudUserProfile,
  isFirebaseSyncConfigured,
  listenTripsForMember,
  normalizeMemberNames,
  normalizeUsername,
  savePushDeviceToCloud,
  saveTripToCloud,
  saveTripSummaryToCloud,
  signInCloudAccount,
  signOutCloudAccount,
  startTripCloudSync,
} from './src/lib/firebaseSync';
import {
  getRouteCoordinates,
  getRollingTripDates,
  getTripDayByDate,
  getStopsForDay,
  getUpcomingStop,
  distanceMeters,
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
  PushDevice,
  registerForSurprisePushNotifications,
  sendSurpriseRevealPushNotifications,
} from './src/lib/pushNotifications';
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
    EXPO_PUBLIC_FIREBASE_API_KEY?: string;
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    EXPO_PUBLIC_FIREBASE_APP_ID?: string;
    EXPO_PUBLIC_FIREBASE_TRIP_ID?: string;
  };
};

type TabKey = 'map' | 'timeline' | 'todo' | 'studio';
type ThemeKey = 'light' | 'dark' | 'lilac' | 'green' | 'blue';
type CalendarMode = 'week' | 'month';
type PlanPanel = 'calendar' | 'new';
type AuthMode = 'login' | 'create';

type UserProfile = CloudUserProfile;

type TripInfo = Pick<Trip, 'id' | 'title' | 'travelers' | 'startsAt' | 'endsAt' | 'homeTimezone'>;

type PlaceSuggestion = {
  address?: string;
  coordinates: Coordinates;
  googleMapsUri?: string;
  id: string;
  name: string;
};

const THEME_KEY = 'roundtrip.theme.v1';
const PROFILE_KEY = 'roundtrip.profile.v1';
const TRIP_LIST_LAST_PROFILE_KEY = 'roundtrip.tripProfile.v1';
const DATA_VERSION_KEY = 'roundtrip.dataVersion.v1';
const DATA_VERSION = '2026-08-trip-v8';
const LOCAL_DATA_DIRECTORY = `${FileSystem.documentDirectory ?? ''}roundtrip-data/`;
const TRIP_DATA_FILE = 'trip.json';
const SURPRISES_FILE = 'surprises.json';
const STOPS_FILE = 'stops.json';
const DAYS_FILE = 'days.json';
const TODOS_FILE = 'todos.json';
const DOCUMENTS_FILE = 'documents.json';
const CLOUD_DEVICE_ID_KEY = 'roundtrip.cloudDeviceId.v1';
const APP_VERSION = Constants.expoConfig?.version ?? 'dev';

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
  { category: 'travel', label: 'Flight' },
  { category: 'activity', label: 'Sightseeing' },
];

const editableMapCategories: Array<{ category: MapCategory; label: string }> = [
  { category: 'general', label: 'Place' },
  { category: 'stay', label: 'Stay' },
  { category: 'hike', label: 'Hike' },
  { category: 'beach', label: 'Beach' },
  { category: 'food', label: 'Food' },
  { category: 'travel', label: 'Flight' },
  { category: 'activity', label: 'Sightseeing' },
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

async function readLocalTripData(tripId: string): Promise<CloudTripData | undefined> {
  return readLocalJson<CloudTripData>(getTripDataFileName(tripId));
}

async function writeLocalTripData(tripId: string, value: CloudTripData) {
  await writeLocalJson(getTripDataFileName(tripId), value);
}

function getTripDataFileName(tripId: string) {
  return `${sanitizeStorageKey(tripId)}-${TRIP_DATA_FILE}`;
}

function sanitizeStorageKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^-|-$)/g, '') || 'trip';
}

async function getOrCreateCloudDeviceId() {
  const storedId = await SecureStore.getItemAsync(CLOUD_DEVICE_ID_KEY);

  if (storedId) {
    return storedId;
  }

  const nextId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await SecureStore.setItemAsync(CLOUD_DEVICE_ID_KEY, nextId);
  return nextId;
}

function createCloudTripData(trip: CloudTripData): CloudTripData {
  return {
    dataVersion: trip.dataVersion,
    days: trip.days,
    documents: trip.documents,
    endsAt: trip.endsAt,
    homeTimezone: trip.homeTimezone,
    startsAt: trip.startsAt,
    stops: trip.stops,
    surprises: trip.surprises,
    title: trip.title,
    todos: trip.todos,
    travelers: trip.travelers,
  };
}

function getTripDataSignature(trip: CloudTripData) {
  return JSON.stringify(createCloudTripData(trip));
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

function createTripInfo(trip: Trip): TripInfo {
  return {
    endsAt: trip.endsAt,
    homeTimezone: trip.homeTimezone,
    id: trip.id,
    startsAt: trip.startsAt,
    title: trip.title,
    travelers: trip.travelers,
  };
}

function createTripInfoFromCloud(tripId: string, trip: CloudTripData): TripInfo {
  const fallback = createFallbackTripInfo(tripId);

  return {
    endsAt: isValidDateValue(trip.endsAt) ? trip.endsAt : fallback.endsAt,
    homeTimezone: trip.homeTimezone || fallback.homeTimezone,
    id: tripId,
    startsAt: isValidDateValue(trip.startsAt) ? trip.startsAt : fallback.startsAt,
    title: trip.title || fallback.title,
    travelers: Array.isArray(trip.travelers) && trip.travelers.length ? trip.travelers : fallback.travelers,
  };
}

function normalizeCloudTripData(tripId: string, trip: Partial<CloudTripData>): CloudTripData {
  const fallback = tripId === sampleTrip.id ? sampleTrip : undefined;
  const fallbackDay = createEmptyTripDay(trip.title || fallback?.title || 'New trip');

  return {
    dataVersion: trip.dataVersion || DATA_VERSION,
    days: Array.isArray(trip.days) && trip.days.length ? trip.days : fallback?.days ?? [fallbackDay],
    documents: Array.isArray(trip.documents) ? trip.documents : fallback?.documents ?? [],
    endsAt: isValidDateValue(trip.endsAt) && trip.endsAt ? trip.endsAt : fallback?.endsAt ?? new Date().toISOString(),
    homeTimezone: trip.homeTimezone || fallback?.homeTimezone || 'Europe/Zurich',
    startsAt: isValidDateValue(trip.startsAt) && trip.startsAt ? trip.startsAt : fallback?.startsAt ?? new Date().toISOString(),
    stops: Array.isArray(trip.stops) ? trip.stops : fallback?.stops ?? [],
    surprises: Array.isArray(trip.surprises) ? trip.surprises : fallback?.surprises ?? [],
    title: trip.title || fallback?.title || 'New trip',
    todos: Array.isArray(trip.todos) ? trip.todos : fallback?.todos ?? [],
    travelers: Array.isArray(trip.travelers) && trip.travelers.length ? trip.travelers : fallback?.travelers ?? [],
  };
}

function createFallbackTripInfo(tripId: string): TripInfo {
  if (tripId === sampleTrip.id) {
    return createTripInfo(sampleTrip);
  }

  const now = new Date().toISOString();

  return {
    endsAt: now,
    homeTimezone: 'Europe/Zurich',
    id: tripId,
    startsAt: now,
    title: 'New trip',
    travelers: [],
  };
}

function isValidDateValue(value?: string) {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function createDefaultTripSummary(profile: UserProfile): TripSummary {
  return {
    createdByProfileId: profile.id,
    id: sampleTrip.id,
    isPrivate: false,
    memberIds: [profile.id],
    memberNames: [profile.username],
    ownerName: profile.username,
    startsAt: sampleTrip.startsAt,
    title: sampleTrip.title,
    updatedAt: new Date().toISOString(),
  };
}

function createBlankTrip(title: string, profile: UserProfile): Trip {
  const date = new Date().toISOString().slice(0, 10);
  return {
    id: `trip-${Date.now()}-${slugify(title).slice(0, 24) || 'new'}`,
    title,
    travelers: [profile.username],
    startsAt: `${date}T10:00:00+01:00`,
    endsAt: `${date}T22:00:00+01:00`,
    homeTimezone: 'Europe/Zurich',
    stops: [],
    days: [
      {
        id: `day-${date}`,
        date,
        title,
        summary: 'Start planning this trip.',
        stops: [],
      },
    ],
    todos: [],
    documents: [],
    surprises: [],
  };
}

function createEmptyTripDay(title: string) {
  const date = new Date().toISOString().slice(0, 10);

  return {
    id: `day-${date}`,
    date,
    title,
    summary: 'Start planning this trip.',
    stops: [],
  };
}

function mergeTripSummaries(localTrips: TripSummary[], remoteTrips: TripSummary[]) {
  const byId = new Map<string, TripSummary>();

  [...localTrips, ...remoteTrips].forEach((trip) => {
    byId.set(trip.id, {
      ...byId.get(trip.id),
      ...trip,
      memberIds: uniqueValues(trip.memberIds ?? []),
      memberNames: normalizeMemberNames(trip.memberNames),
    });
  });

  return Array.from(byId.values()).sort((left, right) =>
    (right.updatedAt ?? right.startsAt ?? '').localeCompare(left.updatedAt ?? left.startsAt ?? ''),
  );
}

function isTripAccessible(summary: TripSummary, profile: UserProfile) {
  return Boolean(summary.memberIds?.includes(profile.id)) || summary.memberNames.includes(profile.normalizedName);
}

function getTripDateRangeLabel(trip: Pick<Trip, 'startsAt' | 'endsAt'>) {
  const startsAt = formatShortDateTime(trip.startsAt);
  const endsAt = formatShortDateTime(trip.endsAt);

  if (!startsAt && !endsAt) {
    return 'Dates pending';
  }

  if (!startsAt || !endsAt) {
    return startsAt || endsAt;
  }

  return `${startsAt}-${endsAt}`;
}

function normalizeStoredProfile(value: Partial<UserProfile> & { password?: string }): UserProfile {
  const username = normalizeUsername(value.username ?? value.normalizedName ?? value.name ?? 'traveler');

  return {
    email: (value.email ?? '').trim().toLowerCase(),
    id: value.id ?? '',
    name: username,
    normalizedName: username,
    username,
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tripSummaries, setTripSummaries] = useState<TripSummary[]>([]);
  const [tripListStatus, setTripListStatus] = useState(
    isFirebaseSyncConfigured() ? 'Loading trips...' : 'Trip sync off',
  );
  const [selectedTripSummary, setSelectedTripSummary] = useState<TripSummary | undefined>();
  const [selectedTripId, setSelectedTripId] = useState('');
  const [tripPasswordGate, setTripPasswordGate] = useState<TripSummary | undefined>();
  const [tripPasswordEntry, setTripPasswordEntry] = useState('');
  const [tripPasswordError, setTripPasswordError] = useState('');
  const [newTripName, setNewTripName] = useState('');
  const [newTripPassword, setNewTripPassword] = useState('');
  const [newTripError, setNewTripError] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');
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
  const [tripInfo, setTripInfo] = useState<TripInfo>(() => createTripInfo(sampleTrip));
  const [stops, setStops] = useState<TripStop[]>(sampleTrip.stops);
  const [days, setDays] = useState<TripDay[]>(sampleTrip.days);
  const [todos, setTodos] = useState<TripTodo[]>(sampleTrip.todos);
  const [documents, setDocuments] = useState<TripDocument[]>(sampleTrip.documents);
  const [surprises, setSurprises] = useState<SurpriseStop[]>(sampleTrip.surprises);
  const [storageReady, setStorageReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudDeviceId, setCloudDeviceId] = useState('');
  const [cloudSyncStatus, setCloudSyncStatus] = useState(
    isFirebaseSyncConfigured() ? 'Cloud sync starting' : 'Cloud sync off',
  );
  const [pushDevices, setPushDevices] = useState<Record<string, PushDevice>>({});
  const [pushStatus, setPushStatus] = useState('Notifications off');
  const [themeKey, setThemeKey] = useState<ThemeKey>('light');
  const [currentLocation, setCurrentLocation] = useState<Coordinates | undefined>();
  const [locationStatus, setLocationStatus] = useState('Location is off');
  const [selectedStopId, setSelectedStopId] = useState('mondrian-singapore');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftTeaser, setDraftTeaser] = useState('');
  const [draftAnchorId, setDraftAnchorId] = useState('mondrian-singapore');
  const [draftRevealMode, setDraftRevealMode] = useState<RevealMode>('manual');
  const [draftNotifyOnReveal, setDraftNotifyOnReveal] = useState(true);
  const [editingSurpriseId, setEditingSurpriseId] = useState<string | undefined>();
  const [stepTitle, setStepTitle] = useState('');
  const [stepCity, setStepCity] = useState('');
  const [stepDate, setStepDate] = useState('2026-08-06');
  const [stepNotes, setStepNotes] = useState('');
  const [stepMapCategory, setStepMapCategory] = useState<MapCategory>('general');
  const [stepPlaceSuggestions, setStepPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [stepSelectedPlace, setStepSelectedPlace] = useState<PlaceSuggestion | undefined>();
  const [stepGuideEnabled, setStepGuideEnabled] = useState(true);
  const [stepGuideStatus, setStepGuideStatus] = useState('');
  const [stepError, setStepError] = useState('');
  const [editingStopId, setEditingStopId] = useState<string | undefined>();
  const [editTitle, setEditTitle] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editMapCategory, setEditMapCategory] = useState<MapCategory>('general');
  const [editPlaceSuggestions, setEditPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [editSelectedPlace, setEditSelectedPlace] = useState<PlaceSuggestion | undefined>();
  const [selectedSurpriseId, setSelectedSurpriseId] = useState<string | undefined>();
  const [surpriseCardVisible, setSurpriseCardVisible] = useState(false);
  const lastCloudSignature = useRef('');

  const theme = themes[themeKey];
  const availableTrips = useMemo(
    () => (profile ? mergeTripSummaries([createDefaultTripSummary(profile)], tripSummaries) : tripSummaries),
    [profile, tripSummaries],
  );

  const trip: Trip = useMemo(
    () => ({
      ...tripInfo,
      stops,
      days,
      todos,
      documents,
      surprises,
    }),
    [days, documents, stops, surprises, todos, tripInfo],
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

    async function loadProfileStorage() {
      try {
        const [storedTheme, storedProfile] = await Promise.all([
          SecureStore.getItemAsync(THEME_KEY),
          SecureStore.getItemAsync(PROFILE_KEY),
        ]);

        if (!mounted) {
          return;
        }

        if (storedTheme && storedTheme in themes) {
          setThemeKey(storedTheme as ThemeKey);
        }

        const parsedProfile = storedProfile
          ? normalizeStoredProfile(JSON.parse(storedProfile) as Partial<UserProfile>)
          : undefined;
        const restoredProfile = isFirebaseSyncConfigured()
          ? await getCurrentCloudUserProfile().catch(() => undefined)
          : undefined;
        const nextProfile = restoredProfile ?? parsedProfile;

        if (!mounted) {
          return;
        }

        if (nextProfile) {
          await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(nextProfile));
          setProfile(nextProfile);
          setProfileName(nextProfile.username || nextProfile.email);
          setProfileEmail(nextProfile.email);
          setLoggedIn(Boolean(restoredProfile));
          setAuthMode('login');
        } else if (parsedProfile) {
          setProfile(parsedProfile);
          setProfileName(parsedProfile.username || parsedProfile.email);
          setProfileEmail(parsedProfile.email);
          setAuthMode('login');
        } else {
          setAuthMode('create');
        }
      } catch {
        setAuthError('Local profile storage unavailable.');
      } finally {
        if (mounted) {
          setAuthReady(true);
        }
      }
    }

    loadProfileStorage();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTripId) {
      setStorageReady(false);
      return;
    }

    let mounted = true;
    setStorageReady(false);
    setCloudReady(false);
    setCloudSyncStatus(isFirebaseSyncConfigured() ? 'Cloud sync starting' : 'Cloud sync off');
    lastCloudSignature.current = '';

    async function loadTripStorage() {
      try {
        const storedTrip = await readLocalTripData(selectedTripId);

        if (!mounted) {
          return;
        }

        if (storedTrip?.dataVersion === DATA_VERSION) {
          const normalizedTrip = normalizeCloudTripData(selectedTripId, storedTrip);
          setTripInfo(createTripInfoFromCloud(selectedTripId, normalizedTrip));
          setStops(normalizedTrip.stops);
          setDays(normalizedTrip.days);
          setTodos(normalizedTrip.todos);
          setDocuments(normalizedTrip.documents);
          setSurprises(normalizedTrip.surprises);
          setSelectedStopId(normalizedTrip.stops.find(isMapPlaceStop)?.id ?? normalizedTrip.stops[0]?.id ?? '');
          return;
        }

        if (selectedTripId === sampleTrip.id) {
          setTripInfo(createTripInfo(sampleTrip));
          setStops(sampleTrip.stops);
          setDays(sampleTrip.days);
          setTodos(sampleTrip.todos);
          setDocuments(sampleTrip.documents);
          setSurprises(sampleTrip.surprises);
          setSelectedStopId('mondrian-singapore');
          return;
        }

        setTripInfo({
          endsAt: new Date().toISOString(),
          homeTimezone: 'Europe/Zurich',
          id: selectedTripId,
          startsAt: new Date().toISOString(),
          title: selectedTripSummary?.title ?? 'New trip',
          travelers: profile ? [profile.username] : [],
        });
        setStops([]);
        setDays([createEmptyTripDay(selectedTripSummary?.title ?? 'New trip')]);
        setTodos([]);
        setDocuments([]);
        setSurprises([]);
        setSelectedStopId('');
      } catch {
        setLocationStatus('Local trip storage unavailable');
      } finally {
        if (mounted) {
          setStorageReady(true);
        }
      }
    }

    loadTripStorage();

    return () => {
      mounted = false;
    };
  }, [profile, selectedTripId, selectedTripSummary]);

  useEffect(() => {
    if (!placeCardVisible) {
      setEditingStopId(undefined);
    }
  }, [placeCardVisible]);

  useEffect(() => {
    if (!surpriseCardVisible) {
      setEditingSurpriseId(undefined);
    }
  }, [surpriseCardVisible]);

  useEffect(() => {
    if (!storageReady || !selectedTripId) {
      return;
    }

    Promise.all([
      writeLocalTripData(selectedTripId, createCloudTripDataFromTrip(trip, DATA_VERSION)),
      SecureStore.setItemAsync(THEME_KEY, themeKey),
      SecureStore.setItemAsync(DATA_VERSION_KEY, DATA_VERSION),
    ]).catch(() => {
      setLocationStatus('Could not save local app data');
    });
  }, [selectedTripId, storageReady, themeKey, trip]);

  useEffect(() => {
    if (!loggedIn || !profile) {
      setTripSummaries([]);
      return;
    }

    const localDefaultTrip = createDefaultTripSummary(profile);

    if (!isFirebaseSyncConfigured()) {
      setTripSummaries([localDefaultTrip]);
      setTripListStatus('Trip sync off');
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    const profileMemberId = profile.id;
    const profileMemberName = profile.normalizedName;

    async function connectTripList() {
      try {
        unsubscribe = await listenTripsForMember({
          memberId: profileMemberId,
          memberName: profileMemberName,
          onStatus: (status) => {
            if (mounted) {
              setTripListStatus(status);
            }
          },
          onTrips: (remoteTrips) => {
            if (mounted) {
              setTripSummaries(mergeTripSummaries([localDefaultTrip], remoteTrips));
            }
          },
        });
      } catch {
        if (mounted) {
          setTripSummaries([localDefaultTrip]);
          setTripListStatus('Trip list unavailable');
        }
      }
    }

    setTripSummaries([localDefaultTrip]);
    connectTripList();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [loggedIn, profile]);

  useEffect(() => {
    if (!storageReady || !selectedTripId) {
      return;
    }

    if (!isFirebaseSyncConfigured()) {
      setCloudSyncStatus('Cloud sync off');
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function connectCloudSync() {
      try {
        const deviceId = await getOrCreateCloudDeviceId();

        if (!mounted) {
          return;
        }

        setCloudDeviceId(deviceId);
        unsubscribe = await startTripCloudSync({
          deviceId,
          onMissingTrip: () => {
            if (mounted) {
              setCloudReady(true);
            }
          },
          onRemotePushDevices: (devices) => {
            if (mounted) {
              setPushDevices(devices);
            }
          },
          onRemoteTrip: (remoteTrip) => {
            if (!mounted) {
              return;
            }

            const normalizedTrip = normalizeCloudTripData(selectedTripId, remoteTrip);
            lastCloudSignature.current = getTripDataSignature(normalizedTrip);
            setTripInfo(createTripInfoFromCloud(selectedTripId, normalizedTrip));
            setStops(normalizedTrip.stops);
            setDays(normalizedTrip.days);
            setTodos(normalizedTrip.todos);
            setDocuments(normalizedTrip.documents);
            setSurprises(normalizedTrip.surprises);
            setSelectedStopId(normalizedTrip.stops.find(isMapPlaceStop)?.id ?? normalizedTrip.stops[0]?.id ?? '');
            setCloudReady(true);
          },
          onStatus: (status) => {
            if (mounted) {
              setCloudSyncStatus(status);
            }
          },
          tripId: selectedTripId,
        });
      } catch {
        if (mounted) {
          setCloudSyncStatus('Cloud sync unavailable');
        }
      }
    }

    connectCloudSync();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [selectedTripId, storageReady]);

  useEffect(() => {
    if (!storageReady || !cloudReady || !cloudDeviceId || !selectedTripId || !isFirebaseSyncConfigured()) {
      return;
    }

    const tripData = createCloudTripData(createCloudTripDataFromTrip(trip, DATA_VERSION));
    const signature = getTripDataSignature(tripData);

    if (signature === lastCloudSignature.current) {
      return;
    }

    const timer = setTimeout(() => {
      setCloudSyncStatus('Cloud saving...');
      saveTripToCloud(selectedTripId, tripData, cloudDeviceId)
        .then(() => {
          lastCloudSignature.current = signature;
          setCloudSyncStatus('Cloud synced');
        })
        .catch(() => {
          setCloudSyncStatus('Cloud save failed');
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [cloudDeviceId, cloudReady, selectedTripId, storageReady, trip]);

  useEffect(() => {
    const query = `${stepTitle} ${stepCity}`.trim();

    if (planPanel !== 'new' || query.length < 3) {
      setStepPlaceSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetchPlaceSuggestions(query)
        .then((suggestions) => {
          if (!cancelled) {
            setStepPlaceSuggestions(suggestions);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStepPlaceSuggestions([]);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [planPanel, stepCity, stepTitle]);

  useEffect(() => {
    const query = `${editTitle} ${editCity}`.trim();

    if (!editingStopId || query.length < 3) {
      setEditPlaceSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetchPlaceSuggestions(query)
        .then((suggestions) => {
          if (!cancelled) {
            setEditPlaceSuggestions(suggestions);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setEditPlaceSuggestions([]);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editCity, editTitle, editingStopId]);

  useEffect(() => {
    if (cloudDeviceId && pushDevices[cloudDeviceId]?.enabled) {
      setPushStatus('Notifications on');
    }
  }, [cloudDeviceId, pushDevices]);

  useEffect(() => {
    if (!ownerMode && activeTab === 'studio') {
      setActiveTab('map');
    }
  }, [activeTab, ownerMode]);

  const completedStopIds = useMemo(
    () =>
      trip.stops
        .filter((stop) => Date.parse(stop.startsAt) < now.getTime())
        .map((stop) => stop.id),
    [now, trip.stops],
  );

  const visibleSurprises = useMemo(
    () => {
      return getVisibleSurprises(surprises, {
        ownerMode,
        now,
        currentLocation,
        completedStopIds,
      }).filter((surprise) => ownerMode || surprise.currentVisibility === 'revealed');
    },
    [completedStopIds, currentLocation, now, ownerMode, surprises],
  );
  const selectedSurprise = useMemo(
    () =>
      visibleSurprises.find((surprise) => surprise.id === selectedSurpriseId) ??
      surprises.find((surprise) => surprise.id === selectedSurpriseId),
    [selectedSurpriseId, surprises, visibleSurprises],
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
  const firstVisibleSurprises = useMemo(
    () => getSurprisesForDate(visibleSurprises, visibleDates[0], trip.stops),
    [trip.stops, visibleDates, visibleSurprises],
  );
  const secondVisibleSurprises = useMemo(
    () => getSurprisesForDate(visibleSurprises, visibleDates[1], trip.stops),
    [trip.stops, visibleDates, visibleSurprises],
  );

  async function createProfile() {
    const username = normalizeUsername(profileName);
    const email = profileEmail.trim().toLowerCase();
    const password = profilePassword.trim();

    if (!isFirebaseSyncConfigured()) {
      setAuthError('Firebase login is not configured for this build.');
      return;
    }

    if (username.length < 3) {
      setAuthError('Choose a username with at least 3 letters or numbers.');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      setAuthError('Add a valid email address.');
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    try {
      setAuthError('');
      const nextProfile = await createCloudAccount({
        email,
        password,
        username,
      });
      await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(nextProfile));
      await SecureStore.setItemAsync(TRIP_LIST_LAST_PROFILE_KEY, nextProfile.normalizedName);
      setProfile(nextProfile);
      setLoggedIn(true);
      setAuthError('');
      setProfileName(nextProfile.username);
      setProfileEmail(nextProfile.email);
      setProfilePassword('');
    } catch (error) {
      setAuthError(getAccountErrorMessage(error));
    }
  }

  async function loginProfile() {
    const identifier = profileName.trim();
    const password = profilePassword.trim();

    if (!isFirebaseSyncConfigured()) {
      setAuthError('Firebase login is not configured for this build.');
      return;
    }

    if (!identifier || !password) {
      setAuthError('Add your username/email and password.');
      return;
    }

    try {
      setAuthError('');
      const nextProfile = await signInCloudAccount(identifier, password);
      await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(nextProfile));
      await SecureStore.setItemAsync(TRIP_LIST_LAST_PROFILE_KEY, nextProfile.normalizedName);
      setProfile(nextProfile);
      setProfileName(nextProfile.username);
      setProfileEmail(nextProfile.email);
      setLoggedIn(true);
      setAuthError('');
      setProfilePassword('');
    } catch (error) {
      setAuthError(getAccountErrorMessage(error));
    }
  }

  async function logoutProfile() {
    closeTrip();
    if (isFirebaseSyncConfigured()) {
      await signOutCloudAccount().catch(() => undefined);
    }
    await Promise.all([
      SecureStore.deleteItemAsync(PROFILE_KEY),
      SecureStore.deleteItemAsync(TRIP_LIST_LAST_PROFILE_KEY),
    ]).catch(() => undefined);
    setProfile(undefined);
    setLoggedIn(false);
    setProfileEmail('');
    setProfilePassword('');
  }

  function closeTrip() {
    setSelectedTripId('');
    setSelectedTripSummary(undefined);
    setOwnerMode(false);
    setActiveTab('map');
    setSettingsVisible(false);
  }

  async function selectTrip(summary: TripSummary) {
    if (!profile || !isTripAccessible(summary, profile)) {
      return;
    }

    if (summary.isPrivate && summary.createdByProfileId !== profile.id) {
      setTripPasswordGate(summary);
      setTripPasswordEntry('');
      setTripPasswordError('');
      return;
    }

    await openTrip(summary);
  }

  async function submitTripPassword() {
    if (!tripPasswordGate) {
      return;
    }

    if ((tripPasswordGate.password ?? '') !== tripPasswordEntry.trim()) {
      setTripPasswordError('Wrong trip password.');
      return;
    }

    const summary = tripPasswordGate;
    setTripPasswordGate(undefined);
    setTripPasswordEntry('');
    setTripPasswordError('');
    await openTrip(summary);
  }

  async function openTrip(summary: TripSummary) {
    setSelectedTripSummary(summary);
    setSelectedTripId(summary.id);
    setActiveTab('map');
    setOwnerMode(false);
    setSettingsVisible(false);
    setPlaceCardVisible(false);
    setSurpriseCardVisible(false);
  }

  async function createNewTrip() {
    if (!profile) {
      return;
    }

    const title = newTripName.trim();

    if (!title) {
      setNewTripError('Add a trip name.');
      return;
    }

    const newTrip = createBlankTrip(title, profile);
    const summary: TripSummary = {
      createdAt: new Date().toISOString(),
      createdByProfileId: profile.id,
      id: newTrip.id,
      isPrivate: Boolean(newTripPassword.trim()),
      memberIds: [profile.id],
      memberNames: [profile.username],
      ownerName: profile.username,
      password: newTripPassword.trim() || undefined,
      startsAt: newTrip.startsAt,
      title: newTrip.title,
      updatedAt: new Date().toISOString(),
    };

    setTripInfo(createTripInfo(newTrip));
    setStops(newTrip.stops);
    setDays(newTrip.days);
    setTodos(newTrip.todos);
    setDocuments(newTrip.documents);
    setSurprises(newTrip.surprises);
    setSelectedStopId('');
    setNewTripError('');
    setNewTripName('');
    setNewTripPassword('');
    setTripSummaries((current) => mergeTripSummaries(current, [summary]));

    if (isFirebaseSyncConfigured()) {
      try {
        const deviceId = cloudDeviceId || await getOrCreateCloudDeviceId();
        setCloudDeviceId(deviceId);
        await createTripOnCloud({
          deviceId,
          summary,
          trip: createCloudTripDataFromTrip(newTrip, DATA_VERSION),
        });
      } catch {
        setTripListStatus('Trip created locally; cloud will retry after opening.');
      }
    }

    await openTrip(summary);
  }

  async function inviteMemberToTrip() {
    if (!profile || !selectedTripSummary || !inviteName.trim()) {
      setInviteStatus('Add a username or email to invite.');
      return;
    }

    if (!isFirebaseSyncConfigured()) {
      setInviteStatus('Firebase login is needed for invites.');
      return;
    }

    try {
      const invitedProfile = await findUserProfile(inviteName);

      if (!invitedProfile) {
        setInviteStatus('No account found with that username or email.');
        return;
      }

      const nextSummary: TripSummary = {
        ...selectedTripSummary,
        memberIds: uniqueValues([...(selectedTripSummary.memberIds ?? []), invitedProfile.id, profile.id]),
        memberNames: normalizeMemberNames([
          ...selectedTripSummary.memberNames,
          invitedProfile.username,
          profile.username,
        ]),
        updatedAt: new Date().toISOString(),
      };

      await saveTripSummaryToCloud(nextSummary);
      setSelectedTripSummary(nextSummary);
      setTripSummaries((current) => mergeTripSummaries(current, [nextSummary]));
      setTripInfo((current) => ({
        ...current,
        travelers: uniqueValues([...current.travelers, invitedProfile.username]),
      }));
      setInviteName('');
      setInviteStatus(`${invitedProfile.username} is invited to this trip.`);
    } catch {
      setInviteStatus('Invite failed. Check the username/email and try again.');
    }
  }

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
    setActiveTab('studio');
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
      notifyOnReveal: draftNotifyOnReveal,
      visibility: 'hidden',
      createdBy: 'owner',
      createdAt: new Date().toISOString(),
    };

    setSurprises((current) => [newSurprise, ...current]);
    setDraftTitle('');
    setDraftMessage('');
    setDraftTeaser('');
    setDraftRevealMode('manual');
    setDraftNotifyOnReveal(true);
  }

  function beginSurpriseEdit(surprise: SurpriseStop) {
    setEditingSurpriseId(surprise.id);
    setDraftTitle(surprise.title);
    setDraftMessage(surprise.message);
    setDraftTeaser(surprise.teaser ?? '');
    setDraftAnchorId(surprise.anchorStopId ?? trip.stops[0]?.id ?? '');
    setDraftRevealMode(surprise.revealMode);
    setDraftNotifyOnReveal(Boolean(surprise.notifyOnReveal));
  }

  function cancelSurpriseEdit() {
    setEditingSurpriseId(undefined);
    setDraftTitle('');
    setDraftMessage('');
    setDraftTeaser('');
    setDraftRevealMode('manual');
    setDraftNotifyOnReveal(true);
  }

  function saveSurpriseEdit(surpriseId: string) {
    const title = draftTitle.trim();
    const message = draftMessage.trim();

    if (!title || !message) {
      Alert.alert('Missing details', 'Add a title and reveal message before saving.');
      return;
    }

    const anchor = trip.stops.find((stop) => stop.id === draftAnchorId) ?? trip.stops[0];

    setSurprises((current) =>
      current.map((surprise) =>
        surprise.id === surpriseId
          ? {
              ...surprise,
              title,
              city: anchor?.city ?? surprise.city,
              country: anchor?.country ?? surprise.country,
              anchorStopId: anchor?.id,
              coordinates: anchor
                ? offsetCoordinates(anchor.coordinates, current.findIndex((item) => item.id === surpriseId))
                : surprise.coordinates,
              message,
              teaser: draftTeaser.trim() || `A surprise is waiting near ${anchor?.city ?? surprise.city}.`,
              revealMode: draftRevealMode,
              revealAt: draftRevealMode === 'time' ? anchor?.startsAt : undefined,
              revealRadiusMeters: draftRevealMode === 'location' ? 500 : undefined,
              notifyOnReveal: draftNotifyOnReveal,
            }
          : surprise,
      ),
    );
    setEditingSurpriseId(undefined);
  }

  function requestDeleteSurprise(surpriseId: string) {
    const surprise = surprises.find((item) => item.id === surpriseId);

    if (!surprise) {
      return;
    }

    Alert.alert('Delete surprise?', `Delete ${surprise.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteSurprise(surpriseId),
      },
    ]);
  }

  function deleteSurprise(surpriseId: string) {
    setSurprises((current) => current.filter((surprise) => surprise.id !== surpriseId));

    if (selectedSurpriseId === surpriseId) {
      setSelectedSurpriseId(undefined);
      setSurpriseCardVisible(false);
    }

    if (editingSurpriseId === surpriseId) {
      cancelSurpriseEdit();
    }
  }

  async function enableSurpriseNotifications() {
    if (!cloudDeviceId || !selectedTripId) {
      setPushStatus('Cloud sync must connect first');
      return;
    }

    try {
      setPushStatus('Requesting permission...');
      const device = await registerForSurprisePushNotifications(cloudDeviceId);
      await savePushDeviceToCloud(selectedTripId, device);
      setPushDevices((current) => ({ ...current, [device.deviceId]: device }));
      setPushStatus('Notifications on');
    } catch {
      setPushStatus('Notifications unavailable');
    }
  }

  function updateStepTitle(value: string) {
    setStepTitle(value);
    setStepSelectedPlace(undefined);
  }

  function updateStepCity(value: string) {
    setStepCity(value);
    setStepSelectedPlace(undefined);
  }

  function selectStepPlaceSuggestion(suggestion: PlaceSuggestion) {
    setStepSelectedPlace(suggestion);
    setStepCity(formatSuggestionArea(suggestion));
    setStepPlaceSuggestions([]);

    if (!stepTitle.trim()) {
      setStepTitle(suggestion.name);
    }
  }

  function updateEditTitle(value: string) {
    setEditTitle(value);
    setEditSelectedPlace(undefined);
  }

  function updateEditCity(value: string) {
    setEditCity(value);
    setEditSelectedPlace(undefined);
  }

  function selectEditPlaceSuggestion(suggestion: PlaceSuggestion) {
    setEditSelectedPlace(suggestion);
    setEditCity(formatSuggestionArea(suggestion));
    setEditPlaceSuggestions([]);
  }

  async function addStep() {
    const title = stepTitle.trim();
    const city = stepSelectedPlace ? formatSuggestionArea(stepSelectedPlace) : stepCity.trim() || title;
    const notes = stepNotes.trim() || 'New trip step. Add details later.';
    const date = stepDate.trim();

    if (!title) {
      setStepError('Add a place name before creating the card.');
      return;
    }

    if (!date) {
      setStepError('Add a date for this plan.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setStepError('Use the date format YYYY-MM-DD.');
      return;
    }

    setStepError('');

    if (stepGuideEnabled) {
      setStepGuideStatus('Researching TikTok and YouTube tips...');
    }

    const fallback: Coordinates = trip.stops[0]?.coordinates ?? {
      latitude: region.latitude,
      longitude: region.longitude,
    };
    const coordinates = stepSelectedPlace?.coordinates ?? await resolveTypedPlaceCoordinates(`${title} ${city}`, fallback);
    const recommendations = stepGuideEnabled ? await createGuideForPlace(title, city) : undefined;
    const stopId = `step-${Date.now()}`;
    const newStop: TripStop = {
      id: stopId,
      title,
      city,
      country: inferCountry(`${title} ${city}`),
      startsAt: `${date}T10:00:00+08:00`,
      coordinates,
      kind: 'stay',
      notes,
      travelModeFromPrevious: 'car',
      address: stepSelectedPlace?.address,
      links: stepSelectedPlace?.googleMapsUri
        ? [{ label: 'Directions', url: stepSelectedPlace.googleMapsUri }]
        : undefined,
      mapVisibility: 'marker',
      mapCategory: stepMapCategory,
      placeId: stepSelectedPlace?.id,
      recommendations,
      coverColor: theme.accentDark,
    };

    const existingDay = days.find((day) => day.date === date);
    const nextDays = existingDay
      ? days.map((day) =>
          day.id === existingDay.id ? { ...day, stops: [...day.stops, stopId] } : day,
        )
      : [
          ...days,
          {
            id: `day-${date}`,
            date,
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
    setStepMapCategory('general');
    setStepPlaceSuggestions([]);
    setStepSelectedPlace(undefined);
    setStepGuideStatus('');
    setStepError('');
  }

  function openStopCard(stopId: string) {
    setSelectedStopId(stopId);
    setPlaceCardVisible(true);
  }

  function openSurpriseCard(surpriseId: string) {
    setSelectedSurpriseId(surpriseId);
    setSurpriseCardVisible(true);
  }

  function beginStopEdit(stop: TripStop) {
    setEditingStopId(stop.id);
    setEditTitle(stop.title);
    setEditCity(stop.city);
    setEditDate(stop.startsAt.slice(0, 10));
    setEditNotes(stop.notes);
    setEditMapCategory(stop.mapCategory ?? inferMapCategory(`${stop.title} ${stop.city}`));
    setEditPlaceSuggestions([]);
    setEditSelectedPlace(undefined);
  }

  function cancelStopEdit() {
    setEditingStopId(undefined);
    setEditTitle('');
    setEditCity('');
    setEditDate('');
    setEditNotes('');
    setEditPlaceSuggestions([]);
    setEditSelectedPlace(undefined);
  }

  async function saveStopEdit(stopId: string) {
    const title = editTitle.trim();
    const city = editSelectedPlace ? formatSuggestionArea(editSelectedPlace) : editCity.trim();
    const date = editDate.trim();

    if (!title || !city || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Missing details', 'Add a title, area, and date in YYYY-MM-DD format before saving.');
      return;
    }

    const existingStop = stops.find((stop) => stop.id === stopId);
    const fallback = existingStop?.coordinates ?? trip.stops[0]?.coordinates ?? {
      latitude: region.latitude,
      longitude: region.longitude,
    };
    const coordinates = editSelectedPlace?.coordinates ?? await resolveTypedPlaceCoordinates(`${title} ${city}`, fallback);

    setStops((current) =>
      current.map((stop) =>
        stop.id === stopId
          ? {
              ...stop,
              title,
              city,
              startsAt: replaceIsoDate(stop.startsAt, date),
              address: editSelectedPlace?.address ?? stop.address,
              coordinates,
              links: editSelectedPlace?.googleMapsUri
                ? mergeStopLinks(stop.links, { label: 'Directions', url: editSelectedPlace.googleMapsUri })
                : stop.links,
              notes: editNotes.trim() || 'New trip step. Add details later.',
              mapCategory: editMapCategory,
              placeId: editSelectedPlace?.id ?? stop.placeId,
            }
          : stop,
      ),
    );

    if (existingStop && existingStop.startsAt.slice(0, 10) !== date) {
      setDays((current) => moveStopToDate(current, stopId, date, city));
    }

    setEditingStopId(undefined);
    setEditPlaceSuggestions([]);
    setEditSelectedPlace(undefined);
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

  async function revealNow(surpriseId: string) {
    const surprise = surprises.find((item) => item.id === surpriseId);
    const shouldNotify = Boolean(
      surprise?.notifyOnReveal &&
        surprise.visibility !== 'revealed' &&
        cloudDeviceId &&
        Object.values(pushDevices).some((device) => device.enabled && device.deviceId !== cloudDeviceId),
    );

    setSurprises((current) => revealSurprise(current, surpriseId));

    if (!surprise?.notifyOnReveal || surprise.visibility === 'revealed') {
      return;
    }

    if (!shouldNotify || !cloudDeviceId) {
      setPushStatus('No other notification devices yet');
      return;
    }

    try {
      setPushStatus('Sending surprise notification...');
      await sendSurpriseRevealPushNotifications({
        devices: Object.values(pushDevices),
        senderDeviceId: cloudDeviceId,
        surprise: { ...surprise, visibility: 'revealed' },
      });
      setPushStatus('Notification sent');
    } catch {
      setPushStatus('Notification failed');
    }
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

  function removeDocument(documentId: string) {
    const document = documents.find((item) => item.id === documentId);

    if (!document) {
      return;
    }

    Alert.alert('Remove PDF?', `Remove ${document.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => deleteDocument(documentId),
      },
    ]);
  }

  async function deleteDocument(documentId: string) {
    const document = documents.find((item) => item.id === documentId);
    setDocuments((current) => current.filter((item) => item.id !== documentId));

    if (!document?.uri || !FileSystem.documentDirectory || !document.uri.startsWith(FileSystem.documentDirectory)) {
      return;
    }

    try {
      await FileSystem.deleteAsync(document.uri, { idempotent: true });
    } catch {
      setLocationStatus('Could not remove local PDF file');
    }
  }

  function toggleTodo(todoId: string) {
    setTodos((current) =>
      current.map((todo) => (todo.id === todoId ? { ...todo, done: !todo.done } : todo)),
    );
  }

  if (!authReady) {
    return (
      <SafeAreaView style={[styles.shell, styles.centeredScreen, { backgroundColor: theme.background }]}>
        <StatusBar style={themeKey === 'dark' ? 'light' : 'dark'} />
        <Text style={[styles.title, { color: theme.text }]}>Roundtrip</Text>
        <Text style={[styles.bodyText, { color: theme.muted }]}>Loading your travel planner...</Text>
      </SafeAreaView>
    );
  }

  if (!loggedIn) {
    return (
      <SafeAreaView style={[styles.shell, { backgroundColor: theme.background }]}>
        <StatusBar style={themeKey === 'dark' ? 'light' : 'dark'} />
        <ProfileGateScreen
          authError={authError}
          authMode={authMode}
          createProfile={createProfile}
          existingProfile={profile}
          loginProfile={loginProfile}
          profileEmail={profileEmail}
          profileName={profileName}
          profilePassword={profilePassword}
          setAuthMode={setAuthMode}
          setProfileEmail={setProfileEmail}
          setProfileName={setProfileName}
          setProfilePassword={setProfilePassword}
          theme={theme}
        />
      </SafeAreaView>
    );
  }

  if (!selectedTripId) {
    return (
      <SafeAreaView style={[styles.shell, { backgroundColor: theme.background }]}>
        <StatusBar style={themeKey === 'dark' ? 'light' : 'dark'} />
        <TripPickerScreen
          createNewTrip={createNewTrip}
          logoutProfile={logoutProfile}
          newTripError={newTripError}
          newTripName={newTripName}
          newTripPassword={newTripPassword}
          profile={profile}
          selectTrip={selectTrip}
          setNewTripName={setNewTripName}
          setNewTripPassword={setNewTripPassword}
          theme={theme}
          tripListStatus={tripListStatus}
          trips={availableTrips}
        />
        <TripPasswordModal
          error={tripPasswordError}
          onClose={() => setTripPasswordGate(undefined)}
          onSubmit={submitTripPassword}
          password={tripPasswordEntry}
          setPassword={setTripPasswordEntry}
          theme={theme}
          trip={tripPasswordGate}
          visible={Boolean(tripPasswordGate)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.shell, { backgroundColor: theme.background }]}>
      <StatusBar style={themeKey === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Roundtrip</Text>
          <Text style={[styles.title, { color: theme.text }]}>{trip.title}</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.datePill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Plane size={17} color={theme.accentDark} />
            <Text style={[styles.datePillText, { color: theme.text }]}>{getTripDateRangeLabel(trip)}</Text>
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
          firstVisibleSurprises={firstVisibleSurprises}
          locationStatus={locationStatus}
          ownerMode={ownerMode}
          requestLocation={requestLocation}
          secondVisibleSurprises={secondVisibleSurprises}
          selectedStop={selectedStop}
          onOpenStop={openStopCard}
          onOpenSurprise={openSurpriseCard}
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
          onOpenSurprise={openSurpriseCard}
          onSelectStepPlace={selectStepPlaceSuggestion}
          ownerMode={ownerMode}
          planPanel={planPanel}
          setCalendarMode={setCalendarMode}
          setGuideEnabled={setStepGuideEnabled}
          setPlanPanel={setPlanPanel}
          setStepMapCategory={setStepMapCategory}
          setStepCity={updateStepCity}
          setStepDate={setStepDate}
          setStepNotes={setStepNotes}
          setStepTitle={updateStepTitle}
          stepCity={stepCity}
          stepDate={stepDate}
          stepError={stepError}
          stepMapCategory={stepMapCategory}
          stepNotes={stepNotes}
          stepPlaceSuggestions={stepPlaceSuggestions}
          stepSelectedPlace={stepSelectedPlace}
          stepTitle={stepTitle}
          theme={theme}
          trip={trip}
          visibleSurprises={visibleSurprises}
          windowStartDate={visibleDates[0]}
        />
      )}

      {activeTab === 'todo' && (
        <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
          <TodoSection theme={theme} toggleTodo={toggleTodo} trip={trip} />
        </ScrollView>
      )}

      {activeTab === 'studio' && ownerMode && (
        <MomentsScreen
          addSurprise={addSurprise}
          draftAnchorId={draftAnchorId}
          draftMessage={draftMessage}
          draftNotifyOnReveal={draftNotifyOnReveal}
          draftRevealMode={draftRevealMode}
          draftTeaser={draftTeaser}
          draftTitle={draftTitle}
          onDeleteSurprise={requestDeleteSurprise}
          onOpenSurprise={openSurpriseCard}
          ownerMode={ownerMode}
          revealNow={revealNow}
          setDraftAnchorId={setDraftAnchorId}
          setDraftMessage={setDraftMessage}
          setDraftNotifyOnReveal={setDraftNotifyOnReveal}
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
        {ownerMode && (
          <TabButton
            active={activeTab === 'studio'}
            icon={(color) => <Sparkles size={18} color={color} />}
            label="Studio"
            onPress={() => setActiveTab('studio')}
            theme={theme}
          />
        )}
      </View>

      <PlaceCardModal
        addPdfToStop={addPdfToStop}
        documents={selectedStop ? trip.documents.filter((document) => document.linkedStopId === selectedStop.id) : []}
        editCity={editCity}
        editDate={editDate}
        editMapCategory={editMapCategory}
        editNotes={editNotes}
        editPlaceSuggestions={editPlaceSuggestions}
        editSelectedPlace={editSelectedPlace}
        editTitle={editTitle}
        isEditing={selectedStop?.id === editingStopId}
        onCancelEdit={cancelStopEdit}
        onClose={() => setPlaceCardVisible(false)}
        onDeleteStop={requestDeleteStop}
        openDocument={openDocument}
        removeDocument={removeDocument}
        onSaveEdit={saveStopEdit}
        onSelectEditPlace={selectEditPlaceSuggestion}
        onStartEdit={beginStopEdit}
        setEditCity={updateEditCity}
        setEditDate={setEditDate}
        setEditMapCategory={setEditMapCategory}
        setEditNotes={setEditNotes}
        setEditTitle={updateEditTitle}
        stop={selectedStop}
        theme={theme}
        visible={placeCardVisible}
      />

      <SurpriseCardModal
        draftAnchorId={draftAnchorId}
        draftMessage={draftMessage}
        draftNotifyOnReveal={draftNotifyOnReveal}
        draftRevealMode={draftRevealMode}
        draftTeaser={draftTeaser}
        draftTitle={draftTitle}
        isEditing={selectedSurprise?.id === editingSurpriseId}
        onCancelEdit={cancelSurpriseEdit}
        onClose={() => setSurpriseCardVisible(false)}
        onDeleteSurprise={requestDeleteSurprise}
        onReveal={revealNow}
        onSaveEdit={saveSurpriseEdit}
        onStartEdit={beginSurpriseEdit}
        ownerMode={ownerMode}
        setDraftAnchorId={setDraftAnchorId}
        setDraftMessage={setDraftMessage}
        setDraftNotifyOnReveal={setDraftNotifyOnReveal}
        setDraftRevealMode={setDraftRevealMode}
        setDraftTeaser={setDraftTeaser}
        setDraftTitle={setDraftTitle}
        surprise={selectedSurprise}
        theme={theme}
        trip={trip}
        visible={surpriseCardVisible}
      />

      <SettingsModal
        appVersion={APP_VERSION}
        inviteName={inviteName}
        inviteStatus={inviteStatus}
        onEnableNotifications={enableSurpriseNotifications}
        onBackToTrips={closeTrip}
        onInviteMember={inviteMemberToTrip}
        onClose={closeSettings}
        onHiddenGestureStep={handleOwnerGestureStep}
        onLogout={logoutProfile}
        pushStatus={pushStatus}
        profile={profile}
        selectedTripSummary={selectedTripSummary}
        setInviteName={setInviteName}
        setThemeKey={setThemeKey}
        syncStatus={cloudSyncStatus}
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

function ProfileGateScreen({
  authError,
  authMode,
  createProfile,
  existingProfile,
  loginProfile,
  profileEmail,
  profileName,
  profilePassword,
  setAuthMode,
  setProfileEmail,
  setProfileName,
  setProfilePassword,
  theme,
}: {
  authError: string;
  authMode: AuthMode;
  createProfile: () => void;
  existingProfile?: UserProfile;
  loginProfile: () => void;
  profileEmail: string;
  profileName: string;
  profilePassword: string;
  setAuthMode: (mode: AuthMode) => void;
  setProfileEmail: (value: string) => void;
  setProfileName: (value: string) => void;
  setProfilePassword: (value: string) => void;
  theme: (typeof themes)[ThemeKey];
}) {
  const isCreate = authMode === 'create';
  const canSubmit =
    profileName.trim().length > 0 &&
    profilePassword.trim().length > 0 &&
    (!isCreate || profileEmail.trim().length > 0);

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.flexOne}
    >
      <ScrollView contentContainerStyle={styles.authScreen} keyboardShouldPersistTaps="handled">
        <View style={styles.profileHero}>
          <View style={[styles.profileAvatar, { backgroundColor: theme.accentDark }]}>
            <Text style={styles.profileAvatarText}>
              {getProfileInitials(profileName || existingProfile?.username || 'RT')}
            </Text>
          </View>
          <View style={styles.flexOne}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>Trip planner</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              {isCreate ? 'Create profile' : 'Welcome back'}
            </Text>
          </View>
        </View>

        <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.segmentRow}>
            {(['login', 'create'] as AuthMode[]).map((mode) => (
              <Pressable
                accessibilityRole="button"
                key={mode}
                onPress={() => setAuthMode(mode)}
                style={[
                  styles.segment,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  authMode === mode && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: theme.text },
                    authMode === mode && { color: theme.surface },
                  ]}
                >
                  {mode === 'login' ? 'Login' : 'New'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.controlLabel, { color: theme.muted }]}>
            {isCreate ? 'Username' : 'Username or email'}
          </Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setProfileName}
            placeholder={isCreate ? 'olivier' : 'olivier or email@example.com'}
            placeholderTextColor="#8A92A3"
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            value={profileName}
          />
          {isCreate && (
            <>
              <Text style={[styles.controlLabel, { color: theme.muted }]}>Email</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setProfileEmail}
                placeholder="email@example.com"
                placeholderTextColor="#8A92A3"
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                value={profileEmail}
              />
            </>
          )}
          <Text style={[styles.controlLabel, { color: theme.muted }]}>Password</Text>
          <TextInput
            onChangeText={setProfilePassword}
            placeholder="Password"
            placeholderTextColor="#8A92A3"
            secureTextEntry
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            value={profilePassword}
          />
          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={isCreate ? createProfile : loginProfile}
            style={[
              styles.addButton,
              { backgroundColor: theme.text },
              !canSubmit && styles.addButtonDisabled,
            ]}
          >
            <KeyRound size={18} color={theme.surface} />
            <Text style={[styles.addButtonText, { color: theme.surface }]}>
              {isCreate ? 'Create profile' : 'Login'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TripPickerScreen({
  createNewTrip,
  logoutProfile,
  newTripError,
  newTripName,
  newTripPassword,
  profile,
  selectTrip,
  setNewTripName,
  setNewTripPassword,
  theme,
  tripListStatus,
  trips,
}: {
  createNewTrip: () => void;
  logoutProfile: () => void;
  newTripError: string;
  newTripName: string;
  newTripPassword: string;
  profile?: UserProfile;
  selectTrip: (trip: TripSummary) => void;
  setNewTripName: (value: string) => void;
  setNewTripPassword: (value: string) => void;
  theme: (typeof themes)[ThemeKey];
  tripListStatus: string;
  trips: TripSummary[];
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Profile</Text>
          <Text style={[styles.title, { color: theme.text }]}>{profile?.username ?? 'Traveler'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={logoutProfile}
          style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <X size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.panelHeader}>
          <View style={styles.flexOne}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>Existing trips</Text>
            <Text style={[styles.panelTitle, { color: theme.text }]}>Choose trip</Text>
          </View>
          <Text style={[styles.compactMeta, { color: theme.muted }]}>{tripListStatus}</Text>
        </View>
        {trips.map((trip) => (
          <Pressable
            accessibilityRole="button"
            key={trip.id}
            onPress={() => selectTrip(trip)}
            style={[styles.tripRow, { backgroundColor: theme.softSurface, borderColor: theme.border }]}
          >
            <View style={[styles.tripIcon, { backgroundColor: trip.isPrivate ? theme.text : theme.accentDark }]}>
              {trip.isPrivate ? <KeyRound size={18} color={theme.surface} /> : <Plane size={18} color="#FFFFFF" />}
            </View>
            <View style={styles.flexOne}>
              <Text style={[styles.compactTitle, { color: theme.text }]}>{trip.title}</Text>
              <Text style={[styles.compactMeta, { color: theme.muted }]}>
                {trip.memberIds?.length ?? trip.memberNames.length} travelers - {trip.isPrivate ? 'Private' : 'Public'}
              </Text>
            </View>
            <ExternalLink size={16} color={theme.text} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.panelHeader}>
          <View style={styles.flexOne}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>New trip</Text>
            <Text style={[styles.panelTitle, { color: theme.text }]}>Start planning</Text>
          </View>
          <Plus size={22} color={theme.accent} />
        </View>
        <TextInput
          onChangeText={setNewTripName}
          placeholder="Trip name"
          placeholderTextColor="#8A92A3"
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          value={newTripName}
        />
        <TextInput
          onChangeText={setNewTripPassword}
          placeholder="Optional trip password"
          placeholderTextColor="#8A92A3"
          secureTextEntry
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          value={newTripPassword}
        />
        {newTripError ? <Text style={styles.errorText}>{newTripError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={createNewTrip}
          style={[styles.addButton, { backgroundColor: theme.accent }]}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Create trip</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function TripPasswordModal({
  error,
  onClose,
  onSubmit,
  password,
  setPassword,
  theme,
  trip,
  visible,
}: {
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  password: string;
  setPassword: (value: string) => void;
  theme: (typeof themes)[ThemeKey];
  trip?: TripSummary;
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
              <Text style={[styles.eyebrow, { color: theme.muted }]}>Private trip</Text>
              <Text style={[styles.panelTitle, { color: theme.text }]}>{trip?.title ?? 'Trip password'}</Text>
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
            onChangeText={setPassword}
            placeholder="Trip password"
            placeholderTextColor="#8A92A3"
            secureTextEntry
            style={[
              styles.pinInput,
              { backgroundColor: theme.softSurface, borderColor: theme.border, color: theme.text },
            ]}
            value={password}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={onSubmit}
            style={[styles.unlockButton, { backgroundColor: theme.text }]}
          >
            <KeyRound size={18} color={theme.surface} />
            <Text style={[styles.unlockButtonText, { color: theme.surface }]}>Open trip</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MapScreen({
  currentLocation,
  firstVisibleDate,
  firstVisibleDay,
  firstVisibleSurprises,
  firstVisibleStops,
  locationStatus,
  onOpenStop,
  onOpenSurprise,
  ownerMode,
  requestLocation,
  secondVisibleDate,
  secondVisibleDay,
  secondVisibleSurprises,
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
  firstVisibleSurprises: RevealedSurprise[];
  firstVisibleStops: TripStop[];
  locationStatus: string;
  onOpenStop: (stopId: string) => void;
  onOpenSurprise: (surpriseId: string) => void;
  ownerMode: boolean;
  requestLocation: () => void;
  secondVisibleDate: string;
  secondVisibleDay?: TripDay;
  secondVisibleSurprises: RevealedSurprise[];
  secondVisibleStops: TripStop[];
  selectedStop?: TripStop;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  upcomingStop?: TripStop;
  visibleSurprises: RevealedSurprise[];
}) {
  const [clusterStops, setClusterStops] = useState<TripStop[] | undefined>();
  const routeStops = useMemo(() => getStopsInDateOrder(trip.stops), [trip.stops]);
  const mapStops = useMemo(() => routeStops.filter(isMapPlaceStop), [routeStops]);
  const mapStopGroups = useMemo(() => groupNearbyStops(mapStops), [mapStops]);

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
          {mapStopGroups.map((group) => {
            const stop = group.stops[0];

            if (group.stops.length === 1) {
              return (
                <Marker
                  coordinate={stop.coordinates}
                  key={group.id}
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
              );
            }

            return (
              <Marker
                coordinate={group.coordinates}
                key={group.id}
                onPress={() => setClusterStops(group.stops)}
                title={`${group.stops.length} places`}
              >
                <View style={[styles.clusterMarker, { backgroundColor: theme.text }]}>
                  <Text style={[styles.clusterMarkerText, { color: theme.surface }]}>
                    {group.stops.length}
                  </Text>
                </View>
              </Marker>
            );
          })}
          {visibleSurprises
            .filter((surprise) => surprise.coordinates)
            .map((surprise) => (
              <Marker
                coordinate={surprise.coordinates!}
                description={
                  surprise.currentVisibility === 'revealed' ? surprise.message : surprise.teaser
                }
                key={surprise.id}
                onPress={() => onOpenSurprise(surprise.id)}
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
        onOpenSurprise={onOpenSurprise}
        ownerMode={ownerMode}
        stops={firstVisibleStops}
        surprises={firstVisibleSurprises}
        theme={theme}
      />
      <DayPlanSection
        date={secondVisibleDate}
        day={secondVisibleDay}
        emptyText="No planned trip places on this date."
        onOpenStop={onOpenStop}
        onOpenSurprise={onOpenSurprise}
        ownerMode={ownerMode}
        stops={secondVisibleStops}
        surprises={secondVisibleSurprises}
        theme={theme}
      />
      <ClusterStopsModal
        onClose={() => setClusterStops(undefined)}
        onOpenStop={(stopId) => {
          setClusterStops(undefined);
          onOpenStop(stopId);
        }}
        stops={clusterStops ?? []}
        theme={theme}
        visible={Boolean(clusterStops)}
      />
    </ScrollView>
  );
}

function ClusterStopsModal({
  onClose,
  onOpenStop,
  stops,
  theme,
  visible,
}: {
  onClose: () => void;
  onOpenStop: (stopId: string) => void;
  stops: TripStop[];
  theme: (typeof themes)[ThemeKey];
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.clusterPanel, { backgroundColor: theme.surface }]}>
          <View style={styles.panelHeader}>
            <View style={styles.flexOne}>
              <Text style={[styles.eyebrow, { color: theme.muted }]}>Map cluster</Text>
              <Text style={[styles.panelTitle, { color: theme.text }]}>{stops.length} places here</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.iconButton, { backgroundColor: theme.softSurface }]}
            >
              <X size={20} color={theme.text} />
            </Pressable>
          </View>
          {stops.map((stop) => (
            <Pressable
              accessibilityRole="button"
              key={stop.id}
              onPress={() => onOpenStop(stop.id)}
              style={[styles.clusterStopRow, { backgroundColor: theme.softSurface }]}
            >
              <Text style={styles.settingsTripEmoji}>{getStopEmoji(stop)}</Text>
              <View style={styles.flexOne}>
                <Text style={[styles.compactTitle, { color: theme.text }]}>{stop.title}</Text>
                <Text style={[styles.compactMeta, { color: theme.muted }]}>{stop.city}</Text>
              </View>
              <ExternalLink size={15} color={theme.text} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function PlaceSuggestionList({
  onSelect,
  selectedSuggestion,
  suggestions,
  theme,
}: {
  onSelect: (suggestion: PlaceSuggestion) => void;
  selectedSuggestion?: PlaceSuggestion;
  suggestions: PlaceSuggestion[];
  theme: (typeof themes)[ThemeKey];
}) {
  if (selectedSuggestion) {
    return (
      <View style={[styles.placeSuggestionSelected, { backgroundColor: theme.softSurface }]}>
        <Check size={16} color={theme.accentDark} />
        <View style={styles.flexOne}>
          <Text style={[styles.compactTitle, { color: theme.text }]}>{selectedSuggestion.name}</Text>
          {selectedSuggestion.address && (
            <Text style={[styles.compactMeta, { color: theme.muted }]}>{selectedSuggestion.address}</Text>
          )}
        </View>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.placeSuggestionArea}>
      <Text style={[styles.controlLabel, { color: theme.muted }]}>Choose exact place</Text>
      {suggestions.map((suggestion) => (
        <Pressable
          accessibilityRole="button"
          key={suggestion.id}
          onPress={() => onSelect(suggestion)}
          style={[styles.placeSuggestionRow, { backgroundColor: theme.softSurface, borderColor: theme.border }]}
        >
          <MapPin size={16} color={theme.accentDark} />
          <View style={styles.flexOne}>
            <Text style={[styles.compactTitle, { color: theme.text }]}>{suggestion.name}</Text>
            {suggestion.address && (
              <Text style={[styles.compactMeta, { color: theme.muted }]}>{suggestion.address}</Text>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function SelectedStopCard({
  addPdfToStop,
  documents,
  editCity,
  editDate,
  editMapCategory,
  editNotes,
  editPlaceSuggestions,
  editSelectedPlace,
  editTitle,
  isEditing,
  onCancelEdit,
  openDocument,
  removeDocument,
  onSaveEdit,
  onSelectEditPlace,
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
  editPlaceSuggestions: PlaceSuggestion[];
  editSelectedPlace?: PlaceSuggestion;
  editTitle: string;
  isEditing: boolean;
  onCancelEdit: () => void;
  openDocument: (document: TripDocument) => void;
  removeDocument: (documentId: string) => void;
  onSaveEdit: (stopId: string) => void;
  onSelectEditPlace: (suggestion: PlaceSuggestion) => void;
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
          <PlaceSuggestionList
            onSelect={onSelectEditPlace}
            selectedSuggestion={editSelectedPlace}
            suggestions={editPlaceSuggestions}
            theme={theme}
          />
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
          <View
            key={document.id}
            style={[styles.documentCard, { backgroundColor: theme.softSurface }]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => openDocument(document)}
              style={styles.documentOpenArea}
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
            <Pressable
              accessibilityRole="button"
              onPress={() => removeDocument(document.id)}
              style={styles.documentDeleteButton}
            >
              <Trash2 size={16} color="#C5392D" />
            </Pressable>
          </View>
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
  editPlaceSuggestions,
  editSelectedPlace,
  editTitle,
  isEditing,
  onCancelEdit,
  onClose,
  onDeleteStop,
  openDocument,
  removeDocument,
  onSaveEdit,
  onSelectEditPlace,
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
  editPlaceSuggestions: PlaceSuggestion[];
  editSelectedPlace?: PlaceSuggestion;
  editTitle: string;
  isEditing: boolean;
  onCancelEdit: () => void;
  onClose: () => void;
  onDeleteStop: (stopId: string) => void;
  openDocument: (document: TripDocument) => void;
  removeDocument: (documentId: string) => void;
  onSaveEdit: (stopId: string) => void;
  onSelectEditPlace: (suggestion: PlaceSuggestion) => void;
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
        <View
          style={[
            styles.placeModalPanel,
            { backgroundColor: theme.surface, marginTop: Platform.OS === 'ios' ? 36 : 18 },
          ]}
        >
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
              editPlaceSuggestions={editPlaceSuggestions}
              editSelectedPlace={editSelectedPlace}
              editTitle={editTitle}
              isEditing={isEditing}
              onCancelEdit={onCancelEdit}
              openDocument={openDocument}
              removeDocument={removeDocument}
              onSaveEdit={onSaveEdit}
              onSelectEditPlace={onSelectEditPlace}
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

function SurpriseCardModal({
  draftAnchorId,
  draftMessage,
  draftNotifyOnReveal,
  draftRevealMode,
  draftTeaser,
  draftTitle,
  isEditing,
  onCancelEdit,
  onClose,
  onDeleteSurprise,
  onReveal,
  onSaveEdit,
  onStartEdit,
  ownerMode,
  setDraftAnchorId,
  setDraftMessage,
  setDraftNotifyOnReveal,
  setDraftRevealMode,
  setDraftTeaser,
  setDraftTitle,
  surprise,
  theme,
  trip,
  visible,
}: {
  draftAnchorId: string;
  draftMessage: string;
  draftNotifyOnReveal: boolean;
  draftRevealMode: RevealMode;
  draftTeaser: string;
  draftTitle: string;
  isEditing: boolean;
  onCancelEdit: () => void;
  onClose: () => void;
  onDeleteSurprise: (surpriseId: string) => void;
  onReveal: (surpriseId: string) => void;
  onSaveEdit: (surpriseId: string) => void;
  onStartEdit: (surprise: SurpriseStop) => void;
  ownerMode: boolean;
  setDraftAnchorId: (value: string) => void;
  setDraftMessage: (value: string) => void;
  setDraftNotifyOnReveal: (value: boolean) => void;
  setDraftRevealMode: (value: RevealMode) => void;
  setDraftTeaser: (value: string) => void;
  setDraftTitle: (value: string) => void;
  surprise?: SurpriseStop | RevealedSurprise;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  visible: boolean;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActionsVisible(false);
    }
  }, [visible]);

  if (!surprise) {
    return null;
  }

  const currentVisibility =
    'currentVisibility' in surprise
      ? surprise.currentVisibility
      : surprise.visibility === 'revealed'
        ? 'revealed'
        : 'teaser';
  const canReadFullCard = ownerMode || currentVisibility === 'revealed';

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.surpriseModalPanel,
            { marginTop: Platform.OS === 'ios' ? 36 : 18 },
          ]}
        >
          <View style={styles.modalHandle} />
          {ownerMode && (
            <View style={styles.modalActionCluster}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setActionsVisible((current) => !current)}
                style={[styles.modalActionButton, { backgroundColor: '#FFFFFF' }]}
              >
                <Pencil size={19} color="#1C1E2E" />
              </Pressable>
              {actionsVisible && (
                <View style={[styles.cardActionMenu, { backgroundColor: '#FFFFFF', borderColor: '#F2C94C' }]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActionsVisible(false);
                      onStartEdit(surprise);
                    }}
                    style={styles.cardActionItem}
                  >
                    <Pencil size={16} color="#1C1E2E" />
                    <Text style={[styles.cardActionText, { color: '#1C1E2E' }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActionsVisible(false);
                      onDeleteSurprise(surprise.id);
                    }}
                    style={styles.cardActionItem}
                  >
                    <Trash2 size={16} color="#C5392D" />
                    <Text style={[styles.cardActionText, { color: '#C5392D' }]}>Delete</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.modalCloseButton, { backgroundColor: '#FFFFFF' }]}
          >
            <X size={20} color="#1C1E2E" />
          </Pressable>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.panelHeader}>
              <View style={styles.flexOne}>
                <Text style={[styles.eyebrow, { color: '#5D4D13' }]}>Surprise card</Text>
                <Text style={[styles.panelTitle, { color: '#1C1E2E' }]}>
                  {canReadFullCard ? surprise.title : 'Locked surprise'}
                </Text>
              </View>
              <View style={[styles.surprisePlanIcon, { backgroundColor: '#F2C94C' }]}>
                <Sparkles size={19} color="#1C1E2E" />
              </View>
            </View>

            {isEditing ? (
              <View style={styles.editCardArea}>
                <Text style={[styles.controlLabel, { color: '#5D4D13' }]}>Title</Text>
                <TextInput
                  onChangeText={setDraftTitle}
                  placeholder="Title"
                  placeholderTextColor="#8A92A3"
                  style={[styles.input, { borderColor: '#F2C94C', color: '#1C1E2E', backgroundColor: '#FFFFFF' }]}
                  value={draftTitle}
                />
                <Text style={[styles.controlLabel, { color: '#5D4D13' }]}>Message</Text>
                <TextInput
                  multiline
                  onChangeText={setDraftMessage}
                  placeholder="Reveal message"
                  placeholderTextColor="#8A92A3"
                  style={[
                    styles.input,
                    styles.multilineInput,
                    { borderColor: '#F2C94C', color: '#1C1E2E', backgroundColor: '#FFFFFF' },
                  ]}
                  value={draftMessage}
                />
                <Text style={[styles.controlLabel, { color: '#5D4D13' }]}>Teaser</Text>
                <TextInput
                  onChangeText={setDraftTeaser}
                  placeholder="Optional teaser"
                  placeholderTextColor="#8A92A3"
                  style={[styles.input, { borderColor: '#F2C94C', color: '#1C1E2E', backgroundColor: '#FFFFFF' }]}
                  value={draftTeaser}
                />
                <Text style={[styles.controlLabel, { color: '#5D4D13' }]}>Reveal</Text>
                <View style={styles.segmentRow}>
                  {revealModes.map((mode) => (
                    <Pressable
                      accessibilityRole="button"
                      key={mode.value}
                      onPress={() => setDraftRevealMode(mode.value)}
                      style={[
                        styles.segment,
                        { backgroundColor: '#FFFFFF', borderColor: '#F2C94C' },
                        draftRevealMode === mode.value && { backgroundColor: '#1C1E2E', borderColor: '#1C1E2E' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: '#1C1E2E' },
                          draftRevealMode === mode.value && { color: '#FFFFFF' },
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.controlLabel, { color: '#5D4D13' }]}>Near</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.anchorScroll}>
                  {trip.stops.slice(0, 10).map((stop) => (
                    <Pressable
                      accessibilityRole="button"
                      key={stop.id}
                      onPress={() => setDraftAnchorId(stop.id)}
                      style={[
                        styles.anchorChip,
                        { backgroundColor: '#FFFFFF', borderColor: '#F2C94C' },
                        draftAnchorId === stop.id && { backgroundColor: '#1C1E2E', borderColor: '#1C1E2E' },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.anchorChipText,
                          { color: '#1C1E2E' },
                          draftAnchorId === stop.id && { color: '#FFFFFF' },
                        ]}
                      >
                        {stop.city}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: draftNotifyOnReveal }}
                  onPress={() => setDraftNotifyOnReveal(!draftNotifyOnReveal)}
                  style={[styles.guideToggle, { backgroundColor: '#FFFFFF' }]}
                >
                  <View
                    style={[
                      styles.todoCheck,
                      { borderColor: draftNotifyOnReveal ? '#2B8C83' : '#F2C94C' },
                      draftNotifyOnReveal && { backgroundColor: '#2B8C83' },
                    ]}
                  >
                    {draftNotifyOnReveal && <Check size={16} color="#FFFFFF" />}
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={[styles.compactTitle, { color: '#1C1E2E' }]}>
                      Notify other phones when revealed
                    </Text>
                    <Text style={[styles.compactMeta, { color: '#5D4D13' }]}>
                      Uses the Expo push token of opted-in phones.
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.editActionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSaveEdit(surprise.id)}
                    style={[styles.editSaveButton, { backgroundColor: '#1C1E2E' }]}
                  >
                    <Save size={16} color="#FFFFFF" />
                    <Text style={[styles.revealButtonText, { color: '#FFFFFF' }]}>Save</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onCancelEdit}
                    style={[styles.editCancelButton, { backgroundColor: '#FFFFFF' }]}
                  >
                    <X size={16} color="#1C1E2E" />
                    <Text style={[styles.revealButtonText, { color: '#1C1E2E' }]}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Text style={[styles.placeNotesText, { color: '#1C1E2E', backgroundColor: '#FFFFFF' }]}>
                  {canReadFullCard ? surprise.message : surprise.teaser ?? 'Something is waiting.'}
                </Text>
                <Text style={[styles.addressText, { color: '#1C1E2E' }]}>
                  {surprise.city} - {surprise.revealMode}
                </Text>
                {ownerMode && surprise.visibility !== 'revealed' && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onReveal(surprise.id)}
                    style={[styles.revealButton, { backgroundColor: '#1C1E2E' }]}
                  >
                    <Check size={16} color="#FFFFFF" />
                    <Text style={[styles.revealButtonText, { color: '#FFFFFF' }]}>Reveal now</Text>
                  </Pressable>
                )}
              </>
            )}
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
  onOpenSurprise,
  ownerMode,
  stops,
  surprises,
  theme,
}: {
  date: string;
  day?: TripDay;
  emptyText: string;
  onOpenStop: (stopId: string) => void;
  onOpenSurprise: (surpriseId: string) => void;
  ownerMode: boolean;
  stops: TripStop[];
  surprises: RevealedSurprise[];
  theme: (typeof themes)[ThemeKey];
}) {
  const itemCount = stops.length + surprises.length;

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{formatDate(date)}</Text>
          {day && <Text style={[styles.sectionMeta, { color: theme.muted }]}>{day.title}</Text>}
        </View>
        <Text style={[styles.sectionMeta, { color: theme.muted }]}>
          {day ? `${itemCount} items` : 'Real date'}
        </Text>
      </View>
      {itemCount === 0 ? (
        <View style={[styles.emptyMini, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.compactMeta, { color: theme.muted }]}>{emptyText}</Text>
        </View>
      ) : (
        <>
          {stops.map((stop) => (
            <StopCard key={stop.id} onPress={() => onOpenStop(stop.id)} stop={stop} theme={theme} />
          ))}
          {surprises.map((surprise) => (
            <SurprisePlanCard
              key={surprise.id}
              onPress={() => onOpenSurprise(surprise.id)}
              ownerMode={ownerMode}
              surprise={surprise}
            />
          ))}
        </>
      )}
    </View>
  );
}

function SurprisePlanCard({
  onPress,
  ownerMode,
  surprise,
}: {
  onPress?: () => void;
  ownerMode: boolean;
  surprise: RevealedSurprise;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.surprisePlanCard, { borderColor: '#F2C94C' }]}
    >
      <View style={[styles.surprisePlanIcon, { backgroundColor: '#F2C94C' }]}>
        <Sparkles size={18} color="#1C1E2E" />
      </View>
      <View style={styles.flexOne}>
        <Text style={[styles.compactTitle, { color: '#1C1E2E' }]}>
          {surprise.currentVisibility === 'revealed' ? surprise.title : 'Locked surprise'}
        </Text>
        <Text style={[styles.bodyText, { color: '#5D4D13' }]}>
          {surprise.currentVisibility === 'revealed'
            ? surprise.message
            : surprise.teaser ?? 'Something is waiting.'}
        </Text>
        {!ownerMode && <Text style={[styles.compactMeta, { color: '#5D4D13' }]}>Surprise alert</Text>}
      </View>
    </Pressable>
  );
}

function CalendarSection({
  mode,
  onOpenStop,
  onOpenSurprise,
  setMode,
  theme,
  trip,
  visibleSurprises,
  windowStartDate,
}: {
  mode: CalendarMode;
  onOpenStop: (stopId: string) => void;
  onOpenSurprise: (surpriseId: string) => void;
  setMode: (mode: CalendarMode) => void;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  visibleSurprises: RevealedSurprise[];
  windowStartDate: string;
}) {
  const visibleDays = useMemo(
    () => getCalendarDays(trip.days, mode, windowStartDate, trip.stops, visibleSurprises),
    [mode, trip.days, trip.stops, visibleSurprises, windowStartDate],
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
              {stops.map((stop) => (
                <Pressable
                  accessibilityRole="button"
                  key={stop.id}
                  onPress={() => onOpenStop(stop.id)}
                  style={[styles.calendarStop, { backgroundColor: theme.softSurface }]}
                >
                  <Text style={styles.calendarStopEmoji}>{getStopEmoji(stop)}</Text>
                  <Text style={[styles.compactMeta, { color: theme.muted }]}>{stop.title}</Text>
                </Pressable>
              ))}
              {getSurprisesForDate(visibleSurprises, day.date, trip.stops).map((surprise) => (
                <Pressable
                  accessibilityRole="button"
                  key={surprise.id}
                  onPress={() => onOpenSurprise(surprise.id)}
                  style={[styles.calendarStop, styles.calendarSurpriseStop]}
                >
                  <Text style={styles.calendarStopEmoji}>✨</Text>
                  <Text style={[styles.compactMeta, { color: '#5D4D13' }]}>
                    {surprise.currentVisibility === 'revealed' ? surprise.title : 'Locked surprise'}
                  </Text>
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
  onOpenSurprise,
  onSelectStepPlace,
  ownerMode,
  planPanel,
  setCalendarMode,
  setGuideEnabled,
  setPlanPanel,
  setStepMapCategory,
  setStepCity,
  setStepDate,
  setStepNotes,
  setStepTitle,
  stepCity,
  stepDate,
  stepError,
  stepMapCategory,
  stepNotes,
  stepPlaceSuggestions,
  stepSelectedPlace,
  stepTitle,
  theme,
  trip,
  visibleSurprises,
  windowStartDate,
}: {
  addStep: () => void;
  calendarMode: CalendarMode;
  guideEnabled: boolean;
  guideStatus: string;
  onOpenStop: (stopId: string) => void;
  onOpenSurprise: (surpriseId: string) => void;
  onSelectStepPlace: (suggestion: PlaceSuggestion) => void;
  ownerMode: boolean;
  planPanel: PlanPanel;
  setCalendarMode: (mode: CalendarMode) => void;
  setGuideEnabled: (value: boolean) => void;
  setPlanPanel: (panel: PlanPanel) => void;
  setStepMapCategory: (value: MapCategory) => void;
  setStepCity: (value: string) => void;
  setStepDate: (value: string) => void;
  setStepNotes: (value: string) => void;
  setStepTitle: (value: string) => void;
  stepCity: string;
  stepDate: string;
  stepError: string;
  stepMapCategory: MapCategory;
  stepNotes: string;
  stepPlaceSuggestions: PlaceSuggestion[];
  stepSelectedPlace?: PlaceSuggestion;
  stepTitle: string;
  theme: (typeof themes)[ThemeKey];
  trip: Trip;
  visibleSurprises: RevealedSurprise[];
  windowStartDate: string;
}) {
  const mustChooseStepPlace = stepPlaceSuggestions.length > 0 && !stepSelectedPlace;
  const addDisabled = guideStatus.length > 0 || mustChooseStepPlace;

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
          onOpenSurprise={onOpenSurprise}
          setMode={setCalendarMode}
          theme={theme}
          trip={trip}
          visibleSurprises={visibleSurprises}
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
            <PlaceSuggestionList
              onSelect={onSelectStepPlace}
              selectedSuggestion={stepSelectedPlace}
              suggestions={stepPlaceSuggestions}
              theme={theme}
            />
            {mustChooseStepPlace && (
              <Text style={[styles.compactMeta, { color: theme.accentDark }]}>
                Choose one suggested place so the map pin is exact.
              </Text>
            )}
            <Text style={[styles.controlLabel, { color: theme.muted }]}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryEditRail}>
              {editableMapCategories.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.category}
                  onPress={() => setStepMapCategory(item.category)}
                  style={[
                    styles.categoryEditChip,
                    { backgroundColor: theme.softSurface, borderColor: theme.border },
                    stepMapCategory === item.category && {
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
                      stepMapCategory === item.category && { color: theme.surface },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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
        {stepError ? (
          <Text style={styles.errorText}>{stepError}</Text>
        ) : null}
        <Pressable
              accessibilityRole="button"
              disabled={addDisabled}
              onPress={addStep}
              style={[
                styles.addButton,
                { backgroundColor: theme.accent },
                addDisabled && styles.addButtonDisabled,
              ]}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add place</Text>
            </Pressable>
          </View>

          {trip.days.map((day, dayIndex) => {
            const dayStops = getStopsForDay(trip, day);
            const daySurprises = getSurprisesForDate(visibleSurprises, day.date, trip.stops);
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
                      style={[
                        styles.compactStop,
                        { backgroundColor: theme.softSurface, borderColor: theme.border },
                      ]}
                    >
                      <View style={[styles.compactEmojiBadge, { backgroundColor: stop.coverColor }]}>
                        <Text style={styles.compactEmoji}>{getStopEmoji(stop)}</Text>
                      </View>
                      <View style={styles.compactText}>
                        <Text style={[styles.compactTitle, { color: theme.text }]}>{stop.title}</Text>
                        <Text style={[styles.compactMeta, { color: theme.muted }]}>
                          {formatTime(stop.startsAt)} - {stop.city}
                        </Text>
                      </View>
                      <ExternalLink size={15} color={theme.text} />
                    </Pressable>
                  ))}
                  {daySurprises.map((surprise) => (
                    <SurprisePlanCard
                      key={surprise.id}
                      onPress={() => onOpenSurprise(surprise.id)}
                      ownerMode={ownerMode}
                      surprise={surprise}
                    />
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
  draftNotifyOnReveal,
  draftRevealMode,
  draftTeaser,
  draftTitle,
  onDeleteSurprise,
  onOpenSurprise,
  ownerMode,
  revealNow,
  setDraftAnchorId,
  setDraftMessage,
  setDraftNotifyOnReveal,
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
  draftNotifyOnReveal: boolean;
  draftRevealMode: RevealMode;
  draftTeaser: string;
  draftTitle: string;
  onDeleteSurprise: (surpriseId: string) => void;
  onOpenSurprise: (surpriseId: string) => void;
  ownerMode: boolean;
  revealNow: (surpriseId: string) => void;
  setDraftAnchorId: (value: string) => void;
  setDraftMessage: (value: string) => void;
  setDraftNotifyOnReveal: (value: boolean) => void;
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
            accessibilityRole="checkbox"
            accessibilityState={{ checked: draftNotifyOnReveal }}
            onPress={() => setDraftNotifyOnReveal(!draftNotifyOnReveal)}
            style={[styles.guideToggle, { backgroundColor: theme.surface }]}
          >
            <View
              style={[
                styles.todoCheck,
                { borderColor: draftNotifyOnReveal ? theme.accentDark : theme.border },
                draftNotifyOnReveal && { backgroundColor: theme.accentDark },
              ]}
            >
              {draftNotifyOnReveal && <Check size={16} color="#FFFFFF" />}
            </View>
            <View style={styles.flexOne}>
              <Text style={[styles.compactTitle, { color: theme.text }]}>
                Notify other phones when revealed
              </Text>
              <Text style={[styles.compactMeta, { color: theme.muted }]}>
                Sends a push only after the surprise is revealed.
              </Text>
            </View>
          </Pressable>
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
        <Pressable
          accessibilityRole="button"
          key={surprise.id}
          onPress={() => onOpenSurprise(surprise.id)}
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
            {ownerMode && (
              <Pressable
                accessibilityRole="button"
                onPress={() => onDeleteSurprise(surprise.id)}
                style={[styles.revealButton, { backgroundColor: '#C5392D' }]}
              >
                <Trash2 size={16} color="#FFFFFF" />
                <Text style={[styles.revealButtonText, { color: '#FFFFFF' }]}>Delete</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function SettingsScreen({
  appVersion,
  inviteName,
  inviteStatus,
  onBackToTrips,
  onEnableNotifications,
  onHiddenGestureStep,
  onInviteMember,
  onLogout,
  pushStatus,
  profile,
  selectedTripSummary,
  setInviteName,
  setThemeKey,
  syncStatus,
  theme,
  themeKey,
}: {
  appVersion: string;
  inviteName: string;
  inviteStatus: string;
  onBackToTrips: () => void;
  onEnableNotifications: () => void;
  onHiddenGestureStep: (step: string) => void;
  onInviteMember: () => void;
  onLogout: () => void;
  pushStatus: string;
  profile?: UserProfile;
  selectedTripSummary?: TripSummary;
  setInviteName: (value: string) => void;
  setThemeKey: (themeKey: ThemeKey) => void;
  syncStatus: string;
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
      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.eyebrow, { color: theme.muted }]}>Sync</Text>
        <Text style={[styles.compactTitle, { color: theme.text }]}>{syncStatus}</Text>
      </View>
      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.eyebrow, { color: theme.muted }]}>Trip</Text>
        <Text style={[styles.compactTitle, { color: theme.text }]}>
          {selectedTripSummary?.title ?? 'Selected trip'}
        </Text>
        <Text style={[styles.compactMeta, { color: theme.muted }]}>
          {profile?.username ?? 'Traveler'} - version {appVersion}
        </Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setInviteName}
          placeholder="Invite by username or email"
          placeholderTextColor="#8A92A3"
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
          value={inviteName}
        />
        {inviteStatus ? <Text style={[styles.compactMeta, { color: theme.accentDark }]}>{inviteStatus}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={onInviteMember}
          style={[styles.addButton, { backgroundColor: theme.accentDark }]}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Invite traveler</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onBackToTrips}
          style={[styles.addButton, { backgroundColor: theme.softSurface }]}
        >
          <X size={18} color={theme.text} />
          <Text style={[styles.addButtonText, { color: theme.text }]}>Back to trips</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={[styles.addButton, { backgroundColor: theme.text }]}
        >
          <KeyRound size={18} color={theme.surface} />
          <Text style={[styles.addButtonText, { color: theme.surface }]}>Log out</Text>
        </Pressable>
      </View>
      <View style={[styles.primaryPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.eyebrow, { color: theme.muted }]}>Notifications</Text>
        <Text style={[styles.compactTitle, { color: theme.text }]}>{pushStatus}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onEnableNotifications}
          style={[styles.addButton, { backgroundColor: theme.text }]}
        >
          <Sparkles size={18} color={theme.surface} />
          <Text style={[styles.addButtonText, { color: theme.surface }]}>Enable surprise alerts</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SettingsModal({
  appVersion,
  inviteName,
  inviteStatus,
  onBackToTrips,
  onEnableNotifications,
  onClose,
  onHiddenGestureStep,
  onInviteMember,
  onLogout,
  pushStatus,
  profile,
  selectedTripSummary,
  setInviteName,
  setThemeKey,
  syncStatus,
  theme,
  themeKey,
  visible,
}: {
  appVersion: string;
  inviteName: string;
  inviteStatus: string;
  onBackToTrips: () => void;
  onEnableNotifications: () => void;
  onClose: () => void;
  onHiddenGestureStep: (step: string) => void;
  onInviteMember: () => void;
  onLogout: () => void;
  pushStatus: string;
  profile?: UserProfile;
  selectedTripSummary?: TripSummary;
  setInviteName: (value: string) => void;
  setThemeKey: (themeKey: ThemeKey) => void;
  syncStatus: string;
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
            appVersion={appVersion}
            inviteName={inviteName}
            inviteStatus={inviteStatus}
            onBackToTrips={onBackToTrips}
            onEnableNotifications={onEnableNotifications}
            onHiddenGestureStep={onHiddenGestureStep}
            onInviteMember={onInviteMember}
            onLogout={onLogout}
            pushStatus={pushStatus}
            profile={profile}
            selectedTripSummary={selectedTripSummary}
            setInviteName={setInviteName}
            setThemeKey={setThemeKey}
            syncStatus={syncStatus}
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
      style={[
        styles.stopCard,
        { backgroundColor: onPress ? theme.softSurface : theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.stopColor, { backgroundColor: stop.coverColor }]} />
      <View style={[styles.stopCardIcon, { backgroundColor: stop.coverColor }]}>
        <Text style={styles.stopCardEmoji}>{getStopEmoji(stop)}</Text>
      </View>
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

function groupNearbyStops(stops: TripStop[], thresholdMeters = 40) {
  const groups: Array<{
    coordinates: Coordinates;
    id: string;
    stops: TripStop[];
  }> = [];

  for (const stop of stops) {
    const existingGroup = groups.find(
      (group) => distanceMeters(group.coordinates, stop.coordinates) <= thresholdMeters,
    );

    if (existingGroup) {
      existingGroup.stops.push(stop);
      existingGroup.coordinates = averageCoordinates(existingGroup.stops.map((item) => item.coordinates));
    } else {
      groups.push({
        coordinates: stop.coordinates,
        id: `cluster-${stop.id}`,
        stops: [stop],
      });
    }
  }

  return groups;
}

function averageCoordinates(coordinates: Coordinates[]): Coordinates {
  return {
    latitude:
      coordinates.reduce((total, coordinate) => total + coordinate.latitude, 0) / coordinates.length,
    longitude:
      coordinates.reduce((total, coordinate) => total + coordinate.longitude, 0) / coordinates.length,
  };
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

function getCalendarDays(
  days: TripDay[],
  mode: CalendarMode,
  windowStartDate: string,
  stops: TripStop[],
  surprises: RevealedSurprise[],
) {
  const sortedDays = days
    .slice()
    .sort((left, right) => Date.parse(`${left.date}T12:00:00`) - Date.parse(`${right.date}T12:00:00`));
  const knownStopIds = new Set(stops.map((stop) => stop.id));
  const daysWithItems = sortedDays.filter((day) => {
    const hasStops = day.stops.some((stopId) => knownStopIds.has(stopId));
    const hasSurprises = getSurprisesForDate(surprises, day.date, stops).length > 0;
    return hasStops || hasSurprises;
  });

  if (mode === 'week') {
    const endDate = addIsoDays(windowStartDate, 7);
    return daysWithItems.filter((day) => day.date >= windowStartDate && day.date < endDate);
  }

  const month = windowStartDate.slice(0, 7);
  return daysWithItems.filter((day) => day.date.startsWith(month));
}

function getSurprisesForDate(
  surprises: RevealedSurprise[],
  date: string,
  stops: TripStop[],
) {
  return surprises.filter((surprise) => getSurprisePlanDate(surprise, stops) === date);
}

function getSurprisePlanDate(surprise: RevealedSurprise, stops: TripStop[]) {
  if (surprise.revealAt) {
    return surprise.revealAt.slice(0, 10);
  }

  const anchor = surprise.anchorStopId
    ? stops.find((stop) => stop.id === surprise.anchorStopId)
    : undefined;

  if (anchor) {
    return anchor.startsAt.slice(0, 10);
  }

  return surprise.createdAt.slice(0, 10);
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

async function fetchPlaceSuggestions(query: string): Promise<PlaceSuggestion[]> {
  const endpoint = getPlaceSuggestionsEndpoint();

  if (!endpoint) {
    return [];
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({ query }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  return Array.isArray(payload.suggestions) ? payload.suggestions : [];
}

function getPlaceSuggestionsEndpoint() {
  const researchEndpoint = process.env.EXPO_PUBLIC_SOCIAL_RESEARCH_ENDPOINT;

  if (!researchEndpoint) {
    return undefined;
  }

  return researchEndpoint.replace(/\/research\/place\/?$/, '/research/place-suggestions');
}

function formatSuggestionArea(suggestion: PlaceSuggestion) {
  return suggestion.address ?? suggestion.name;
}

function mergeStopLinks(
  links: TripStop['links'],
  nextLink: NonNullable<TripStop['links']>[number],
): TripStop['links'] {
  const withoutDuplicate = (links ?? []).filter((link) => link.label !== nextLink.label);
  return [...withoutDuplicate, nextLink];
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
  if (stop.travelModeFromPrevious === 'flight' || stop.mapCategory === 'travel') {
    return '✈️';
  }

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

function formatShortDateTime(value: string) {
  if (!isValidDateValue(value)) {
    return '';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
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

function getProfileInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return 'RT';
  }

  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

function getAccountErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('USERNAME_TAKEN')) {
    return 'That username is already taken.';
  }

  if (message.includes('USER_NOT_FOUND') || message.includes('USER_PROFILE_NOT_FOUND')) {
    return 'No account found with that username or email.';
  }

  if (message.includes('auth/email-already-in-use')) {
    return 'That email already has an account.';
  }

  if (message.includes('auth/operation-not-allowed')) {
    return 'Enable Email/Password sign-in in Firebase Auth.';
  }

  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
    return 'Wrong username/email or password.';
  }

  if (message.includes('auth/invalid-email')) {
    return 'Use a valid email address.';
  }

  if (message.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters.';
  }

  if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    return 'Firebase rules blocked this action. Check Firestore rules.';
  }

  if (message.includes('network-request-failed') || message.includes('unavailable')) {
    return 'Firebase is unreachable. Check the connection and try again.';
  }

  return 'Account action failed. Check Firebase Auth and Firestore rules.';
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
  authScreen: {
    gap: 16,
    padding: 18,
    paddingBottom: 42,
    paddingTop: 24,
  },
  calendarDateCell: {
    alignItems: 'center',
    width: 46,
  },
  centeredScreen: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    padding: 24,
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
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    marginTop: 5,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  calendarStopEmoji: {
    fontSize: 15,
  },
  calendarSurpriseStop: {
    backgroundColor: '#FFF3B0',
  },
  clusterMarker: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 19,
    borderWidth: 2,
    height: 38,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    width: 38,
  },
  clusterMarkerText: {
    fontSize: 15,
    fontWeight: '900',
  },
  clusterPanel: {
    borderRadius: 8,
    maxHeight: '76%',
    padding: 16,
    width: '88%',
  },
  clusterStopRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    minHeight: 54,
    paddingHorizontal: 12,
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
  compactEmoji: {
    fontSize: 16,
  },
  compactEmojiBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  compactMeta: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  compactStop: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 10,
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
    paddingLeft: 12,
    paddingRight: 8,
  },
  documentDeleteButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
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
  documentOpenArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
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
  notifyButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    marginTop: 10,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  notifyButtonText: {
    fontSize: 12,
    fontWeight: '900',
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
  placeSuggestionArea: {
    marginTop: 2,
  },
  placeSuggestionRow: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    minHeight: 50,
    padding: 10,
  },
  placeSuggestionSelected: {
    alignItems: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    minHeight: 46,
    padding: 10,
  },
  placeModalPanel: {
    borderRadius: 8,
    maxHeight: '88%',
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
  profileAvatar: {
    alignItems: 'center',
    borderRadius: 8,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  profileAvatarImage: {
    height: '100%',
    width: '100%',
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  profileHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 2,
    marginTop: 4,
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
    alignItems: 'flex-start',
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
  stopCardEmoji: {
    fontSize: 18,
  },
  stopCardIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    marginLeft: 12,
    marginTop: 14,
    width: 36,
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
  surpriseModalPanel: {
    backgroundColor: '#FFF3B0',
    borderRadius: 8,
    maxHeight: '88%',
    padding: 16,
    width: '94%',
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
  tripIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  tripRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  todoCard: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
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
  surprisePlanCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF3B0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    padding: 12,
  },
  surprisePlanIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
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
