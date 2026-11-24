import { CircleAlert, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AvatarApiError } from "../api";
import type {
  AvatarFeature,
  AvatarJob,
  AvatarPhotoView,
  AvatarQualityPreset,
  AvatarReferenceConfirmation as AvatarReferenceConfirmationResult,
  AvatarReferences,
} from "../types";
import { ReferenceConfirmation } from "./ReferenceConfirmation";

const terminal = new Set<AvatarJob["status"]>([
  "succeeded",
  "failed",
  "quality_failed",
  "cancelled",
  "submission_unknown",
]);

const confirmationStatuses = new Set<AvatarJob["status"]>([
  "awaiting_reference_confirmation",
]);

export const shouldPollJob = (job: AvatarJob) =>
  !terminal.has(job.status) && !confirmationStatuses.has(job.status);

export const pollDelayForJob = (job: AvatarJob, now = Date.now()) => {
  const elapsed = Math.max(0, now - Date.parse(job.createdAt));
  return elapsed <= 30_000 ? 3000 : 8000;
};

const statusContent: Record<AvatarJob["status"], { title: string; detail: string }> = {
  queued_references: { title: "正在准备四视图", detail: "任务已进入队列" },
  submitting_references: { title: "正在提交四视图任务", detail: "不会重复提交付费请求" },
  processing_references: { title: "正在生成四视图", detail: "可以关闭页面，任务会继续" },
  persisting_references: { title: "四视图已生成", detail: "正在保存到你的私有工作区" },
  awaiting_reference_confirmation: { title: "确认四视图", detail: "确认后才会开始 3D 建模" },
  queued_3d: { title: "正在准备 3D 生成", detail: "任务已进入队列" },
  submitting_3d: { title: "正在提交 3D 任务", detail: "不会重复提交付费请求" },
  processing_3d: { title: "正在生成 3D 形象", detail: "可以关闭页面，任务会继续" },
  persisting: { title: "预览已完成", detail: "正在准备可旋转模型" },
  succeeded: { title: "3D 形象已生成", detail: "模型已保存到你的工作区" },
  failed: { title: "本次生成未完成", detail: "本次任务不会自动重试" },
  quality_failed: { title: "模型质量未达标", detail: "本次任务不会自动重试或重复计费" },
  cancelled: { title: "本次生成已放弃", detail: "未继续生成 3D 模型" },
  submission_unknown: { title: "提交状态待确认", detail: "为避免重复计费，任务不会自动重试" },
};

interface TaskProgressProps {
  job: AvatarJob;
  feature: AvatarFeature;
  getJob: (jobId: string) => Promise<AvatarJob>;
  getReferences: (jobId: string) => Promise<AvatarReferences>;
  confirmReferences: (
    jobId: string,
    input: { referenceSetId: string; qualityPreset: AvatarQualityPreset; acceptedCostVersion: string },
  ) => Promise<AvatarReferenceConfirmationResult>;
  rejectReferences: (jobId: string, referenceSetId: string) => Promise<AvatarJob>;
  referenceImageUrl: (jobId: string, view: AvatarPhotoView) => string;
  cancelJob: (jobId: string) => Promise<AvatarJob>;
  resultPreviewUrl: string;
  onJobChange: (job: AvatarJob) => void;
}

type ReferenceRead =
  | { state: "loading" }
  | { state: "error"; requestId: string }
  | { state: "ready"; data: AvatarReferences };

function requestReference(cause: unknown) {
  return cause instanceof AvatarApiError ? cause.requestId || "" : "";
}

export function TaskProgress(props: TaskProgressProps) {
  return <TaskProgressForJob key={props.job.id} {...props} />;
}

function TaskProgressForJob({
  job,
  feature,
  getJob,
  getReferences,
  confirmReferences,
  rejectReferences,
  referenceImageUrl,
  cancelJob,
  resultPreviewUrl,
  onJobChange,
}: TaskProgressProps) {
  const [currentJob, setCurrentJob] = useState(job);
  const [referenceRead, setReferenceRead] = useState<ReferenceRead>({ state: "loading" });
  const [referenceRevision, setReferenceRevision] = useState(0);
  const [requestId, setRequestId] = useState("");
  const [pendingAction, setPendingAction] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; requestId: string } | null>(null);
  const mounted = useRef(false);
  const mutating = useRef(false);
  const readGeneration = useRef(0);

  useEffect(() => setCurrentJob(job), [job]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readGeneration.current++;
    };
  }, []);

  const applyJob = useCallback((next: AvatarJob) => {
    setCurrentJob(next);
    onJobChange(next);
  }, [onJobChange]);
  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const generation = ++readGeneration.current;
    setRequestId("");
    try {
      const next = await getJob(currentJob.id);
      if (generation === readGeneration.current && next.id === currentJob.id) applyJob(next);
    } catch (cause) {
      if (generation === readGeneration.current) setRequestId(requestReference(cause));
    }
  }, [applyJob, currentJob.id, getJob]);

  useLayoutEffect(() => {
    setReferenceRead({ state: "loading" });
    if (currentJob.status !== "awaiting_reference_confirmation") {
      return;
    }
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      const next = await getReferences(currentJob.id);
      if (!active) return;
      if (next.referenceSet.jobId !== currentJob.id
        || next.referenceSet.id !== currentJob.referenceSetId
        || next.images.length !== 4
        || new Set(next.images.map(image => image.view)).size !== 4
        || next.images.some(image => image.jobId !== currentJob.id
          || image.referenceSetId !== next.referenceSet.id)) {
        throw new Error("Reference set does not match the active task");
      }
      setReferenceRead({ state: "ready", data: next });
    }).catch((cause) => {
      if (active) setReferenceRead({ state: "error", requestId: requestReference(cause) });
    });
    return () => { active = false; };
  }, [currentJob.id, currentJob.referenceSetId, currentJob.status, getReferences, referenceRevision]);

  useEffect(() => {
    if (!shouldPollJob(currentJob)) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await refresh();
        if (!cancelled) schedule();
      }, pollDelayForJob(currentJob));
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentJob, refresh]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden" && shouldPollJob(currentJob)) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [currentJob, refresh]);

  const act = async (action: () => Promise<AvatarJob>, message: string) => {
    if (mutating.current) return;
    mutating.current = true;
    readGeneration.current++;
    setActionError(null);
    setRequestId("");
    setPendingAction(true);
    try {
      const next = await action();
      if (!mounted.current) return;
      if (next.id !== currentJob.id) throw new Error("Action result does not match the active task");
      applyJob(next);
    } catch (cause) {
      if (mounted.current) setActionError({ message, requestId: requestReference(cause) });
    } finally {
      mutating.current = false;
      if (mounted.current) setPendingAction(false);
    }
  };

  const copy = statusContent[currentJob.status];
  const isTerminal = terminal.has(currentJob.status);
  const hasResultPreview = currentJob.status === "persisting"
    && Boolean(currentJob.modelId)
    && Boolean(resultPreviewUrl);
  const canCancel = currentJob.status === "queued_references" || currentJob.status === "queued_3d";
  const inReferenceStage = [
    "queued_references",
    "submitting_references",
    "processing_references",
    "persisting_references",
    "awaiting_reference_confirmation",
  ].includes(currentJob.status);

  return (
    <section className="task-stage" aria-live="polite">
      <header className="task-heading">
        <span className="utility-label">ACTIVE TASK</span>
        <h2>{copy.title}</h2>
        <p>{copy.detail}</p>
      </header>

      {currentJob.status === "awaiting_reference_confirmation" ? (
        referenceRead.state === "ready" ? (
          <ReferenceConfirmation
            references={referenceRead.data}
            feature={feature}
            imageUrl={(view) => referenceImageUrl(currentJob.id, view)}
            pending={pendingAction}
            onConfirm={(qualityPreset) => act(
              () => confirmReferences(currentJob.id, {
                referenceSetId: referenceRead.data.referenceSet.id,
                qualityPreset,
                acceptedCostVersion: feature.costVersion,
              }).then((result) => result.job),
              "确认未完成，请稍后重试。",
            )}
            onReject={() => act(
              () => rejectReferences(currentJob.id, referenceRead.data.referenceSet.id),
              "放弃四视图未完成，请稍后重试。",
            )}
          />
        ) : referenceRead.state === "error" ? (
          <div className="task-pulse">
            <p role="alert" className="composer-error">暂时无法读取四视图。</p>
            {referenceRead.requestId && <p className="request-reference">请求编号：{referenceRead.requestId}</p>}
            <button className="secondary-command" type="button" onClick={() => setReferenceRevision(value => value + 1)}>
              重试读取四视图
            </button>
          </div>
        ) : (
          <div className="task-pulse" role="status">
            <LoaderCircle className="task-loader" size={34} aria-hidden="true" />
            <strong>正在读取四视图</strong>
          </div>
        )
      ) : hasResultPreview ? (
        <div className="result-preview-stage">
          <img src={resultPreviewUrl} alt="3D 形象生成预览" />
          <div className="result-preview-progress">
            <LoaderCircle className="task-loader" size={24} />
            <div className="progress-track" aria-label={`生成进度 ${currentJob.progress}%`}>
              <span style={{ width: `${Math.max(2, currentJob.progress)}%` }} />
            </div>
            <strong>{currentJob.progress}%</strong>
          </div>
        </div>
      ) : (
        <div className={`task-pulse${isTerminal ? " is-terminal" : ""}`}>
          {isTerminal ? <CircleAlert size={34} /> : <LoaderCircle className="task-loader" size={34} />}
          <div className="progress-track" aria-label={`生成进度 ${currentJob.progress}%`}>
            <span style={{ width: `${Math.max(2, currentJob.progress)}%` }} />
          </div>
          <strong>{currentJob.progress}%</strong>
        </div>
      )}

      {canCancel ? (
        <button
          className="secondary-command"
          type="button"
          disabled={pendingAction}
          onClick={() => void act(() => cancelJob(currentJob.id), "取消未完成，请查看任务状态后重试。")}
        >
          <X size={18} />{pendingAction ? "正在取消" : "取消任务"}
        </button>
      ) : null}

      {actionError && (
        <div role="alert">
          <p className="composer-error">{actionError.message}</p>
          {actionError.requestId && <p className="request-reference">请求编号：{actionError.requestId}</p>}
        </div>
      )}
      {requestId ? <p className="request-reference">请求编号：{requestId}</p> : null}
      <footer className="task-meta">
        <span>写实个人形象</span>
        <span>{inReferenceStage ? "四视图阶段" : "3D 建模阶段"}</span>
        <span>
          预计 ¥{((inReferenceStage
            ? feature.referenceGenerationEstimatedCostFen
            : currentJob.estimatedCostFen) / 100).toFixed(2)}
        </span>
      </footer>
    </section>
  );
}
