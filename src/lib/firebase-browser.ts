"use client";
import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { firebaseWebConfig } from "./firebase-config";
export function browserAuth() {
  const existing = getApps().find((app) => app.name === "ebook-studio-browser");
  if (existing) return getAuth(existing);
  const app = initializeApp(firebaseWebConfig, "ebook-studio-browser");
  return initializeAuth(app, {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
}
export const emailStorageKey = "ebook-studio:sign-in-email";
export function authErrorCode(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  )
    return "cancelled";
  if (code === "auth/popup-blocked") return "popup_blocked";
  if (code === "auth/too-many-requests" || code === "auth/quota-exceeded")
    return "rate_limit";
  if (
    code === "auth/unauthorized-domain" ||
    code === "auth/operation-not-allowed" ||
    code === "auth/invalid-api-key"
  )
    return "not_configured";
  if (
    code === "auth/invalid-action-code" ||
    code === "auth/expired-action-code" ||
    code === "auth/invalid-email"
  )
    return "invalid_login_link";
  return error instanceof Error && !code ? error.message : "service_error";
}
