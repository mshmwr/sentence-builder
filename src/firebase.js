/* ------------------------------------------------------------------ *
 *  Firebase glue — auth (Google) + per-user Firestore storage.
 *
 *  Data model:
 *    users/{uid}            { geminiKey, mastered }
 *    users/{uid}/history/*  { zh, en, stars, hints, misses, puzzle, createdAt }
 * ------------------------------------------------------------------ */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDsICa8oTyixnXvoCxQ4HOvkEuTpPM1_SY",
  authDomain: "pinju-web.firebaseapp.com",
  projectId: "pinju-web",
  storageBucket: "pinju-web.firebasestorage.app",
  messagingSenderId: "888028787625",
  appId: "1:888028787625:web:c648a28222354e5f1d4ab8",
});

const auth = getAuth(app);
const db = getFirestore(app);

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const loginWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

export async function loadGeminiKey(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().geminiKey || "" : "";
}

export function saveGeminiKey(uid, key) {
  return setDoc(doc(db, "users", uid), { geminiKey: key }, { merge: true });
}

export async function loadMastered(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().mastered || [] : [];
}

export function saveMastered(uid, words) {
  return setDoc(doc(db, "users", uid), { mastered: words }, { merge: true });
}

export function addHistory(uid, rec) {
  return addDoc(collection(db, "users", uid, "history"), {
    ...rec,
    createdAt: serverTimestamp(),
  });
}

export async function loadHistory(uid) {
  const q = query(
    collection(db, "users", uid, "history"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
