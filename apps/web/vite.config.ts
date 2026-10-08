import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local API from `pnpm --filter @btc/server dev` (apps/server/src/entrypoints/dev.ts).
const API = "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5273,
    proxy: { "/api": API, "/config.json": API },
  },
});
