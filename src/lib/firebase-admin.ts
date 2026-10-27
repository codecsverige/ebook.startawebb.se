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

  const rawServiceAccount =
    process.env.EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_HYRNARA;
  let email = process.env.EBOOK_FIREBASE_CLIENT_EMAIL;
  let key = process.env.EBOOK_FIREBASE_PRIVATE_KEY;

  if (rawServiceAccount) {
    try {
      const parsed = JSON.parse(rawServiceAccount) as {
        project_id?: unknown;
        client_email?: unknown;
        private_key?: unknown;
      };
      if (
        parsed.project_id !== projectId ||
        typeof parsed.client_email !== "string" ||
        typeof parsed.private_key !== "string"
      )
        throw new Error("invalid service account");
      email = parsed.client_email;
      key = parsed.private_key;
    } catch {
      throw new AppError("not_configured", 503);
    }
  }

  if (!email || !key) throw new AppError("not_configured", 503);
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
