import { describe, expect, it } from "vitest";
import { signInMethod } from "./signInMethod";

describe("signInMethod", () => {
  it("redirects when the app is served from the authDomain (Safari, home-screen icon)", () => {
    expect(signInMethod("demo-time-off-tracker.web.app", "demo-time-off-tracker.web.app")).toBe(
      "redirect",
    );
  });

  it("ignores case and a port on the authDomain", () => {
    expect(signInMethod("tracker.example.test", "Tracker.Example.test:443")).toBe("redirect");
  });

  it("uses a popup anywhere else, such as localhost or the firebaseapp.com host", () => {
    expect(signInMethod("localhost", "demo-time-off-tracker.web.app")).toBe("popup");
    expect(
      signInMethod("demo-time-off-tracker.firebaseapp.com", "demo-time-off-tracker.web.app"),
    ).toBe("popup");
  });
});
