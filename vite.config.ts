/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "tests/stories/**/*.test.ts"],
    // Story tests that need the Firestore emulator run with `npm run test:rules`.
    exclude: [...configDefaults.exclude, "tests/stories/**/*.rules.test.ts"],
  },
});
