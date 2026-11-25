import { defineConfig } from "vitest/config";

/** Hosting emulator tests only. Run through `npm run test:hosting`, which builds first. */
export default defineConfig({
  test: {
    include: ["tests/hosting/**/*.test.ts"],
    testTimeout: 15000,
  },
});
