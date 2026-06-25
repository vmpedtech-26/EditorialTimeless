// Timeless Editorial — Firebase Configuration
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Replace the following with your app's Firebase project configuration
// You can find this in your Firebase Console -> Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyBTKzPxyZCBW9GjAmUOjLMte_nBcLjvrJY",
  authDomain: "timeless-5d27d.firebaseapp.com",
  projectId: "timeless-5d27d",
  storageBucket: "timeless-5d27d.firebasestorage.app",
  messagingSenderId: "915230214709",
  appId: "1:915230214709:web:345d0cd7267caec3553f7c",
  measurementId: "G-T6HMS83GF5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Habilitar persistencia de datos offline
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("  ⚠ [Firestore Offline] No se pudo activar la persistencia: múltiples pestañas abiertas.");
  } else if (err.code === 'unimplemented') {
    console.warn("  ⚠ [Firestore Offline] El navegador no soporta persistencia IndexedDB.");
  }
});

const googleProvider = new GoogleAuthProvider();

export { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
};
