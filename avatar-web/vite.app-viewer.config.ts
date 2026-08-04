import { defineConfig, type Plugin } from "vite";

const outputDirectory =
  process.env.MIAOXUN_APP_VIEWER_OUT_DIR ||
  "../MiaoxunRN/src/assets/avatar-viewer";

const htmlDocument = (script: string) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <meta name="color-scheme" content="light" />
    <meta name="referrer" content="no-referrer" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src http: https: blob:" />
    <style>
      * { box-sizing: border-box; }
      html, body, #viewer-stage, #avatar-canvas {
        display: block;
        height: 100%;
        margin: 0;
        overflow: hidden;
        padding: 0;
        width: 100%;
      }
      html, body, #viewer-stage { background: #F7F8FC; }
      #avatar-canvas { touch-action: none; }
      #viewer-loading {
        align-items: center;
        background: #F7F8FC;
        display: flex;
        inset: 0;
        justify-content: center;
        position: fixed;
      }
      #viewer-loading[hidden] { display: none; }
      #viewer-loading::after {
        animation: viewer-spin 0.8s linear infinite;
        border: 2px solid #DBE2FF;
        border-radius: 50%;
        border-top-color: #2012D9;
        content: "";
        height: 24px;
        width: 24px;
      }
      @keyframes viewer-spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main id="viewer-stage">
      <canvas id="avatar-canvas" aria-label="3D形象预览"></canvas>
      <div id="viewer-loading" aria-hidden="true"></div>
    </main>
    <script>${script
      .replace(/[ \t]+$/gm, "")
      .replace(/<\/script/gi, "<\\/script")}</script>
  </body>
</html>
`;

const inlineViewerPlugin = (): Plugin => ({
  name: "miaoxun-inline-app-viewer",
  generateBundle(_options, bundle) {
    const entry = Object.values(bundle).find(
      (item) => item.type === "chunk" && item.isEntry,
    );
    if (!entry || entry.type !== "chunk") {
      throw new Error("App avatar viewer entry bundle was not generated.");
    }
    delete bundle[entry.fileName];
    this.emitFile({
      type: "asset",
      fileName: "avatar-viewer.html",
      source: htmlDocument(entry.code),
    });
  },
});

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/app-viewer/main.ts",
      fileName: "avatar-viewer",
      formats: ["iife"],
      name: "MiaoxunAvatarViewerBundle",
    },
    outDir: outputDirectory,
    sourcemap: false,
    target: ["safari15", "chrome100"],
  },
  plugins: [inlineViewerPlugin()],
});
