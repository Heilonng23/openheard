import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const local = process.env.OPENHEARD_LOCAL === "1";

export default defineConfig({
  server: {
    port: 3001,
  },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      // resolved by workerd at runtime; node builds cannot bundle it
      external: local ? [] : ["cloudflare:workers"],
    },
    rolldownOptions: {
      external: local ? [] : ["cloudflare:workers"],
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    alias: local
      ? { "cloudflare:workers": fileURLToPath(new URL("../../packages/env/src/local.ts", import.meta.url)) }
      : {},
  },
  ssr: {
    // native sqlite driver stays external in local mode
    external: ["@libsql/client", "libsql"],
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact({ compiler: true })],
});
