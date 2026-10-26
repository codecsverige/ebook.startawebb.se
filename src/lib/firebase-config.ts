// Firebase web configuration is public. These values identify the existing
// MashrooHub project; no service-account credential belongs in this file.
export const firebaseWebConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDZXVFbumDgWUB0kqJaguTQAPlElHJZJOU",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "mashroohub-aa66a.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mashroohub-aa66a",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "mashroohub-aa66a.firebasestorage.app",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:263895953142:web:92a7960099a4e690a446d7",
};

// Stable across domain changes. Every application record and private object
// lives below this namespace, never in MashrooHub's users/companies collections.
export const STUDIO_PATH = "ebookStudio/ebook-v1";
