import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarApiError } from "../api";
import type { AvatarJob } from "../types";
import { TaskProgress, pollDelayForJob, shouldPollJob } from "./TaskProgress";

const job = (status: AvatarJob["status"]): AvatarJob => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "user-1",
  style: "cartoon",
  status,
  progress: status === "awaiting_style_confirmation" ? 100 : 42,
  photoCount: 1,
  acceptedCostVersion: "2026-07-17",
  estimatedCostFen: 224,
  stylePreviewId: status === "awaiting_style_confirmation" ? "preview-1" : null,
  modelId: status === "succeeded" ? "model-1" : null,
  errorCode: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finishedAt: null,
});

describe("TaskProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a cartoon reference and requires explicit confirm or discard", async () => {
    vi.useRealTimers();
    const confirmStyle = vi.fn().mockResolvedValue(job("queued_3d"));
    const cancelJob = vi.fn().mockResolvedValue(job("cancelled"));
    const onJobChange = vi.fn();
    render(
      <TaskProgress
        job={job("awaiting_style_confirmation")}
        getJob={vi.fn()}
        confirmStyle={confirmStyle}
        cancelJob={cancelJob}
        previewUrl="/preview.jpg"
        onJobChange={onJobChange}
      />,
    );

    expect((screen.getByAltText("卡通形象参考图") as HTMLImageElement).src).toContain("/preview.jpg");
    await userEvent.click(screen.getByRole("button", { name: "确认并生成 3D" }));
    expect(confirmStyle).toHaveBeenCalledTimes(1);
    expect(onJobChange).toHaveBeenCalledWith(expect.objectContaining({ status: "queued_3d" }));
  });

  it("polls active work, reports only a safe request ID, and stops at terminal", async () => {
    const getJob = vi.fn()
      .mockRejectedValueOnce(new AvatarApiError({ status: 503, requestId: "request-safe-1" }))
      .mockResolvedValueOnce(job("failed"));
    render(
      <TaskProgress
        job={job("processing_3d")}
        getJob={getJob}
        confirmStyle={vi.fn()}
        cancelJob={vi.fn()}
        previewUrl=""
        onJobChange={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText(/request-safe-1/)).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(getJob).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it("uses graduated polling and excludes every terminal or confirmation state", () => {
    expect(pollDelayForJob(job("processing_3d"), Date.now())).toBe(3000);
    expect(pollDelayForJob({
      ...job("processing_3d"),
      createdAt: new Date(Date.now() - 31_000).toISOString(),
    }, Date.now())).toBe(8000);
    expect(shouldPollJob(job("processing_3d"))).toBe(true);
    for (const status of [
      "awaiting_style_confirmation",
      "succeeded",
      "failed",
      "cancelled",
      "submission_unknown",
    ] as AvatarJob["status"][]) {
      expect(shouldPollJob(job(status))).toBe(false);
    }
  });
});
