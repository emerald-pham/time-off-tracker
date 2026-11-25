import { defineConfig } from "vitest/config";

/** Emulator tests only. Run through `npm run test:rules`. */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
