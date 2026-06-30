import { getApps, initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import {
  initializeAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Persistence,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';

import {
  SurpriseStop,
  Trip,
  TripDay,
  TripDocument,
  TripStop,
  TripTodo,
} from '../types/trip';
import type { PushDevice } from './pushNotifications';

declare const process: {
  env: {
    EXPO_PUBLIC_FIREBASE_API_KEY?: string;
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    EXPO_PUBLIC_FIREBASE_APP_ID?: string;
    EXPO_PUBLIC_FIREBASE_TRIP_ID?: string;
  };
};

export type CloudTripData = {
  dataVersion: string;
  days: TripDay[];
  documents: TripDocument[];
  endsAt: string;
  homeTimezone: string;
  stops: TripStop[];
  surprises: SurpriseStop[];
  title: string;
  todos: TripTodo[];
  travelers: string[];
  startsAt: string;
};

type CloudTripDocument = {
  dataVersion?: string;
  pushDevices?: Record<string, PushDevice>;
  trip?: CloudTripData;
  updatedByDeviceId?: string;
};

export type TripSummary = {
  createdAt?: string;
  createdByProfileId: string;
  id: string;
  isPrivate: boolean;
  memberIds?: string[];
  memberNames: string[];
  ownerName: string;
  password?: string;
  startsAt?: string;
  title: string;
  updatedAt?: string;
};

export type CloudUserProfile = {
  email: string;
  id: string;
  name: string;
  normalizedName: string;
  username: string;
};

type StartCloudSyncOptions = {
  deviceId: string;
  onMissingTrip: () => void;
  onRemotePushDevices: (devices: Record<string, PushDevice>) => void;
  onRemoteTrip: (trip: CloudTripData) => void;
  onStatus: (status: string) => void;
  tripId: string;
};

type SecureStorePersistence = Persistence & {
  _addListener: () => void;
  _get: <T>(key: string) => Promise<T | null>;
  _isAvailable: () => Promise<boolean>;
  _remove: (key: string) => Promise<void>;
  _removeListener: () => void;
  _set: (key: string, value: unknown) => Promise<void>;
};

let initialized = false;
let authInitialized = false;

const secureStoreAuthPersistence: SecureStorePersistence = {
  type: 'LOCAL',
  async _isAvailable() {
    return SecureStore.isAvailableAsync();
  },
  async _set(key, value) {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  },
  async _get<T>(key: string) {
    const value = await SecureStore.getItemAsync(key);
    return value ? (JSON.parse(value) as T) : null;
  },
  async _remove(key) {
    await SecureStore.deleteItemAsync(key);
  },
  _addListener() {
    // SecureStore has no cross-tab event model in React Native.
  },
  _removeListener() {
    // SecureStore has no cross-tab event model in React Native.
  },
};

export function isFirebaseSyncConfigured() {
  return Boolean(
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY &&
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  );
}

export async function startTripCloudSync({
  deviceId,
  onMissingTrip,
  onRemotePushDevices,
  onRemoteTrip,
  onStatus,
  tripId,
}: StartCloudSyncOptions): Promise<() => void> {
  const app = getFirebaseApp();
  const db = getFirestore(app);

  onStatus('Cloud connecting...');
  requireSignedInUser();
  onStatus('Cloud listening');

  return onSnapshot(
    doc(db, 'trips', tripId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onStatus('Cloud ready');
        onMissingTrip();
        return;
      }

      const data = snapshot.data() as CloudTripDocument;
      onRemotePushDevices(data.pushDevices ?? {});

      if (data.trip) {
        onRemoteTrip(data.trip);
        onStatus('Cloud synced');
      } else {
        onStatus('Cloud ready');
        onMissingTrip();
      }
    },
    () => {
      onStatus('Cloud sync unavailable');
    },
  );
}

export async function saveTripToCloud(tripId: string, trip: CloudTripData, deviceId: string) {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  requireSignedInUser();

  await setDoc(
    doc(db, 'trips', tripId),
    stripUndefined({
      dataVersion: trip.dataVersion,
      trip,
      updatedAt: serverTimestamp(),
      updatedByDeviceId: deviceId,
    }),
    { merge: true },
  );
}

export async function savePushDeviceToCloud(tripId: string, device: PushDevice) {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  requireSignedInUser();

  await setDoc(
    doc(db, 'trips', tripId),
    stripUndefined({
      pushDevices: {
        [device.deviceId]: device,
      },
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
}

export async function saveTripSummaryToCloud(summary: TripSummary) {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  requireSignedInUser();

  await setDoc(
    doc(db, 'tripIndex', summary.id),
    stripUndefined({
      ...summary,
      memberIds: normalizeMemberIds(summary.memberIds ?? []),
      memberNames: normalizeMemberNames(summary.memberNames),
      updatedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
}

export async function createTripOnCloud({
  deviceId,
  summary,
  trip,
}: {
  deviceId: string;
  summary: TripSummary;
  trip: CloudTripData;
}) {
  await saveTripToCloud(summary.id, trip, deviceId);
  await saveTripSummaryToCloud(summary);
}

export async function listenTripsForMember({
  memberId,
  memberName,
  onStatus,
  onTrips,
}: {
  memberId: string;
  memberName: string;
  onStatus: (status: string) => void;
  onTrips: (trips: TripSummary[]) => void;
}): Promise<() => void> {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  requireSignedInUser();

  onStatus('Loading trips...');

  const tripsByIdQuery = query(collection(db, 'tripIndex'), where('memberIds', 'array-contains', memberId));
  const tripsByNameQuery = query(
    collection(db, 'tripIndex'),
    where('memberNames', 'array-contains', normalizeMemberName(memberName)),
  );
  const tripsBySource = new Map<string, TripSummary[]>();

  const emitTrips = () => {
    const tripsById = new Map<string, TripSummary>();

    Array.from(tripsBySource.values()).flat().forEach((trip) => {
      tripsById.set(trip.id, normalizeTripSummary(trip));
    });

    const trips = Array.from(tripsById.values()).sort((left, right) =>
      (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''),
    );

    onTrips(trips);
    onStatus('Trips synced');
  };

  const unsubscribeById = onSnapshot(
    tripsByIdQuery,
    (snapshot) => {
      tripsBySource.set(
        'memberIds',
        snapshot.docs.map((tripDoc) => ({ id: tripDoc.id, ...tripDoc.data() }) as TripSummary),
      );
      emitTrips();
    },
    () => {
      onStatus('Trip list unavailable');
    },
  );

  const unsubscribeByName = onSnapshot(
    tripsByNameQuery,
    (snapshot) => {
      tripsBySource.set(
        'memberNames',
        snapshot.docs.map((tripDoc) => ({ id: tripDoc.id, ...tripDoc.data() }) as TripSummary),
      );
      emitTrips();
    },
    () => {
      onStatus('Trip list unavailable');
    },
  );

  return () => {
    unsubscribeById();
    unsubscribeByName();
  };
}

export async function createCloudAccount({
  email,
  password,
  username,
}: {
  email: string;
  password: string;
  username: string;
}) {
  const app = getFirebaseApp();
  const auth = getFirebaseAuth();
  const db = getFirestore(app);
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email);

  const credentials = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  await credentials.user.getIdToken(true);
  const profile: CloudUserProfile = {
    email: normalizedEmail,
    id: credentials.user.uid,
    name: normalizedUsername,
    normalizedName: normalizedUsername,
    username: normalizedUsername,
  };

  try {
    await runTransaction(db, async (transaction) => {
      const usernameRef = doc(db, 'usernames', normalizedUsername);
      const usernameSnapshot = await transaction.get(usernameRef);

      if (usernameSnapshot.exists()) {
        throw new Error('USERNAME_TAKEN');
      }

      transaction.set(usernameRef, stripUndefined({
        createdAt: new Date().toISOString(),
        email: normalizedEmail,
        uid: credentials.user.uid,
        username: normalizedUsername,
      }));
      transaction.set(doc(db, 'users', credentials.user.uid), stripUndefined({
        ...profile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    });

    await updateProfile(credentials.user, {
      displayName: normalizedUsername,
    }).catch(() => undefined);

    return profile;
  } catch (error) {
    await deleteUser(credentials.user).catch(() => undefined);
    throw error;
  }
}

export async function signInCloudAccount(identifier: string, password: string) {
  const app = getFirebaseApp();
  const auth = getFirebaseAuth();
  const email = identifier.includes('@')
    ? normalizeEmail(identifier)
    : (await getUsernameIndex(identifier))?.email;

  if (!email) {
    throw new Error('USER_NOT_FOUND');
  }

  const credentials = await signInWithEmailAndPassword(auth, email, password);
  await credentials.user.getIdToken(true);
  const profile = await getUserProfileById(credentials.user.uid);

  if (!profile) {
    throw new Error('USER_PROFILE_NOT_FOUND');
  }

  return profile;
}

export async function signOutCloudAccount() {
  await signOut(getFirebaseAuth());
}

export async function getCurrentCloudUserProfile() {
  const auth = getFirebaseAuth();
  await auth.authStateReady();

  if (!auth.currentUser) {
    return undefined;
  }

  return getUserProfileById(auth.currentUser.uid);
}

export async function findUserProfile(identifier: string): Promise<CloudUserProfile | undefined> {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  const value = identifier.trim();

  if (!value) {
    return undefined;
  }

  if (value.includes('@')) {
    const usersQuery = query(collection(db, 'users'), where('email', '==', normalizeEmail(value)), limit(1));
    const usersSnapshot = await getDocs(usersQuery);
    const firstUser = usersSnapshot.docs[0];
    return firstUser ? normalizeCloudUserProfile(firstUser.data(), firstUser.id) : undefined;
  }

  const usernameData = await getUsernameIndex(value);
  return usernameData.uid ? getUserProfileById(usernameData.uid) : undefined;
}

export function createCloudTripDataFromTrip(trip: Trip, dataVersion: string): CloudTripData {
  return {
    dataVersion,
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

export function normalizeMemberName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeMemberNames(values: string[]) {
  return values.map(normalizeMemberName).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
}

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeMemberIds(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
}

function normalizeTripSummary(summary: TripSummary): TripSummary {
  return {
    ...summary,
    memberIds: normalizeMemberIds(summary.memberIds ?? []),
    memberNames: normalizeMemberNames(summary.memberNames),
  };
}

async function getUserProfileById(uid: string): Promise<CloudUserProfile | undefined> {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  const snapshot = await getDoc(doc(db, 'users', uid));

  if (!snapshot.exists()) {
    return undefined;
  }

  return normalizeCloudUserProfile(snapshot.data(), snapshot.id);
}

async function getUsernameIndex(identifier: string) {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  const usernameSnapshot = await getDoc(doc(db, 'usernames', normalizeUsername(identifier)));

  if (!usernameSnapshot.exists()) {
    return {};
  }

  return usernameSnapshot.data() as { email?: string; uid?: string; username?: string };
}

function normalizeCloudUserProfile(data: unknown, uid: string): CloudUserProfile {
  const profile = data as Partial<CloudUserProfile>;
  const username = normalizeUsername(profile.username ?? profile.name ?? 'traveler');

  return {
    email: normalizeEmail(profile.email ?? ''),
    id: uid,
    name: username,
    normalizedName: username,
    username,
  };
}

function requireSignedInUser() {
  const user = getFirebaseAuth().currentUser;

  if (!user) {
    throw new Error('Firebase account login is required');
  }
}

function getFirebaseAuth() {
  const app = getFirebaseApp();

  if (!authInitialized) {
    try {
      const auth = initializeAuth(app, {
        persistence: secureStoreAuthPersistence,
      });
      authInitialized = true;
      return auth;
    } catch {
      authInitialized = true;
    }
  }

  return getAuth(app);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    ) as T;
  }

  return value;
}

function getFirebaseApp() {
  if (!isFirebaseSyncConfigured()) {
    throw new Error('Firebase sync is not configured');
  }

  if (!initialized && getApps().length === 0) {
    initializeApp(getFirebaseConfig());
    initialized = true;
  }

  return getApps()[0];
}

function getFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  };
}
