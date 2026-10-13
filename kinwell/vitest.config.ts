import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "."), "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: { LOCAL_STORAGE_DIR: ".data/test-storage", NODE_ENV: "test", AI_PROVIDER: "mock", EMBEDDING_PROVIDER: "mock" },
  },
});
