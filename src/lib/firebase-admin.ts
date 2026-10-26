import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { firebaseWebConfig } from "./firebase-config";
import { AppError } from "./http";
import { FirestoreStudio } from "./firestore-store";

function adminApp() {
  const projectId = firebaseWebConfig.projectId;
  const existing = getApps().find((app) => app.name === "ebook-studio-admin");
  if (existing) return existing;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!email || !key) throw new AppError("not_configured", 503);
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PROJECT_ID !== projectId
  )
    throw new AppError("not_configured", 503);
  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail: email,
        privateKey: key.replace(/\\n/g, "\n"),
      }),
      projectId,
      storageBucket: firebaseWebConfig.storageBucket,
    },
    "ebook-studio-admin",
  );
}

export const adminAuth = () => getAuth(adminApp());
export const studioStore = () => new FirestoreStudio(getFirestore(adminApp()));
export const studioBucket = () => getStorage(adminApp()).bucket();
