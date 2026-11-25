// Run by `npm run deploy` before it builds: refuses to go on if
// VITE_FIREBASE_USE_EMULATORS is set anywhere a production build would read
// it (the env files Vite loads for production, or the shell). The app ignores
// the flag outside `npm run dev` anyway; this keeps it out of a deploy too.
import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "VITE_");
const flag = env.VITE_FIREBASE_USE_EMULATORS;

if (flag !== undefined && flag !== "") {
  console.error(
    `VITE_FIREBASE_USE_EMULATORS is set (to "${flag}"), in .env, .env.local, .env.production, ` +
      ".env.production.local or the shell. Remove it before deploying: it's for local emulator testing only.",
  );
  process.exit(1);
}
