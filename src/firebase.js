/* ------------------------------------------------------------------ *
 *  Firebase glue — auth (Google) + per-user Firestore storage.
 *
 *  Data model:
 *    users/{uid}            { geminiKey, mastered }
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
