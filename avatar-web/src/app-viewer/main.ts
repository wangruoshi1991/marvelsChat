import { createModelScene } from "../viewer/modelScene";

type ViewerConfig = {
  modelUrl: string;
  token: string;
};

type ViewerBridge = {
  load(config: ViewerConfig): Promise<void>;
  resetCamera(): void;
  setActive(active: boolean): void;
};

type AssistGesturePhase = "activate" | "move" | "release" | "cancel";

declare global {
  interface Window {
    MiaoxunAvatarViewer: ViewerBridge;
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#avatar-canvas");
const loading = document.querySelector<HTMLElement>("#viewer-loading");

if (!canvas || !loading) {
  throw new Error("Avatar viewer document is incomplete.");
}

let loadRevision = 0;
let activeRequest: AbortController | null = null;
let scene: ReturnType<typeof createModelScene> | null = null;
let viewerActive = true;

const notify = (message: {
  type: "ready" | "downloading" | "parsing" | "loaded" | "error";
  message?: string;
}) => {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
};

const setLoading = (value: boolean) => {
  loading.hidden = !value;
};

const notifyAssistGesture = (
  phase: AssistGesturePhase,
  event: PointerEvent,
) => {
  window.ReactNativeWebView?.postMessage(JSON.stringify({
    type: "assist-gesture",
    phase,
    x: event.clientX,
    y: event.clientY,
  }));
};

const installAssistGesture = () => {
  const activationDelayMs = 420;
  const movementTolerance = 8;
  let pointerId: number | null = null;
  let origin = { x: 0, y: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const reset = () => {
    clearTimer();
    pointerId = null;
    active = false;
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.pointerType !== "touch") return;
    reset();
    pointerId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      if (pointerId !== event.pointerId) return;
      active = true;
      canvas.setPointerCapture?.(event.pointerId);
      notifyAssistGesture("activate", event);
    }, activationDelayMs);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    if (!active) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > movementTolerance) {
        clearTimer();
      }
      return;
    }
    event.stopImmediatePropagation();
    notifyAssistGesture("move", event);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    clearTimer();
    if (active) {
      notifyAssistGesture("release", event);
    }
    reset();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    clearTimer();
    if (active) {
      notifyAssistGesture("cancel", event);
    }
    reset();
  });
};

const assertModelUrl = (value: string) => {
  const parsed = new URL(value);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("Invalid model URL.");
  }
  return parsed.toString();
};

installAssistGesture();

const load = async ({ modelUrl, token }: ViewerConfig) => {
  if (!String(token || "").trim()) {
    notify({ type: "error", message: "3D形象页面加载失败" });
    return;
  }
  const revision = ++loadRevision;
  activeRequest?.abort();
  activeRequest = new AbortController();
  setLoading(true);
  notify({ type: "downloading" });
  let phase: "downloading" | "parsing" = "downloading";

  try {
    const response = await fetch(assertModelUrl(modelUrl), {
      cache: "force-cache",
      credentials: "omit",
      headers: { Authorization: `Bearer ${String(token || "")}` },
      referrerPolicy: "no-referrer",
      signal: activeRequest.signal,
    });
    if (!response.ok) {
      throw new Error(`MODEL_HTTP_${response.status}`);
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      phase = "parsing";
      notify({ type: "parsing" });
      scene ||= createModelScene(canvas, { backgroundColor: "#F7F8FC" });
      scene.setActive(viewerActive);
      await scene.load(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    if (revision !== loadRevision) return;
    setLoading(false);
    notify({ type: "loaded" });
  } catch (error) {
    if (revision !== loadRevision || (error instanceof DOMException && error.name === "AbortError")) {
      return;
    }
    setLoading(false);
    notify({
      type: "error",
      message: phase === "downloading" ? "3D模型下载失败" : "3D模型解析失败",
    });
  }
};

const resize = () => scene?.resize(canvas.clientWidth, canvas.clientHeight);
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
window.addEventListener("resize", resize);
window.addEventListener("pagehide", () => {
  activeRequest?.abort();
  resizeObserver.disconnect();
  scene?.dispose();
}, { once: true });

window.MiaoxunAvatarViewer = Object.freeze({
  load,
  resetCamera: () => scene?.resetCamera(),
  setActive: (active: boolean) => {
    viewerActive = active;
    scene?.setActive(active);
    if (active) resize();
  },
});
notify({ type: "ready" });
