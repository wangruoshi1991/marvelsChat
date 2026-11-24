import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarApiError } from "../api";
import type { AvatarFeature, AvatarJob, AvatarReferences } from "../types";
import { TaskProgress, pollDelayForJob, shouldPollJob } from "./TaskProgress";

const job = (status: AvatarJob["status"]): AvatarJob => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "user-1",
  style: "realistic",
  qualityPreset: "ultra",
  generationMode: "face_first_multiview",
  referenceSetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status,
  progress: status.includes("awaiting") ? 100 : 42,
  photoCount: 1,
  acceptedCostVersion: "2026-07-21",
  estimatedCostFen: 420,
  modelId: status === "succeeded" ? "model-1" : null,
  errorCode: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finishedAt: null,
});

const feature: AvatarFeature = {
  enabled: true,
  generationAvailable: true,
  dailyLimit: 3,
  retentionDays: 7,
  costVersion: "2026-07-21",
  referenceGenerationEstimatedCostFen: 200,
  defaultQualityPreset: "ultra",
  qualityPresets: [
    { id: "standard", label: "标准", description: "高清纹理", estimatedCostFen: 280 },
    { id: "ultra", label: "精细", description: "高精度几何与高清纹理", estimatedCostFen: 420 },
  ],
};

const references: AvatarReferences = {
  referenceSet: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "awaiting_confirmation",
    expectedImageCount: 4,
    actualImageCount: 4,
    usageImageCount: 4,
    costVersion: "2026-07-21",
    estimatedCostFen: 200,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  images: (["front", "left", "back", "right"] as const).map((view, sequenceIndex) => ({
    id: `image-${view}`,
    referenceSetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    view,
    sequenceIndex,
    mimeType: "image/jpeg",
    byteSize: 1024,
    width: 1024,
    height: 1536,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
};

const baseProps = () => ({
  feature,
  getJob: vi.fn(),
  getReferences: vi.fn().mockResolvedValue(references),
  confirmReferences: vi.fn(),
  rejectReferences: vi.fn(),
  referenceImageUrl: (jobId: string, view: string) => `/jobs/${jobId}/references/${view}`,
  cancelJob: vi.fn(),
  previewUrl: "",
  resultPreviewUrl: "",
  onJobChange: vi.fn(),
});

describe("TaskProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows four references and confirms the selected paid quality explicitly", async () => {
    vi.useRealTimers();
    const props = baseProps();
    props.confirmReferences.mockResolvedValue({
      job: job("queued_3d"),
      referenceSet: { ...references.referenceSet, status: "accepted" },
    });
    render(<TaskProgress job={job("awaiting_reference_confirmation")} {...props} />);

    expect(await screen.findByAltText("正面四视图")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /查看/ })).toHaveLength(4);
    expect(screen.getByText("预计 ¥4.20")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "标准" }));
    expect(screen.getByText("预计 ¥2.80")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "确认四视图并生成 3D" }));

    await waitFor(() => expect(props.confirmReferences).toHaveBeenCalledWith(
      job("awaiting_reference_confirmation").id,
      {
        referenceSetId: references.referenceSet.id,
        qualityPreset: "standard",
        acceptedCostVersion: "2026-07-21",
      },
    ));
    expect(props.onJobChange).toHaveBeenCalledWith(expect.objectContaining({ status: "queued_3d" }));
  });

  it("recovers an unavailable reference set with a read-only retry", async () => {
    vi.useRealTimers();
    const props = baseProps();
    props.getReferences.mockRejectedValueOnce(new AvatarApiError({ status: 503, requestId: "safe-references" }));
    render(<TaskProgress job={job("awaiting_reference_confirmation")} {...props} />);

    expect((await screen.findByRole("alert")).textContent).toContain("暂时无法读取四视图");
    expect(screen.getByText(/safe-references/)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "重试读取四视图" }));
    expect(await screen.findByAltText("正面四视图")).not.toBeNull();
    expect(props.getReferences).toHaveBeenCalledTimes(2);
    expect(props.confirmReferences).not.toHaveBeenCalled();
  });

  it("reports a failed cancellation and ignores a pending refresh after a successful retry", async () => {
    vi.useRealTimers();
    const props = baseProps();
    let finishRefresh: (job: AvatarJob) => void = () => {};
    props.getJob.mockReturnValue(new Promise<AvatarJob>(resolve => { finishRefresh = resolve; }));
    props.cancelJob
      .mockRejectedValueOnce(new AvatarApiError({ status: 503, requestId: "safe-cancel" }))
      .mockResolvedValueOnce(job("cancelled"));
    render(<TaskProgress job={job("queued_3d")} {...props} />);

    await userEvent.click(screen.getByRole("button", { name: "取消任务" }));
    expect((await screen.findByRole("alert")).textContent).toContain("取消未完成");
    expect(screen.getByText(/safe-cancel/)).not.toBeNull();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(props.getJob).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "取消任务" }));
    expect(await screen.findByRole("heading", { name: "本次生成已放弃" })).not.toBeNull();
    await act(async () => finishRefresh(job("queued_3d")));
    expect(props.onJobChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "本次生成已放弃" })).not.toBeNull();
  });

  it("discards a reference read when a different task replaces the active task", async () => {
    vi.useRealTimers();
    const props = baseProps();
    let finishRead: (value: AvatarReferences) => void = () => {};
    props.getReferences.mockReturnValue(new Promise<AvatarReferences>(resolve => { finishRead = resolve; }));
    const { rerender } = render(<TaskProgress job={job("awaiting_reference_confirmation")} {...props} />);
    await waitFor(() => expect(props.getReferences).toHaveBeenCalledTimes(1));
    rerender(<TaskProgress job={{ ...job("queued_3d"), id: "new-job" }} {...props} />);
    await act(async () => finishRead(references));
    expect(screen.getByRole("heading", { name: "正在准备 3D 生成" })).not.toBeNull();
    expect(screen.queryByAltText("正面四视图")).toBeNull();
    expect(props.onJobChange).not.toHaveBeenCalled();
  });

  it("polls active work, reports only a safe request ID, and stops at terminal", async () => {
    const props = baseProps();
    props.getJob
      .mockRejectedValueOnce(new AvatarApiError({ status: 503, requestId: "request-safe-1" }))
      .mockResolvedValueOnce(job("failed"));
    render(<TaskProgress job={job("processing_3d")} {...props} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText(/request-safe-1/)).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(props.getJob).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(props.getJob).toHaveBeenCalledTimes(2);
  });

  it("uses graduated polling and excludes every terminal or confirmation state", () => {
    expect(pollDelayForJob(job("processing_3d"), Date.now())).toBe(3000);
    expect(pollDelayForJob({
      ...job("processing_3d"),
      createdAt: new Date(Date.now() - 31_000).toISOString(),
    }, Date.now())).toBe(8000);
    expect(shouldPollJob(job("processing_references"))).toBe(true);
    for (const status of [
      "awaiting_reference_confirmation",
      "succeeded",
      "failed",
      "quality_failed",
      "cancelled",
      "submission_unknown",
    ] as AvatarJob["status"][]) {
      expect(shouldPollJob(job(status))).toBe(false);
    }
  });

  it("shows the real generated preview while the rotatable model is prepared", () => {
    const props = baseProps();
    render(
      <TaskProgress
        job={{ ...job("persisting"), modelId: "model-1", progress: 95 }}
        {...props}
        resultPreviewUrl="/models/model-1/thumbnail"
      />,
    );

    expect(screen.getByRole("heading", { name: "预览已完成" })).not.toBeNull();
    expect(screen.getByText("正在准备可旋转模型")).not.toBeNull();
    expect((screen.getByAltText("3D 形象生成预览") as HTMLImageElement).src).toContain(
      "/models/model-1/thumbnail",
    );
  });
});
