import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { FIREBASE_CONFIG } from '../constants';

export function isFirebaseConfigured(): boolean {
  return Object.values(FIREBASE_CONFIG).every((value) => {
    if (!value || !value.trim()) {
      return false;
    }

    return !value.startsWith('YOUR_FIREBASE_');
  });
}

export function getFirebaseDatabase() {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return getDatabase(app);
}
