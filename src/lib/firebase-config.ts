// Firebase web configuration is public. These values identify the existing
// HyrNära project; no service-account credential belongs in this file.
// Dedicated EBOOK variable names ensure unrelated Vercel variables from the
// owner's other projects cannot silently point this app at another database.
const appId = process.env.NEXT_PUBLIC_EBOOK_FIREBASE_APP_ID;

export const firebaseWebConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_EBOOK_FIREBASE_API_KEY ||
    "AIzaSyDo3vScBumJW_ADGGjCA2niHhAfB4wMMvc",
  authDomain:
    process.env.NEXT_PUBLIC_EBOOK_FIREBASE_AUTH_DOMAIN ||
    "hyrnara.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_EBOOK_FIREBASE_PROJECT_ID || "hyrnara",
  storageBucket:
    process.env.NEXT_PUBLIC_EBOOK_FIREBASE_STORAGE_BUCKET ||
    "hyrnara.firebasestorage.app",
  ...(appId ? { appId } : {}),
};

// Stable across domain changes. Every application record and private object
// lives below this namespace, never in HyrNära's users/listings collections.
export const STUDIO_PATH = "ebookStudio/ebook-v1";
