import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AvatarModel } from "../types";
import { AvatarViewer } from "./AvatarViewer";

const model = (id: string): AvatarModel => ({
  id,
  jobId: `job-${id}`,
  title: `模型 ${id}`,
  status: "active",
  byteSize: 1024,
  thumbnailAvailable: true,
  interactiveAvailable: true,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
});

describe("AvatarViewer", () => {
  it("renders an empty state without creating WebGL", () => {
    const sceneFactory = vi.fn();
    render(
      <AvatarViewer
        model={null}
        modelUrl=""
        thumbnailUrl=""
        onDelete={vi.fn()}
        sceneFactory={sceneFactory}
      />,
    );
    expect(screen.getByText("暂无 3D 模型")).not.toBeNull();
    expect(sceneFactory).not.toHaveBeenCalled();
  });

  it("loads model changes, resets, synchronizes fullscreen, deletes, and disposes", async () => {
    let resolveLoad: (() => void) | undefined;
    const scene = {
      load: vi.fn(() => new Promise<void>((resolve) => { resolveLoad = resolve; })),
      resetCamera: vi.fn(),
      resize: vi.fn(),
      setActive: vi.fn(),
      dispose: vi.fn(),
      getFramingSnapshot: vi.fn(),
    };
    const sceneFactory = vi.fn(() => scene);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = render(
      <AvatarViewer
        model={model("one")}
        modelUrl="/model-one.glb"
        thumbnailUrl="/model-one.jpg"
        onDelete={onDelete}
        sceneFactory={sceneFactory}
      />,
    );

    expect(screen.getByText("正在加载模型")).not.toBeNull();
    await act(async () => resolveLoad?.());
    expect(scene.load).toHaveBeenCalledWith("/model-one.glb");
    await userEvent.click(screen.getByRole("button", { name: "重置视角" }));
    expect(scene.resetCamera).toHaveBeenCalledTimes(1);

    const viewer = screen.getByTestId("avatar-viewer");
    Object.defineProperty(viewer, "requestFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "进入全屏" }));
    expect(viewer.requestFullscreen).toHaveBeenCalledTimes(1);

    rerender(
      <AvatarViewer
        model={model("two")}
        modelUrl="/model-two.glb"
        thumbnailUrl="/model-two.jpg"
        onDelete={onDelete}
        sceneFactory={sceneFactory}
      />,
    );
    expect(scene.load).toHaveBeenCalledWith("/model-two.glb");

    await userEvent.click(screen.getByRole("button", { name: "删除模型" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDelete).toHaveBeenCalledWith("two");

    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });
});
