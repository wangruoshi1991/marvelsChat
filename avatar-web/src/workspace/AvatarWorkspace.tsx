import { Box, Clock3, ImageOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarApiError, type AvatarApi } from "../api";
import type {
  AvatarBootstrap,
  AvatarJob,
  AvatarPhotoView,
} from "../types";
import { AvatarComposer, type AvatarCreateRequest } from "./AvatarComposer";
import { TaskProgress } from "./TaskProgress";

interface UploadAttempt {
  idempotencyKey: string;
  photos: Array<{ view: AvatarPhotoView; photoId: string }>;
}

interface AvatarWorkspaceProps {
  initialBootstrap: AvatarBootstrap;
  api: AvatarApi;
}

const terminalStatuses = new Set<AvatarJob["status"]>([
  "succeeded",
  "failed",
  "cancelled",
  "submission_unknown",
]);

export function AvatarWorkspace({ initialBootstrap, api }: AvatarWorkspaceProps) {
  const [snapshot, setSnapshot] = useState(initialBootstrap);
  const [activity, setActivity] = useState("");
  const attemptRef = useRef<UploadAttempt | null>(null);

  useEffect(() => setSnapshot(initialBootstrap), [initialBootstrap]);

  const refresh = useCallback(async () => {
    const next = await api.bootstrap();
    setSnapshot(next);
    return next;
  }, [api]);

  const cleanupPhotos = useCallback(async (photos: UploadAttempt["photos"]) => {
    await Promise.allSettled(photos.map(({ photoId }) => api.deletePhoto(photoId)));
  }, [api]);

  const createAvatar = useCallback(async (request: AvatarCreateRequest) => {
    let attempt = attemptRef.current?.idempotencyKey === request.idempotencyKey
      ? attemptRef.current
      : null;
    if (!attempt) {
      if (attemptRef.current) await cleanupPhotos(attemptRef.current.photos);
      attempt = { idempotencyKey: request.idempotencyKey, photos: [] };
      attemptRef.current = attempt;
    }

    let creatingJob = false;
    try {
      if (!attempt.photos.length) {
        setActivity("正在验证照片");
        for (const { view, file } of request.files) {
          const prepared = await api.preparePhoto({
            originalFilename: file.name,
            mimeType: file.type,
            byteSize: file.size,
          });
          attempt.photos.push({ view, photoId: prepared.photo.id });
          await api.uploadPhoto(prepared.upload, file);
          await api.completePhoto(prepared.photo.id);
        }
      }

      setActivity("正在创建任务");
      creatingJob = true;
      await api.createJob({
        style: request.style,
        photos: attempt.photos,
        acceptedPhotoRights: true,
        acceptedCostVersion: request.acceptedCostVersion,
      }, request.idempotencyKey);
      attemptRef.current = null;
      await refresh();
    } catch (cause) {
      if (creatingJob) {
        try {
          const recovered = await refresh();
          if (recovered.activeJob) {
            attemptRef.current = null;
            return;
          }
        } catch {
          // The original result remains ambiguous; keep the same photos and idempotency key.
        }
      }

      const isDefinitive = cause instanceof AvatarApiError && cause.status < 500;
      if (!creatingJob || isDefinitive) {
        await cleanupPhotos(attempt.photos);
        attemptRef.current = null;
      }
      throw cause;
    } finally {
      setActivity("");
    }
  }, [api, cleanupPhotos, refresh]);

  const onJobChange = useCallback((job: AvatarJob) => {
    setSnapshot((current) => ({
      ...current,
      activeJob: terminalStatuses.has(job.status) ? null : job,
      jobs: current.jobs.map((item) => item.id === job.id ? job : item),
    }));
    if (terminalStatuses.has(job.status)) void refresh();
  }, [refresh]);

  const activeJob = snapshot.activeJob;
  const latestModel = snapshot.models[0] || null;

  return (
    <div className="avatar-workspace">
      <aside className="workspace-controls">
        <AvatarComposer
          feature={snapshot.feature}
          quota={snapshot.quota}
          onCreate={createAvatar}
        />
        {activity ? <p className="workspace-activity" aria-live="polite"><Clock3 size={15} />{activity}</p> : null}
        {snapshot.jobs.length ? (
          <section className="recent-jobs" aria-labelledby="recent-jobs-title">
            <h2 id="recent-jobs-title">最近任务</h2>
            <ol>
              {snapshot.jobs.slice(0, 3).map((job) => (
                <li key={job.id}>
                  <span>{job.style === "realistic" ? "写实" : "卡通"}</span>
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
            getJob={api.getJob}
            confirmStyle={api.confirmStyle}
            cancelJob={api.cancelJob}
            previewUrl={activeJob.stylePreviewId ? api.stylePreviewUrl(activeJob.id) : ""}
            onJobChange={onJobChange}
          />
        ) : latestModel ? (
          <div className="model-ready-stage">
            {latestModel.thumbnailAvailable ? (
              <img src={api.modelThumbnailUrl(latestModel.id)} alt={latestModel.title} />
            ) : <Box size={80} strokeWidth={0.8} />}
            <div>
              <span className="utility-label">LATEST MODEL</span>
              <h2>{latestModel.title}</h2>
              <p>模型已保存</p>
            </div>
          </div>
        ) : (
          <div className="empty-result-stage">
            <ImageOff size={54} strokeWidth={0.9} />
            <h2>尚未生成个人形象</h2>
            <p>选择照片后开始创建</p>
          </div>
        )}
      </section>
    </div>
  );
}
