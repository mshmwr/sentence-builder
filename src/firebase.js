/* ------------------------------------------------------------------ *
 *  Firebase glue — auth (Google) + per-user Firestore storage.
 *
 *  Data model:
 *    users/{uid}            { geminiKey, mastered, streak, longestStreak,
 *                              lastPracticeDate, practiceDays }
 *    users/{uid}/history/*  { zh, en, stars, hints, misses, puzzle, memo, createdAt }
 *
 *  practiceDays is a { "YYYY-MM-DD": count } map — one entry per local day
 *  the account ever completed a sentence, incremented on every completion.
 *  It backs the 歷史 screen's calendar and, unlike the capped 50-record
 *  history query, never ages out.
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
  increment,
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
export function localDateStr(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export async function loadStreak(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : {};
  return { streak: data.streak || 0, longestStreak: data.longestStreak || 0 };
}

export async function loadPracticeDays(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().practiceDays || {} : {};
}

// call once per correct completion. The streak+lastPracticeDate write is a
// no-op past the first completion of a local day (streak only counts days),
// but practiceDays[today] still increments every time, since that count
// feeds the 歷史 calendar's per-day intensity.
export async function recordPracticeDay(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const today = localDateStr();
  let streak = data.streak || 0;
  let longestStreak = data.longestStreak || 0;
  if (data.lastPracticeDate !== today) {
    const yesterday = localDateStr(new Date(Date.now() - 86400000));
    streak = data.lastPracticeDate === yesterday ? streak + 1 : 1;
    longestStreak = Math.max(streak, longestStreak);
  }
  const todayCount = (data.practiceDays?.[today] || 0) + 1;
  await setDoc(
    ref,
    { streak, longestStreak, lastPracticeDate: today, practiceDays: { [today]: increment(1) } },
    { merge: true }
  );
  return { streak, longestStreak, today, todayCount };
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
