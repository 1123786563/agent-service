import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Override environment for tsx test files (React components)
    environmentMatchGlobs: [
      ["tests/**/*.test.tsx", "jsdom"],
    ],
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@views": new URL("./packages/views/src", import.meta.url).pathname
    }
  }
});
