import { getApps, initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  SurpriseStop,
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
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    EXPO_PUBLIC_FIREBASE_APP_ID?: string;
    EXPO_PUBLIC_FIREBASE_TRIP_ID?: string;
  };
};

export type CloudTripData = {
  dataVersion: string;
  days: TripDay[];
  documents: TripDocument[];
  stops: TripStop[];
  surprises: SurpriseStop[];
  todos: TripTodo[];
};

type CloudTripDocument = {
  dataVersion?: string;
  pushDevices?: Record<string, PushDevice>;
  trip?: CloudTripData;
  updatedByDeviceId?: string;
};

type StartCloudSyncOptions = {
  deviceId: string;
  onMissingTrip: () => void;
  onRemotePushDevices: (devices: Record<string, PushDevice>) => void;
  onRemoteTrip: (trip: CloudTripData) => void;
  onStatus: (status: string) => void;
};

let initialized = false;

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
}: StartCloudSyncOptions): Promise<() => void> {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  onStatus('Cloud connecting...');
  await signInAnonymously(auth);
  onStatus('Cloud listening');

  return onSnapshot(
    doc(db, 'trips', getTripDocumentId()),
    (snapshot) => {
      if (!snapshot.exists()) {
        onStatus('Cloud ready');
        onMissingTrip();
        return;
      }

      const data = snapshot.data() as CloudTripDocument;
      onRemotePushDevices(data.pushDevices ?? {});

      if (data.updatedByDeviceId === deviceId) {
        onStatus('Cloud synced');
        return;
      }

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

export async function saveTripToCloud(trip: CloudTripData, deviceId: string) {
  const app = getFirebaseApp();
  const db = getFirestore(app);

  await setDoc(
    doc(db, 'trips', getTripDocumentId()),
    {
      dataVersion: trip.dataVersion,
      trip,
      updatedAt: serverTimestamp(),
      updatedByDeviceId: deviceId,
    },
    { merge: true },
  );
}

export async function savePushDeviceToCloud(device: PushDevice) {
  const app = getFirebaseApp();
  const db = getFirestore(app);

  await setDoc(
    doc(db, 'trips', getTripDocumentId()),
    {
      pushDevices: {
        [device.deviceId]: device,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
}

function getTripDocumentId() {
  return process.env.EXPO_PUBLIC_FIREBASE_TRIP_ID || 'singapore-indonesia-2026';
}
