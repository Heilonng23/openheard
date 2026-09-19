import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only: plain node, no TanStack Start plugin, no browser.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
