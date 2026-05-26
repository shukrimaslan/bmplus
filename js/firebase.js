import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// bmvocab-plus Firebase project
// ⚠️ NOTE: Anonymous/guest login should be DISABLED for this project in Firebase Console.
// All users (teachers and students) must sign in with Google or Email/Password.
const firebaseConfig = {
  apiKey: "AIzaSyDbY4eIN_82t2B0vH3Wb9-_sNS98S1eY6s",
  authDomain: "bmvocab-plus.firebaseapp.com",
  projectId: "bmvocab-plus",
  storageBucket: "bmvocab-plus.firebasestorage.app",
  messagingSenderId: "1083300269468",
  appId: "1:1083300269468:web:27268be4197325707a4c59",
  measurementId: "G-C4CJSBN0GQ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
