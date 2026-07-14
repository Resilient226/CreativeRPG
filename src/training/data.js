// Firestore persistence for Training Grounds.
// Collections (all under the signed-in user): skills, npcs, interactions, memoryLogs.

import { db, auth } from "../lib/firebase";
import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs,
  query, orderBy, limit as fsLimit, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { freshSkills } from "./skills";
import { EVELYN_SEED } from "./evelyn";

// Resolves to whoever is CURRENTLY signed in — never cached permanently, so this
// stays correct even if someone signs out and a different person signs in on the
// same page. Same fix applied in ../lib/storage.js.
function uid() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user.uid); }
    }, reject);
  });
}
const base = async () => ["users", await uid()];

// ---- Skills (single doc) ----
export async function loadSkills() {
  const [u, id] = await base();
  const ref = doc(db, u, id, "training", "skills");
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data().skills;
  const seeded = freshSkills();
  await setDoc(ref, { skills: seeded, updatedAt: Date.now() });
  return seeded;
}
export async function saveSkills(skills) {
  const [u, id] = await base();
  await setDoc(doc(db, u, id, "training", "skills"), { skills, updatedAt: Date.now() });
}

// ---- NPC (Evelyn for v1) ----
export async function loadNpc(npcId = EVELYN_SEED.id) {
  const [u, id] = await base();
  const ref = doc(db, u, id, "npcs", npcId);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  await setDoc(ref, EVELYN_SEED);
  return EVELYN_SEED;
}
export async function saveNpc(npc) {
  const [u, id] = await base();
  await setDoc(doc(db, u, id, "npcs", npc.id), npc);
}
// Apply bounded state deltas + mood + memory note, clamped to 0–100.
export async function applyNpcTurn(npc, { stateChanges = {}, moodAfter, memoryNote }) {
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const next = {
    ...npc,
    state: {
      ...npc.state,
      relationshipScore: clamp(npc.state.relationshipScore + (stateChanges.relationshipScore || 0)),
      trust: clamp(npc.state.trust + (stateChanges.trust || 0)),
      interest: clamp(npc.state.interest + (stateChanges.interest || 0)),
      mood: moodAfter || npc.state.mood,
    },
  };
  await saveNpc(next);
  if (memoryNote) await appendMemory(npc.id, memoryNote);
  return next;
}

// ---- Memory log ----
export async function appendMemory(npcId, note) {
  const [u, id] = await base();
  await addDoc(collection(db, u, id, "memoryLogs"), {
    npcId, note, at: serverTimestamp(), ts: Date.now(),
  });
}
export async function loadMemoryLog(npcId, max = 100) {
  const [u, id] = await base();
  const q = query(
    collection(db, u, id, "memoryLogs"),
    orderBy("ts", "asc"), fsLimit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).filter((m) => m.npcId === npcId);
}
export async function setMemorySummary(npcId, summary) {
  const npc = await loadNpc(npcId);
  await saveNpc({ ...npc, memorySummary: summary });
}

// ---- Interactions (session log, for the mentor) ----
export async function logInteraction(entry) {
  const [u, id] = await base();
  await addDoc(collection(db, u, id, "interactions"), {
    ...entry, at: serverTimestamp(), ts: Date.now(),
  });
}
export async function loadInteractions(max = 50) {
  const [u, id] = await base();
  const q = query(
    collection(db, u, id, "interactions"),
    orderBy("ts", "desc"), fsLimit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}
