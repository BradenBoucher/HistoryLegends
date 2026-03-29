import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAkdI4BkLczLah7hG77UzYqAEIUdPij0ug",
  authDomain: "historylegends-80b84.firebaseapp.com",
  projectId: "historylegends-80b84",
  storageBucket: "historylegends-80b84.firebasestorage.app",
  messagingSenderId: "947479478389",
  appId: "1:947479478389:web:4c529ae2dd822d5948383c",
  measurementId: "G-ESXXP3PFGQ",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
