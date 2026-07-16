import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.MIAOXUN_API_TARGET || "http://127.0.0.1:4390";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/site-assets/" : "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**"],
  },
}));
