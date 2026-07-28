import { Check, ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AvatarApiError } from "../api";
import type { AvatarFeature, AvatarQualityPreset, AvatarQuota } from "../types";
import { inspectPhotoFile, type PhotoInspection } from "./photoInspection";

const allowedTypes = new Set(["image/jpeg", "image/png"]);
const maximumBytes = 10 * 1024 * 1024;

type BodyShape = "balanced" | "slender" | "athletic";
type Outfit = "business" | "smart_casual" | "casual" | "sport" | "formal";

const bodyOptions: Array<{ id: BodyShape; label: string }> = [
  { id: "balanced", label: "匀称" },
  { id: "slender", label: "修长" },
  { id: "athletic", label: "运动感" },
];

const outfitOptions: Array<{ id: Outfit; label: string }> = [
  { id: "smart_casual", label: "商务休闲" },
  { id: "casual", label: "日常休闲" },
  { id: "business", label: "商务" },
  { id: "sport", label: "运动" },
  { id: "formal", label: "正式" },
];

export interface AvatarCreateRequest {
  file: File;
  bodyShape: BodyShape;
  outfit: Outfit;
  userDescription: string;
  qualityPreset: AvatarQualityPreset;
  acceptedReferenceCostVersion: string;
  idempotencyKey: string;
}

interface AvatarComposerProps {
  feature: AvatarFeature;
  quota: AvatarQuota;
  onCreate: (request: AvatarCreateRequest) => Promise<void>;
  inspectPhoto?: typeof inspectPhotoFile;
}

const safeCreateError = (cause: unknown) => {
  if (!(cause instanceof AvatarApiError)) return "未确认是否创建成功，请刷新状态后再试";
  if (cause.code === "PROVIDER_UNAVAILABLE" || cause.status === 503) return "生成服务暂时不可用";
  if (cause.code === "ACTIVE_JOB_EXISTS") return "已有任务进行中";
  if (cause.code === "DAILY_LIMIT_REACHED" || cause.status === 429) return "今日次数已用完";
  if (cause.code === "COST_VERSION_CHANGED") return "费用信息已更新，请刷新后确认";
  return "创建未完成，可再次确认重试";
};

export function AvatarComposer({
  feature,
  quota,
  onCreate,
  inspectPhoto = inspectPhotoFile,
}: AvatarComposerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [inspection, setInspection] = useState<PhotoInspection | null>(null);
  const inspectionSequence = useRef(0);
  const [bodyShape, setBodyShape] = useState<BodyShape>("balanced");
  const [outfit, setOutfit] = useState<Outfit>("smart_casual");
  const [userDescription, setUserDescription] = useState("");
  const [identityAccepted, setIdentityAccepted] = useState(false);
  const [completionAccepted, setCompletionAccepted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const resetAttempt = () => setIdempotencyKey(null);

  const setPhoto = (nextFile?: File) => {
    setError("");
    resetAttempt();
    inspectionSequence.current += 1;
    const sequence = inspectionSequence.current;
    if (!nextFile) {
      setFile(null);
      setInspection(null);
      return;
    }
    if (!allowedTypes.has(nextFile.type) || nextFile.size > maximumBytes) {
      setError("仅支持 10 MB 以内的 JPG 或 PNG 照片");
      return;
    }
    setFile(nextFile);
    setInspection({ status: "checking", message: "正在检查照片" });
    void inspectPhoto(nextFile).then((result) => {
      if (inspectionSequence.current === sequence) setInspection(result);
    }).catch(() => {
      if (inspectionSequence.current === sequence) {
        setInspection({ status: "usable", message: "照片可用" });
      }
    });
  };

  const openConfirmation = () => {
    setError("");
    if (!file) {
      setError("请添加正面脸照");
      return;
    }
    if (inspection?.status === "invalid") {
      setError("这张照片无法使用，请更换后再试");
      return;
    }
    if (!identityAccepted) {
      setError("请确认照片授权及人物已成年");
      return;
    }
    if (!completionAccepted) {
      setError("请确认允许 AI 补全未展示内容");
      return;
    }
    setConfirmOpen(true);
  };

  const confirm = async () => {
    if (pending || !file) return;
    const requestKey = idempotencyKey || globalThis.crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(requestKey);
    setPending(true);
    setError("");
    try {
      await onCreate({
        file,
        bodyShape,
        outfit,
        userDescription: userDescription.trim(),
        qualityPreset: feature.defaultQualityPreset,
        acceptedReferenceCostVersion: feature.costVersion,
        idempotencyKey: requestKey,
      });
      setConfirmOpen(false);
      setPhoto(undefined);
      setIdentityAccepted(false);
      setCompletionAccepted(false);
      setUserDescription("");
      setIdempotencyKey(null);
    } catch (cause) {
      setConfirmOpen(false);
      setError(safeCreateError(cause));
    } finally {
      setPending(false);
    }
  };

  const blockedLabel = !feature.generationAvailable
    ? "生成服务暂时不可用"
    : quota.hasActiveJob
      ? "已有任务进行中"
      : quota.dailyRemaining <= 0
        ? "今日次数已用完"
        : "";
  const referenceCostFen = feature.referenceGenerationEstimatedCostFen;

  return (
    <section className="composer-panel face-first-composer" aria-labelledby="composer-title">
      <div className="panel-heading">
        <div>
          <span className="utility-label">NEW AVATAR</span>
          <h1 id="composer-title">创建个人形象</h1>
        </div>
        <span className="quota-label">今日剩余 {quota.dailyRemaining} 次</span>
      </div>

      <div className="face-photo-field">
        <label className="face-photo-target">
          {preview ? <img src={preview} alt="正面脸照预览" /> : (
            <span aria-hidden="true"><ImagePlus size={22} /></span>
          )}
          <input
            aria-label="正面脸照"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => setPhoto(event.target.files?.[0])}
          />
        </label>
        <div className="face-photo-copy">
          <strong>正面脸照</strong>
          <p className={`photo-inspection is-${inspection?.status || "idle"}`} aria-live="polite">
            {inspection?.message || "清楚展示脸部即可"}
          </p>
          {file ? (
            <button
              className="slot-remove"
              type="button"
              title="移除照片"
              aria-label="移除照片"
              onClick={() => setPhoto(undefined)}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <fieldset className="brief-fieldset">
        <legend>身材方向</legend>
        <div className="brief-segment" aria-label="身材方向">
          {bodyOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={bodyShape === option.id}
              onClick={() => { setBodyShape(option.id); resetAttempt(); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="brief-select">
        <span>服装方向</span>
        <select
          value={outfit}
          onChange={(event) => { setOutfit(event.target.value as Outfit); resetAttempt(); }}
        >
          {outfitOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="brief-description">
        <span>补充要求</span>
        <textarea
          value={userDescription}
          maxLength={240}
          rows={3}
          placeholder="例如：蓝白色运动套装，气质自信自然"
          onChange={(event) => { setUserDescription(event.target.value); resetAttempt(); }}
        />
      </label>

      <label className="rights-check">
        <input
          type="checkbox"
          checked={identityAccepted}
          onChange={(event) => setIdentityAccepted(event.target.checked)}
        />
        <span className="check-indicator" aria-hidden="true"><Check size={14} /></span>
        <span>确认拥有照片使用授权，且照片中的人物已成年</span>
      </label>
      <label className="rights-check">
        <input
          type="checkbox"
          checked={completionAccepted}
          onChange={(event) => setCompletionAccepted(event.target.checked)}
        />
        <span className="check-indicator" aria-hidden="true"><Check size={14} /></span>
        <span>同意 AI 根据描述补全未展示的身体、服装与背面</span>
      </label>

      <div className="cost-row">
        <span>本次先生成 4 张参考图</span>
        <strong>预计 ¥{(referenceCostFen / 100).toFixed(2)}</strong>
      </div>
      {error ? <p className="composer-error" role="alert">{error}</p> : null}
      <button
        className="primary-command composer-submit"
        type="button"
        disabled={Boolean(blockedLabel) || pending}
        onClick={openConfirmation}
      >
        <Sparkles size={18} />
        {blockedLabel || (pending ? "正在创建" : "生成四视图")}
      </button>

      {confirmOpen ? (
        <div className="confirm-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <span className="utility-label">REFERENCE CONFIRMATION</span>
            <h2 id="confirm-title">确认生成四视图</h2>
            <dl>
              <div><dt>照片</dt><dd>1 张正面脸照</dd></div>
              <div><dt>身材</dt><dd>{bodyOptions.find(({ id }) => id === bodyShape)?.label}</dd></div>
              <div><dt>服装</dt><dd>{outfitOptions.find(({ id }) => id === outfit)?.label}</dd></div>
              <div><dt>预计费用</dt><dd>¥{(referenceCostFen / 100).toFixed(2)}</dd></div>
            </dl>
            <p className="confirm-note">此步骤只生成四视图，确认效果后才会开始 3D 建模。</p>
            <div className="confirm-actions">
              <button className="secondary-command" type="button" onClick={() => setConfirmOpen(false)} disabled={pending}>
                取消
              </button>
              <button className="primary-command" type="button" onClick={() => void confirm()} disabled={pending}>
                {pending ? "正在创建" : "确认并生成四视图"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
