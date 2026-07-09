import { defineConfig } from "vite";

const apiTarget = process.env.MIAOXUN_ADMIN_API_TARGET || "http://127.0.0.1:4390";

export default defineConfig({
  root: ".",
  base: "/admin/",
  define: {
    __MIAOXUN_ADMIN_API_TARGET__: JSON.stringify(apiTarget)
  },
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: "index.html"
      }
    }
  }
});
