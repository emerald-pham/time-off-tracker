import { configDefaults, defineConfig } from "vitest/config";

/** Firestore emulator tests only. Run through `npm run test:rules`. */
export default defineConfig({
  test: {
    // tests/hosting needs the Hosting emulator and a build (`npm run test:hosting`),
    // and the other story tests run with `npm test`.
    include: ["tests/*.test.ts", "tests/stories/**/*.rules.test.ts"],
    exclude: [...configDefaults.exclude],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
