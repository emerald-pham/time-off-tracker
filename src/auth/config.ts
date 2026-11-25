/** The Firebase web config fields the tracker needs (public by design). */
export interface FirebaseWebConfig {
  apiKey: string;
  /**
   * Must be the domain that serves the app (for example `<project>.web.app`),
   * not `<project>.firebaseapp.com`, so redirect sign-in keeps working in
   * Safari, which partitions third-party storage. See README "Accounts".
   */
  authDomain: string;
  projectId: string;
  appId: string;
}

const KEYS: Record<keyof FirebaseWebConfig, string> = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  appId: "VITE_FIREBASE_APP_ID",
};

/**
 * Whether to point auth and Firestore at the local emulators. Only a dev
 * server (`npm run dev`) on a `demo-` project ever does, so a stray
 * `VITE_FIREBASE_USE_EMULATORS` can't make a deployed app talk to localhost.
 */
export function useEmulatorsFromEnv(env: {
  DEV?: boolean;
  VITE_FIREBASE_USE_EMULATORS?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
}): boolean {
  return (
    env.DEV === true &&
    env.VITE_FIREBASE_USE_EMULATORS === "true" &&
    (env.VITE_FIREBASE_PROJECT_ID?.trim().startsWith("demo-") ?? false)
  );
}

/**
 * Reads the config from `VITE_FIREBASE_*` env vars. Null when any is missing,
 * in which case the app runs signed-out only and hides the sign-in button.
 */
export function firebaseConfigFromEnv(
  env: Record<string, string | undefined>,
): FirebaseWebConfig | null {
  const config: Partial<FirebaseWebConfig> = {};
  for (const [field, key] of Object.entries(KEYS) as [keyof FirebaseWebConfig, string][]) {
    const value = env[key]?.trim();
    if (!value) return null;
    config[field] = value;
  }
  return config as FirebaseWebConfig;
}
