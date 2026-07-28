import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AvatarApi } from "../api";
import type { AvatarBootstrap, AvatarModel } from "../types";
import { EmbeddedAvatarViewer } from "./EmbeddedAvatarViewer";

vi.mock("./AvatarViewer", () => ({
  AvatarViewer: ({ model }: { model: AvatarModel }) => (
    <div data-testid="embedded-avatar-viewer">{model.id}</div>
  ),
}));

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

const bootstrap = {
  models: [model("first"), model("requested")],
} as AvatarBootstrap;

const api = {
  modelFileUrl: vi.fn((modelId: string) => `/models/${modelId}.glb`),
  modelThumbnailUrl: vi.fn((modelId: string) => `/models/${modelId}.jpg`),
} as unknown as AvatarApi;

describe("EmbeddedAvatarViewer", () => {
  it("renders only the explicitly requested model", async () => {
    render(
      <EmbeddedAvatarViewer
        api={api}
        bootstrap={bootstrap}
        modelId="requested"
      />,
    );

    expect((await screen.findByTestId("embedded-avatar-viewer")).textContent)
      .toBe("requested");
    expect(api.modelFileUrl).toHaveBeenCalledWith("requested");
    expect(api.modelThumbnailUrl).toHaveBeenCalledWith("requested");
  });

  it("does not fall back to another model", () => {
    render(
      <EmbeddedAvatarViewer
        api={api}
        bootstrap={bootstrap}
        modelId="missing"
      />,
    );

    expect(screen.getByText("暂无 3D 形象")).not.toBeNull();
    expect(screen.queryByTestId("embedded-avatar-viewer")).toBeNull();
  });
});
