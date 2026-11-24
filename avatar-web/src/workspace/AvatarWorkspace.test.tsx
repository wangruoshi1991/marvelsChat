import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AvatarApiError, type AvatarApi } from "../api";
import type { AvatarBootstrap, AvatarJob } from "../types";
import type { AvatarCreateRequest } from "./AvatarComposer";
import { AvatarWorkspace } from "./AvatarWorkspace";
import { readAvatarSubmission, saveAvatarSubmission } from "./avatarSubmission";

afterEach(() => sessionStorage.clear());

let onJobChange: (job: AvatarJob) => void;
let submit: (request: AvatarCreateRequest) => Promise<void>;
vi.mock("./AvatarComposer", () => ({
  AvatarComposer: (props: {onCreate: typeof submit}) => { submit = props.onCreate; return null; },
}));
vi.mock("./TaskProgress", () => ({ TaskProgress: (props: {job: AvatarJob, onJobChange: typeof onJobChange}) => { onJobChange = props.onJobChange; return <span>{props.job.id}:{props.job.status}</span>; } }));

const currentJob = { id: "my-job", userId:"owner", status: "queued_references" } as AvatarJob;
const otherJob = { id: "other-tab-job", userId:"owner", status: "queued_references" } as AvatarJob;
const initial = { user:{id:"owner"}, jobs: [], activeJob: null, models: [], feature: {}, quota: {} } as unknown as AvatarBootstrap;
const request = {
  idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  file: new File(["fixture"], "face.png", { type: "image/png" }),
  bodyShape: "balanced", outfit: "casual", userDescription: "", qualityPreset: "standard",
  acceptedReferenceCostVersion: "v1",
} satisfies AvatarCreateRequest;

function start() {
  const api = {
    preparePhoto: vi.fn().mockResolvedValue({photo:{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},upload:{}}),
    uploadPhoto: vi.fn(), completePhoto: vi.fn(), deletePhoto: vi.fn(),
    createJob: vi.fn(), findSubmission: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({...initial, activeJob: otherJob, jobs:[otherJob]}),
  };
  const view = render(<AvatarWorkspace api={api as unknown as AvatarApi} initialBootstrap={initial} />);
  return Object.assign(api, {unmount:view.unmount});
}

it("keeps a different tab's active job distinct from a rejected creation", async () => {
  const api = start();
  const conflict = new AvatarApiError({status:409,code:"ACTIVE_JOB_EXISTS"});
  api.createJob.mockRejectedValue(conflict);
  await act(async () => { await expect(submit(request)).rejects.toBe(conflict); });
  expect(api.findSubmission).not.toHaveBeenCalled();
  expect(api.deletePhoto).toHaveBeenCalledWith("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
});

it("recovers only the original key after an ambiguous creation and keeps a confirmed job if refresh fails", async () => {
  const api = start();
  api.createJob.mockRejectedValue(new TypeError("response lost"));
  api.findSubmission.mockResolvedValue({job:currentJob});
  api.bootstrap.mockRejectedValue(new Error("cannot refresh"));
  await act(async () => { await submit(request); });
  expect(api.findSubmission).toHaveBeenCalledWith(request.idempotencyKey);
  expect(api.createJob).toHaveBeenCalledTimes(1);
  expect(api.deletePhoto).not.toHaveBeenCalled();
  expect(screen.getByText(`${currentJob.id}:${currentJob.status}`)).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("任务已确认");
});

it("keeps the same original photo and key for explicit retries after a lookup misses", async () => {
  const api = start();
  api.createJob.mockRejectedValueOnce(new Error("unknown")).mockResolvedValueOnce({job:currentJob});
  api.findSubmission.mockResolvedValue({job:null});
  await act(async () => { await expect(submit(request)).rejects.toThrow("unknown"); });
  await act(async () => { await submit({...request, acceptedReferenceCostVersion:"updated"}); });
  expect(api.preparePhoto).toHaveBeenCalledTimes(1);
  expect(api.createJob.mock.calls[1]).toEqual(api.createJob.mock.calls[0]);
  expect(api.deletePhoto).not.toHaveBeenCalled();
});

it("ignores a late receipt from a closed workspace after a new owner saves another attempt", async () => {
  const api = start();
  let reply!: (result: {job:AvatarJob}) => void;
  api.createJob.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = submit(request); });
  const old = readAvatarSubmission("owner")!;
  expect(old.key).toBe(request.idempotencyKey);
  api.unmount();
  const replacement = {...old,owner:"new-account",key:"aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb"};
  saveAvatarSubmission(replacement);
  await act(async () => {
    reply({job:currentJob});
    await expect(pending).rejects.toThrow();
  });
  expect(readAvatarSubmission("new-account")).toEqual(replacement);
  expect(api.bootstrap).not.toHaveBeenCalled();
  expect(readAvatarSubmission("different-account")).toBeNull();
  expect(sessionStorage.length).toBe(0);
});


it.each(["succeeded", "failed", "quality_failed", "cancelled", "submission_unknown"] as const)(
  "keeps the confirmed %s receipt and retries only the failed workspace read",
  async (status) => {
    const api = start();
    api.createJob.mockResolvedValue({job:currentJob});
    api.bootstrap.mockResolvedValue({...initial, activeJob:currentJob, jobs:[currentJob]});
    await act(async () => { await submit(request); });
    api.bootstrap.mockRejectedValueOnce(new Error("bootstrap unavailable"));
    await act(async () => { onJobChange({...currentJob, status}); });
    expect(screen.getByText(`${currentJob.id}:${status}`)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("工作区暂时无法刷新");
    expect(screen.queryByText("暂无 3D 模型")).toBeNull();

    let resolveRefresh!: (value: AvatarBootstrap) => void;
    api.bootstrap.mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }));
    const retry = screen.getByRole("button", {name:"重试刷新工作区"});
    await act(async () => { fireEvent.click(retry); fireEvent.click(retry); });
    expect(api.bootstrap).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("status").textContent).toBe("正在刷新工作区");
    await act(async () => { resolveRefresh({...initial, jobs:[{...currentJob, status}]}); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("暂无 3D 模型")).toBeTruthy();
    expect(api.createJob).toHaveBeenCalledTimes(1);
    expect(api.preparePhoto).toHaveBeenCalledTimes(1);
  },
);

it("absorbs a terminal refresh failure after its workspace was closed", async () => {
  const api = start();
  api.createJob.mockResolvedValue({job:currentJob});
  api.bootstrap.mockResolvedValue({...initial, activeJob:currentJob, jobs:[currentJob]});
  await act(async () => { await submit(request); });
  let rejectRefresh!: (error: Error) => void;
  api.bootstrap.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
  await act(async () => { onJobChange({...currentJob, status:"succeeded"}); });
  api.unmount();
  await act(async () => { rejectRefresh(new Error("closed workspace response")); });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(api.createJob).toHaveBeenCalledTimes(1);
});
