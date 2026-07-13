// Drop-in replacement for the artifact's `window.storage`, backed by Firestore.
// Same method shapes (get/set/delete/list) so the existing app's storageGet/
// storageSet wrappers keep working with a one-line import swap.
//
// Data lives per-user at: users/{uid}/kv/{key}
// Values are stored as JSON strings (matching the artifact contract) so the
// app's existing JSON.parse(r.value) / JSON.stringify(value) code is unchanged.
//
// NOTE: keys can't contain "/" in a Firestore doc id. The app already uses
// hierarchical keys like "art-inventory" and "chat-history" (hyphens, safe).
// If you introduce ":" keys, they're fine; slashes are not — encode if needed.

import { db, ensureUser } from "./firebase";
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where,
} from "firebase/firestore";

let uidPromise = null;
function uid() {
  if (!uidPromise) uidPromise = ensureUser();
  return uidPromise;
}

function kvDoc(userId, key) {
  return doc(db, "users", userId, "kv", key);
}

export const storage = {
  async get(key /*, shared ignored: single-user for now */) {
    const userId = await uid();
    const snap = await getDoc(kvDoc(userId, key));
    if (!snap.exists()) return null;
    const { value } = snap.data();
    return { key, value, shared: false };
  },

  async set(key, value) {
    const userId = await uid();
    await setDoc(kvDoc(userId, key), { value, updatedAt: Date.now() });
    return { key, value, shared: false };
  },

  async delete(key) {
    const userId = await uid();
    await deleteDoc(kvDoc(userId, key));
    return { key, deleted: true, shared: false };
  },

  async list(prefix = "") {
    const userId = await uid();
    const col = collection(db, "users", userId, "kv");
    const snap = await getDocs(col);
    const keys = snap.docs.map((d) => d.id).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

// Convenience wrappers matching the app's existing storageGet/storageSet helpers.
export async function storageGet(key) {
  try {
    const r = await storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}
export async function storageSet(key, value) {
  try {
    await storage.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
