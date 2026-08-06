import { beforeEach, describe, expect, it, vi } from "vitest";

const scene = vi.hoisted(() => ({
  dispose: vi.fn(),
  load: vi.fn(async () => undefined),
  resetCamera: vi.fn(),
  resize: vi.fn(),
}));
const sceneFactory = vi.hoisted(() => vi.fn(() => scene));

vi.mock("../viewer/modelScene", () => ({
  createModelScene: sceneFactory,
}));

class ResizeObserverMock {
  disconnect = vi.fn();
  observe = vi.fn();
}

describe("App avatar viewer bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = `
      <canvas id="avatar-canvas"></canvas>
      <div id="viewer-loading"></div>
    `;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("waits for App configuration and reports each model load stage", async () => {
    const postMessage = vi.fn();
    const fetchModel = vi.fn(async () => ({
      blob: async () => new Blob(["glb"]),
      ok: true,
    }));
    const createObjectURL = vi.fn(() => "blob:model");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("fetch", fetchModel);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    window.ReactNativeWebView = { postMessage };

    await import("./main");

    expect(sceneFactory).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: "ready" }),
    );
    expect(fetchModel).not.toHaveBeenCalled();

    await window.MiaoxunAvatarViewer.load({
      modelUrl: "https://api.example.com/api/avatar-3d/app/models/model-1/file",
      token: "private-token",
    });

    expect(sceneFactory).toHaveBeenCalledTimes(1);
    expect(fetchModel).toHaveBeenCalledWith(
      "https://api.example.com/api/avatar-3d/app/models/model-1/file",
      expect.objectContaining({
        cache: "force-cache",
        headers: { Authorization: "Bearer private-token" },
      }),
    );
    expect(scene.load).toHaveBeenCalledWith("blob:model");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:model");
    expect(postMessage.mock.calls.map(([message]) => JSON.parse(message).type))
      .toEqual(["ready", "downloading", "parsing", "loaded"]);
  });
});
