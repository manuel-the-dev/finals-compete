import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one test database, so run files sequentially.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
