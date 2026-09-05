/* ------------------------------------------------------------------ *
 *  Firebase glue — auth (Google) + per-user Firestore storage.
 *
 *  Data model:
 *    users/{uid}            { geminiKey, mastered, streak, longestStreak, lastPracticeDate }
 *    users/{uid}/history/*  { zh, en, stars, hints, misses, puzzle, memo, createdAt }
 * ------------------------------------------------------------------ */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
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
  // Same-origin as the app: /__/auth/** is reverse-proxied to
  // pinju-web.firebaseapp.com via vercel.json. Cross-domain authDomain makes
  // Chrome treat the redirect credential as third-party storage and drop the
  // session; serving the auth handler same-origin fixes popup + redirect.
  authDomain: "sentence-builder-steel.vercel.app",
  projectId: "pinju-web",
  storageBucket: "pinju-web.firebasestorage.app",
  messagingSenderId: "888028787625",
  appId: "1:888028787625:web:c648a28222354e5f1d4ab8",
});

const auth = getAuth(app);
const db = getFirestore(app);

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Popup killed by browser (blocker / mobile Safari / in-app browser) →
    // fall back to full-page redirect. onAuthStateChanged picks up the
    // session on reload, so no extra wiring needed.
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/cancelled-popup-request" ||
      err.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, provider);
    } else {
      throw err; // popup-closed-by-user etc. → surface to caller
    }
  }
};
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

// YYYY-MM-DD in the browser's own timezone — a "day" for streak purposes is
// the user's local day, not UTC, so someone practicing at 11pm and again at
// 1am the same local night shouldn't see their streak jump twice.
function localDateStr(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export async function loadStreak(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : {};
  return { streak: data.streak || 0, longestStreak: data.longestStreak || 0 };
}

// call once per correct completion. A second completion the same local day
// is a no-op (no write) — the streak only counts days, not attempts.
export async function recordPracticeDay(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const today = localDateStr();
  if (data.lastPracticeDate === today) {
    return { streak: data.streak || 1, longestStreak: data.longestStreak || 1 };
  }
  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  const streak = data.lastPracticeDate === yesterday ? (data.streak || 0) + 1 : 1;
  const longestStreak = Math.max(streak, data.longestStreak || 0);
  await setDoc(ref, { streak, longestStreak, lastPracticeDate: today }, { merge: true });
  return { streak, longestStreak };
}

export function addHistory(uid, rec) {
  return addDoc(collection(db, "users", uid, "history"), {
    ...rec,
    createdAt: serverTimestamp(),
  });
}

export function saveMemo(uid, docId, memo) {
  return setDoc(doc(db, "users", uid, "history", docId), { memo }, { merge: true });
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
