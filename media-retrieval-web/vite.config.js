import { defineConfig } from "vite";
import path from "node:path";

const apiTarget = process.env.MIAOXUN_MEDIA_RETRIEVAL_API_TARGET || "http://127.0.0.1:4390";

export default defineConfig({
  root: ".",
  base: "/media-retrieval-assets/",
  define: {
    __MIAOXUN_MEDIA_RETRIEVAL_API_TARGET__: JSON.stringify(apiTarget),
  },
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
    fs: {
      allow: [path.resolve(".", "..")],
    },
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
