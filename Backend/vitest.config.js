import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.js"],
    globals: false,
    testTimeout: 15000,
    // Each test file gets its own isolated module registry
    isolate: true,
    pool: "forks",
  },
});
