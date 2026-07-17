import { Check, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AvatarApiError } from "../api";
import type { AvatarJob } from "../types";

const terminal = new Set<AvatarJob["status"]>([
  "succeeded",
  "failed",
  "cancelled",
  "submission_unknown",
]);

export const shouldPollJob = (job: AvatarJob) =>
  !terminal.has(job.status) && job.status !== "awaiting_style_confirmation";

export const pollDelayForJob = (job: AvatarJob, now = Date.now()) => {
  const elapsed = Math.max(0, now - Date.parse(job.createdAt));
  return elapsed <= 30_000 ? 3000 : 8000;
};

const statusContent: Record<AvatarJob["status"], { title: string; detail: string }> = {
  queued_style: { title: "正在准备卡通参考图", detail: "任务已进入队列" },
  processing_style: { title: "正在生成卡通参考图", detail: "完成后需要你确认" },
  awaiting_style_confirmation: { title: "确认卡通参考图", detail: "确认后才会开始 3D 生成" },
  queued_3d: { title: "正在准备 3D 生成", detail: "任务已进入队列" },
  submitting_3d: { title: "正在提交生成任务", detail: "不会重复提交付费请求" },
  processing_3d: { title: "正在生成 3D 形象", detail: "可以关闭页面，任务会继续" },
  persisting: { title: "正在保存模型", detail: "即将完成" },
  succeeded: { title: "3D 形象已生成", detail: "模型已保存到你的工作区" },
  failed: { title: "本次生成未完成", detail: "本次任务不会自动重试" },
  cancelled: { title: "本次生成已放弃", detail: "未继续生成 3D 模型" },
  submission_unknown: { title: "提交状态待确认", detail: "为避免重复计费，任务不会自动重试" },
};

interface TaskProgressProps {
  job: AvatarJob;
  getJob: (jobId: string) => Promise<AvatarJob>;
  confirmStyle: (jobId: string) => Promise<AvatarJob>;
  cancelJob: (jobId: string) => Promise<AvatarJob>;
  previewUrl: string;
  onJobChange: (job: AvatarJob) => void;
}

export function TaskProgress({
  job,
  getJob,
  confirmStyle,
  cancelJob,
  previewUrl,
  onJobChange,
}: TaskProgressProps) {
  const [currentJob, setCurrentJob] = useState(job);
  const [requestId, setRequestId] = useState("");
  const [pendingAction, setPendingAction] = useState(false);

  useEffect(() => setCurrentJob(job), [job]);

  const refresh = useCallback(async () => {
    setRequestId("");
    try {
      const next = await getJob(currentJob.id);
      setCurrentJob(next);
      onJobChange(next);
    } catch (cause) {
      if (cause instanceof AvatarApiError && cause.requestId) setRequestId(cause.requestId);
    }
  }, [currentJob.id, getJob, onJobChange]);

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

  const act = async (action: (jobId: string) => Promise<AvatarJob>) => {
    if (pendingAction) return;
    setPendingAction(true);
    try {
      const next = await action(currentJob.id);
      setCurrentJob(next);
      onJobChange(next);
    } finally {
      setPendingAction(false);
    }
  };

  const copy = statusContent[currentJob.status];
  const isTerminal = terminal.has(currentJob.status);

  return (
    <section className="task-stage" aria-live="polite">
      <header className="task-heading">
        <span className="utility-label">ACTIVE TASK</span>
        <h2>{copy.title}</h2>
        <p>{copy.detail}</p>
      </header>

      {currentJob.status === "awaiting_style_confirmation" ? (
        <div className="style-confirmation">
          <img src={previewUrl} alt="卡通形象参考图" />
          <div className="style-confirm-actions">
            <button
              className="primary-command"
              type="button"
              disabled={pendingAction}
              onClick={() => void act(confirmStyle)}
            >
              <Check size={18} />
              确认并生成 3D
            </button>
            <button
              className="secondary-command"
              type="button"
              disabled={pendingAction}
              onClick={() => void act(cancelJob)}
            >
              <X size={18} />
              放弃本次
            </button>
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

      {requestId ? <p className="request-reference">请求编号：{requestId}</p> : null}
      <footer className="task-meta">
        <span>{currentJob.style === "realistic" ? "写实数字人" : "卡通潮玩"}</span>
        <span>{currentJob.photoCount} 张照片</span>
        <span>预计 ¥{(currentJob.estimatedCostFen / 100).toFixed(2)}</span>
      </footer>
    </section>
  );
}
