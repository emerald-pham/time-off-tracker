// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { AccountSection } from "./AccountSection";
import { render, text } from "./testDom";
import type { Rendered } from "./testDom";

let mounted: Rendered | null = null;
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
});

const noop = () => {};
const signedOut = (canSignIn: boolean) => (
  <AccountSection
    email={null}
    canSignIn={canSignIn}
    signedIn={false}
    busy={false}
    error={null}
    unsyncedAtSignOut={false}
    onSignIn={noop}
    onSignOut={noop}
    onDiscardAndSignOut={noop}
    onDelete={noop}
  />
);

describe("signed out, the Account section (finding 21)", () => {
  it("warns that Safari can delete this browser's copy, and suggests signing in or the Home Screen", async () => {
    mounted = await render(signedOut(true));
    const says = text(mounted.el);
    expect(says).toContain("Safari can delete it after 7 days without a visit");
    expect(says).toContain("Sign in with Google to keep it in your account");
    expect(says).toContain("add the app to your Home Screen");
  });

  it("suggests the Home Screen alone when this build can't sign in", async () => {
    mounted = await render(signedOut(false));
    const says = text(mounted.el);
    expect(says).toContain("add the app to your Home Screen");
    expect(says).not.toContain("Sign in with Google");
  });
});
