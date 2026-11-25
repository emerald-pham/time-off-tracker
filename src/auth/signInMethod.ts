/**
 * How to run Google sign-in on this page.
 *
 * Safari (and other browsers that partition third-party storage) only
 * completes a redirect sign-in when the Firebase auth handler
 * (`/__/auth/handler`) is on the same domain as the app. Firebase Hosting
 * serves that handler on every hosted domain, so with `authDomain` set to the
 * domain that serves the app, redirect works in iPhone and iPad Safari and in
 * a home-screen web app, where popups are unreliable.
 *
 * Anywhere else (local dev, or the app opened on another of its domains) a
 * redirect can't read its result back, so a popup is used instead.
 */
export type SignInMethod = "redirect" | "popup";

export function signInMethod(pageHostname: string, authDomain: string): SignInMethod {
  const authHost = authDomain.toLowerCase().replace(/:\d+$/, "");
  return pageHostname.toLowerCase() === authHost ? "redirect" : "popup";
}
