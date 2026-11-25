import { describe, expect, it } from "vitest";
import { firebaseConfigFromEnv, useEmulatorsFromEnv } from "./config";

describe("useEmulatorsFromEnv", () => {
  const dev = { DEV: true, VITE_FIREBASE_USE_EMULATORS: "true", VITE_FIREBASE_PROJECT_ID: "demo-time-off-tracker" };

  it("uses the emulators in a dev server on a demo- project when asked", () => {
    expect(useEmulatorsFromEnv(dev)).toBe(true);
  });

  it("never in a production build, even when the flag got baked in", () => {
    expect(useEmulatorsFromEnv({ ...dev, DEV: false })).toBe(false);
  });

  it("never for a project that isn't a demo- project", () => {
    expect(useEmulatorsFromEnv({ ...dev, VITE_FIREBASE_PROJECT_ID: "time-off-tracker-made-up" })).toBe(false);
  });

  it("only when the flag is exactly true", () => {
    expect(useEmulatorsFromEnv({ ...dev, VITE_FIREBASE_USE_EMULATORS: "yes" })).toBe(false);
    expect(useEmulatorsFromEnv({ DEV: true, VITE_FIREBASE_PROJECT_ID: "demo-time-off-tracker" })).toBe(false);
  });
});

const full = {
  VITE_FIREBASE_API_KEY: "demo-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-time-off-tracker.web.app",
  VITE_FIREBASE_PROJECT_ID: "demo-time-off-tracker",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("firebaseConfigFromEnv", () => {
  it("builds the web config from VITE_FIREBASE_* env vars", () => {
    expect(firebaseConfigFromEnv(full)).toEqual({
      apiKey: "demo-key",
      authDomain: "demo-time-off-tracker.web.app",
      projectId: "demo-time-off-tracker",
      appId: "1:123:web:abc",
    });
  });

  it("is null with no config, so the app runs signed-out only", () => {
    expect(firebaseConfigFromEnv({})).toBeNull();
  });

  it("is null when a required value is missing or blank", () => {
    expect(firebaseConfigFromEnv({ ...full, VITE_FIREBASE_AUTH_DOMAIN: " " })).toBeNull();
    const { VITE_FIREBASE_APP_ID: _, ...noAppId } = full;
    expect(firebaseConfigFromEnv(noAppId)).toBeNull();
  });
});
