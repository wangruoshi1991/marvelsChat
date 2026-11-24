import { Clock3 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AvatarApiError, type AvatarApi } from "../api";
import type {
  AvatarBootstrap,
  AvatarCreateJobInput,
  AvatarJob,
} from "../types";
import { AvatarComposer, type AvatarCreateRequest } from "./AvatarComposer";
import { TaskProgress } from "./TaskProgress";
import { clearAvatarSubmission, readAvatarSubmission, saveAvatarSubmission, type AvatarSubmission } from "./avatarSubmission";

const AvatarViewer = lazy(() => import("../viewer/AvatarViewer").then((module) => ({
  default: module.AvatarViewer,
})));

interface UploadAttempt {
  idempotencyKey: string;
  photoId: string | null;
  input?: AvatarCreateJobInput;
}

interface AvatarWorkspaceProps {
  initialBootstrap: AvatarBootstrap;
  api: AvatarApi;
}

const terminalStatuses = new Set<AvatarJob["status"]>([
  "succeeded",
  "failed",
  "quality_failed",
  "cancelled",
  "submission_unknown",
]);

export function AvatarWorkspace({ initialBootstrap, api }: AvatarWorkspaceProps) {
  const [snapshot, setSnapshot] = useState(initialBootstrap);
  const [activity, setActivity] = useState("");
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [restored, setRestored] = useState<AvatarSubmission | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const owner = initialBootstrap.user.id;
  const [refreshError, setRefreshError] = useState("");
  const [resultRefresh, setResultRefresh] = useState<"idle" | "loading" | "failed">("idle");
  const resultRefreshInFlight = useRef(false);
  const [selectedModelId, setSelectedModelId] = useState(initialBootstrap.models[0]?.id || "");
  const attemptRef = useRef<UploadAttempt | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setSnapshot(initialBootstrap);
    setSelectedModelId((current) =>
      initialBootstrap.models.some((model) => model.id === current)
        ? current
        : initialBootstrap.models[0]?.id || "");
  }, [initialBootstrap]);

  const refresh = useCallback(async () => {
    const next = await api.bootstrap();
    if (!mounted.current || next.user.id !== owner) throw new Error("Workspace session changed");
    setSnapshot(next);
    return next;
  }, [api, owner]);

  const accept = useCallback((job: AvatarJob) => {
    if (!mounted.current || job.userId !== owner) throw new Error("Submission owner changed");
    const cleared = clearAvatarSubmission();
    attemptRef.current = null;
    setRestored(null);
    setSubmissionUncertain(false);
    setSnapshot(current => ({
      ...current,
      activeJob: terminalStatuses.has(job.status) ? null : job,
      jobs: [job, ...current.jobs.filter(item => item.id !== job.id)],
    }));
    setRefreshError(cleared ? "" : "任务已确认，本页提交记录未能清除。");
    return refresh().catch(() => { if (mounted.current) setRefreshError("任务已确认，工作区状态刷新失败。"); });
  }, [owner, refresh]);

  useEffect(() => {
    let active = true;
    let stored: AvatarSubmission | null;
    try { stored = readAvatarSubmission(owner); } catch { setRefreshError("无法访问本页的提交恢复记录。"); return; }
    if (!stored) return;
    setRestored(stored);
    attemptRef.current = { idempotencyKey: stored.key, photoId: stored.input.photoId, input: stored.input };
    setActivity("正在核对上次提交");
    void Promise.resolve().then(async () => {
      if (!active) return;
      const result = await api.findSubmission(stored.key);
      if (!active) return;
      if (result.job) await accept(result.job);
    }).catch(() => { if (active) setRefreshError("暂时无法确认上次提交。"); })
      .finally(() => { if (active) setActivity(""); });
    return () => { active = false; };
  }, [accept, api, owner]);

  const cleanupPhoto = useCallback(async (photoId: string | null) => {
    if (photoId) await Promise.allSettled([api.deletePhoto(photoId)]);
  }, [api]);

  const createAvatar = useCallback(async (request: Pick<AvatarCreateRequest, "idempotencyKey"> & Partial<AvatarCreateRequest>) => {
    if (!mounted.current || inFlight.current) throw new Error("Submission already pending");
    let attempt = attemptRef.current?.idempotencyKey === request.idempotencyKey
      ? attemptRef.current
      : null;
    if (!attempt) {
      if (attemptRef.current?.input) throw new Error("Resolve the previous submission first");
      attempt = { idempotencyKey: request.idempotencyKey, photoId: null };
      attemptRef.current = attempt;
    }

    inFlight.current = true;
    let creatingJob = false;
    const retryingSubmission = Boolean(attempt.input);
    let acceptedJob: AvatarJob;
    try {
      if (!attempt.photoId) {
        if (!request.file) throw new Error("Photo required");
        setActivity("正在验证照片");
        const prepared = await api.preparePhoto({
          originalFilename: request.file.name,
          mimeType: request.file.type,
          byteSize: request.file.size,
        });
        if (!mounted.current) throw new Error("Workspace closed");
        attempt.photoId = prepared.photo.id;
        await api.uploadPhoto(prepared.upload, request.file);
        if (!mounted.current) throw new Error("Workspace closed");
        await api.completePhoto(prepared.photo.id);
      }

      if (!mounted.current) throw new Error("Workspace closed");
      setActivity("正在创建任务");
      if (!attempt.input) {
        if (!request.bodyShape || !request.outfit || !request.qualityPreset || !request.acceptedReferenceCostVersion ||
          typeof request.userDescription !== "string") throw new Error("Missing submission parameters");
        attempt.input = {
          generationMode: "face_first_multiview",
          photoId: attempt.photoId,
          bodyShape: request.bodyShape,
          pose: "natural",
          outfit: request.outfit,
          userDescription: request.userDescription,
          qualityPreset: request.qualityPreset,
          acceptedPhotoRights: true,
          acceptedAdultSubject: true,
          acceptedFaceCompletion: true,
          acceptedReferenceCostVersion: request.acceptedReferenceCostVersion,
        };
      }
      saveAvatarSubmission({owner, key: request.idempotencyKey, input: attempt.input});
      creatingJob = true;
      const result = await api.createJob(attempt.input, request.idempotencyKey);
      acceptedJob = result.job;
    } catch (cause) {
      if (!mounted.current) throw cause;
      const isDefinitive = cause instanceof AvatarApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408;
      const needsLookup = creatingJob && (!isDefinitive || retryingSubmission);
      const recovered = needsLookup ? await api.findSubmission(request.idempotencyKey).catch(() => null) : null;
      if (!mounted.current) throw cause;
      if (recovered?.job) {
        acceptedJob = recovered.job;
      } else if (!creatingJob || (isDefinitive && (!retryingSubmission || recovered?.job === null))) {
        if (creatingJob) clearAvatarSubmission();
        await cleanupPhoto(attempt.photoId);
        if (!mounted.current) throw cause;
        attemptRef.current = null;
        setSubmissionUncertain(false);
        setRestored(null);
        throw cause;
      } else {
        setSubmissionUncertain(true);
        throw cause;
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setActivity("");
    }
    await accept(acceptedJob);
  }, [accept, api, cleanupPhoto, owner]);

  const refreshJobResult = useCallback(async () => {
    if (!mounted.current || resultRefreshInFlight.current) return;
    resultRefreshInFlight.current = true;
    setResultRefresh("loading");
    try {
      await refresh();
      if (mounted.current) setResultRefresh("idle");
    } catch {
      if (mounted.current) setResultRefresh("failed");
    } finally {
      resultRefreshInFlight.current = false;
    }
  }, [refresh]);

  const onJobChange = useCallback((job: AvatarJob) => {
    setSnapshot((current) => ({
      ...current,
      activeJob: job,
      jobs: current.jobs.map((item) => item.id === job.id ? job : item),
    }));
    if (terminalStatuses.has(job.status)) void refreshJobResult();
  }, [refreshJobResult]);

  const activeJob = snapshot.activeJob;
  const selectedModel = snapshot.models.find((model) => model.id === selectedModelId)
    || snapshot.models[0]
    || null;

  const deleteModel = useCallback(async (modelId: string) => {
    await api.deleteModel(modelId);
    const next = await refresh();
    setSelectedModelId(next.models[0]?.id || "");
  }, [api, refresh]);

  return (
    <div className="avatar-workspace">
      <aside className="workspace-controls">
        {restored ? <section className="composer-panel">
          <h2>上次提交尚待确认</h2>
          <button className="primary-command" type="button" disabled={Boolean(activity)}
            onClick={() => { void createAvatar({idempotencyKey:restored.key}).catch(() => {
              if (mounted.current) setRefreshError("原提交未完成，请查看任务状态后重试。");
            }); }}>重试原提交</button>
        </section> : <AvatarComposer
          feature={snapshot.feature}
          quota={snapshot.quota}
          onCreate={createAvatar}
          submissionUncertain={submissionUncertain}
          workspaceRefreshPending={resultRefresh !== "idle"}
        />}
        {refreshError ? <p role="alert">{refreshError}</p> : null}
        {resultRefresh === "failed" ? <div role="alert">
          <p>任务状态已更新，工作区暂时无法刷新。</p>
          <button className="secondary-command" type="button" onClick={() => void refreshJobResult()}>
            重试刷新工作区
          </button>
        </div> : resultRefresh === "loading" ? <p role="status">正在刷新工作区</p> : null}
        {activity ? <p className="workspace-activity" aria-live="polite"><Clock3 size={15} />{activity}</p> : null}
        {snapshot.jobs.length ? (
          <section className="recent-jobs" aria-labelledby="recent-jobs-title">
            <h2 id="recent-jobs-title">最近任务</h2>
            <ol>
              {snapshot.jobs.slice(0, 3).map((job) => (
                <li key={job.id}>
                  <span>写实</span>
                  <strong>{terminalStatuses.has(job.status) ? "已结束" : "进行中"}</strong>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </aside>

      <section className="workspace-result" aria-label="生成结果">
        {activeJob ? (
          <TaskProgress
            job={activeJob}
            feature={snapshot.feature}
            getJob={api.getJob}
            getReferences={api.getReferences}
            confirmReferences={api.confirmReferences}
            rejectReferences={api.rejectReferences}
            referenceImageUrl={api.referenceImageUrl}
            cancelJob={api.cancelJob}
            resultPreviewUrl={activeJob.status === "persisting" && activeJob.modelId
              ? api.modelThumbnailUrl(activeJob.modelId)
              : ""}
            onJobChange={onJobChange}
          />
        ) : (
          <div className="viewer-stage">
            {selectedModel ? (
              <Suspense fallback={<div className="viewer-empty"><p>正在准备查看器</p></div>}>
                <AvatarViewer
                  model={selectedModel}
                  modelUrl={api.modelFileUrl(selectedModel.id)}
                  thumbnailUrl={selectedModel.thumbnailAvailable
                    ? api.modelThumbnailUrl(selectedModel.id)
                    : ""}
                  onDelete={deleteModel}
                />
              </Suspense>
            ) : (
              <div className="viewer-empty">
                <span className="utility-label">MODEL VIEWER</span>
                <h2>暂无 3D 模型</h2>
              </div>
            )}
            {snapshot.models.length > 1 ? (
              <div className="model-switcher" aria-label="我的模型">
                {snapshot.models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={model.id === selectedModel?.id}
                    title={model.title}
                    onClick={() => setSelectedModelId(model.id)}
                  >
                    {model.thumbnailAvailable ? (
                      <img src={api.modelThumbnailUrl(model.id)} alt="" />
                    ) : <span>3D</span>}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
