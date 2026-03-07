import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA09k8VXsk6i0XzGaGgMGsNB2wEQmnSfts",
  authDomain: "henry-auth-bcd1d.firebaseapp.com",
  projectId: "henry-auth-bcd1d",
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    // Use localStorage persistence — works reliably in Chrome extension popups
    // (default indexedDB persistence can fail in extension contexts)
    setPersistence(_auth, browserLocalPersistence);
  }
  return _auth;
}
