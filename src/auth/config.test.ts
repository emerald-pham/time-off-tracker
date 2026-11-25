import { describe, expect, it } from "vitest";
import { firebaseConfigFromEnv } from "./config";

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
