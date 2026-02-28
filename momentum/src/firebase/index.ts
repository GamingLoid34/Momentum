import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

type FirebaseServices = {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  missingConfig: string[];
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

let cachedServices: FirebaseServices | null = null;

export const isFirebaseConfigured = missingConfig.length === 0;

export function getFirebaseServices(): FirebaseServices {
  if (cachedServices) {
    return cachedServices;
  }

  if (!isFirebaseConfigured) {
    cachedServices = {
      app: null,
      auth: null,
      db: null,
      missingConfig,
    };
    return cachedServices;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  cachedServices = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    missingConfig: [],
  };

  return cachedServices;
}
