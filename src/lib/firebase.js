import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut,
} from "firebase/auth";

// All values come from Vite env vars (VITE_ prefix = safe to expose to the client).
// Firestore security rules — not secrecy — protect the data (see README).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Real accounts now — each email/password or Google sign-in gets its own Firebase uid,
// and Firestore's security rules already scope all data to request.auth.uid, so this
// "just works" for real multi-user separation with no rules change needed.

export function signUpEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password).then(cred => cred.user);
}
export function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password).then(cred => cred.user);
}
export function signInGoogle() {
  return signInWithPopup(auth, googleProvider).then(cred => cred.user);
}
export function signOutUser() {
  return signOut(auth);
}
// Subscribes to real-time auth state. Calls back with the user (or null if signed out)
// every time it changes — this is what the app watches to decide Login vs. the game.
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
// Friendlier text for the handful of Firebase Auth errors people actually hit.
export function authErrorMessage(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "That email already has an account — try signing in instead.";
  if (code.includes("weak-password")) return "Password needs to be at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email address.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential"))
    return "Email or password didn't match.";
  if (code.includes("popup-closed-by-user")) return "Sign-in was closed before finishing.";
  return err?.message || "Something went wrong signing in.";
}
