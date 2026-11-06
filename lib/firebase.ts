import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const clean = (val: string | undefined, fallback: string): string => {
  const trimmed = val ? val.trim() : '';
  return trimmed || fallback;
};

const firebaseConfig = {
  apiKey: clean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    'AIzaSyABZe6gfWaxWsLDC7ofkPQPIr_PZe-xiIo'
  ),
  // Use Firebase's default auth domain: its OAuth redirect URI is registered
  // automatically. To use a custom domain via the next.config.js proxy instead,
  // set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to that domain and register
  // https://<domain>/__/auth/handler in the Google Cloud OAuth client.
  authDomain: clean(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    'podmeet-app-studio.firebaseapp.com'
  ),
  projectId: clean(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    'podmeet-app-studio'
  ),
  storageBucket: clean(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    'podmeet-app-studio.firebasestorage.app'
  ),
  messagingSenderId: clean(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    '853620999969'
  ),
  appId: clean(
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    '1:853620999969:web:72ec489e41f60613dce060'
  ),
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  app,
  auth,
  db,
  storage,
  googleProvider,
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  fbSignOut,
};

