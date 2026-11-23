"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export const FIRESTORE_DATABASE_ID =
  process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ||
  "ai-studio-android-vocofloh-b15877a9-aed4-44f5-88cd-134d702cad3a";

export interface WebFirebaseStatus {
  firebaseConfigured: boolean;
  appCheckConfigured: boolean;
  appCheckMode: "recaptcha_enterprise" | "debug_local_only" | "unconfigured";
  missingItems: string[];
}

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };
}

export function getWebFirebaseStatus(): WebFirebaseStatus {
  const cfg = getFirebaseConfig();
  const missing: string[] = [];
  if (!cfg.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!cfg.authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!cfg.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!cfg.appId) missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");

  const siteKey = (process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || "").trim();
  const isLocalDev = process.env.NODE_ENV !== "production";
  const debugToken = isLocalDev
    ? (process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN || "").trim()
    : "";

  let appCheckMode: WebFirebaseStatus["appCheckMode"] = "unconfigured";
  if (siteKey) {
    appCheckMode = "recaptcha_enterprise";
  } else if (debugToken) {
    appCheckMode = "debug_local_only";
  } else {
    missing.push("NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY");
  }

  return {
    firebaseConfigured: Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId),
    appCheckConfigured: appCheckMode !== "unconfigured",
    appCheckMode,
    missingItems: missing,
  };
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedAppCheck: AppCheck | null = null;
let appCheckInitAttempted = false;

export function getFirebaseClientApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  const cfg = getFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(cfg);
  }
  return cachedApp;
}

export function getFirebaseClientAuth(): Auth | null {
  const app = getFirebaseClientApp();
  if (!app) return null;
  if (!cachedAuth) {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

export function getNamedFirestore(): Firestore | null {
  const app = getFirebaseClientApp();
  if (!app) return null;
  if (!cachedDb) {
    cachedDb = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
  return cachedDb;
}

export function getGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export function ensureWebAppCheck(): AppCheck | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseClientApp();
  if (!app) return null;
  if (cachedAppCheck) return cachedAppCheck;
  if (appCheckInitAttempted) return null;
  appCheckInitAttempted = true;

  const siteKey = (process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || "").trim();
  const isLocalDev = process.env.NODE_ENV !== "production";
  const debugToken = isLocalDev
    ? (process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN || "").trim()
    : "";

  try {
    if (debugToken && isLocalDev) {
      (window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        debugToken === "true" ? true : debugToken;
    }

    if (siteKey) {
      cachedAppCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      return cachedAppCheck;
    }

    if (debugToken && isLocalDev) {
      // Debug provider still needs a site key parameter in Web SDK; warn clearly when site key is missing
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getWebAppCheckToken(): Promise<string | null> {
  const appCheck = ensureWebAppCheck() || cachedAppCheck;
  if (!appCheck) return null;
  try {
    const res = await getToken(appCheck, false);
    return res.token || null;
  } catch {
    return null;
  }
}
