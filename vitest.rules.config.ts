import { configDefaults, defineConfig } from "vitest/config";

/** Firestore emulator tests only. Run through `npm run test:rules`. */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Those need the Hosting emulator and a build: `npm run test:hosting`.
    exclude: [...configDefaults.exclude, "tests/hosting/**"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
