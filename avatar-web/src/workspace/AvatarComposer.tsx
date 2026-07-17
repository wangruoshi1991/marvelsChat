import { Check, ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AvatarApiError } from "../api";
import type {
  AvatarFeature,
  AvatarPhotoView,
  AvatarQuota,
  AvatarStyle,
} from "../types";

const viewOptions: Array<{
  view: AvatarPhotoView;
  label: string;
  inputLabel: string;
  required?: boolean;
}> = [
  { view: "front", label: "正面全身", inputLabel: "正面全身照片", required: true },
  { view: "left", label: "左侧", inputLabel: "左侧照片" },
  { view: "back", label: "背面", inputLabel: "背面照片" },
  { view: "right", label: "右侧", inputLabel: "右侧照片" },
];

const allowedTypes = new Set(["image/jpeg", "image/png"]);
const maximumBytes = 10 * 1024 * 1024;

export interface AvatarCreateRequest {
  style: AvatarStyle;
  files: Array<{ view: AvatarPhotoView; file: File }>;
  acceptedCostVersion: string;
  idempotencyKey: string;
}

interface AvatarComposerProps {
  feature: AvatarFeature;
  quota: AvatarQuota;
  onCreate: (request: AvatarCreateRequest) => Promise<void>;
}

function PhotoSlot({
  view,
  label,
  inputLabel,
  required = false,
  file,
  disabled,
  onChange,
}: {
  view: AvatarPhotoView;
  label: string;
  inputLabel: string;
  required?: boolean;
  file?: File;
  disabled: boolean;
  onChange: (view: AvatarPhotoView, file?: File) => void;
}) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className={`photo-slot${disabled ? " is-disabled" : ""}`} data-testid="photo-slot">
      <label className="photo-slot-target">
        {preview ? <img src={preview} alt={`${label}预览`} /> : (
          <span className="photo-slot-empty" aria-hidden="true">
            <ImagePlus size={22} />
          </span>
        )}
        <input
          aria-label={inputLabel}
          type="file"
          accept="image/jpeg,image/png"
          disabled={disabled}
          onChange={(event) => onChange(view, event.target.files?.[0])}
        />
      </label>
      <div className="photo-slot-meta">
        <span>{label}{required ? <b>必选</b> : null}</span>
        {file ? (
          <button
            className="slot-remove"
            type="button"
            title={`移除${label}照片`}
            aria-label={`移除${label}照片`}
            onClick={() => onChange(view, undefined)}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const safeCreateError = (cause: unknown) => {
  if (!(cause instanceof AvatarApiError)) return "未确认是否创建成功，请刷新状态后再试";
  if (cause.code === "PROVIDER_UNAVAILABLE" || cause.status === 503) return "生成服务待配置";
  if (cause.code === "ACTIVE_JOB_EXISTS") return "已有任务进行中";
  if (cause.code === "DAILY_LIMIT_REACHED" || cause.status === 429) return "今日次数已用完";
  return "创建未完成，可再次确认重试";
};

export function AvatarComposer({ feature, quota, onCreate }: AvatarComposerProps) {
  const [style, setStyle] = useState<AvatarStyle>("realistic");
  const [files, setFiles] = useState<Partial<Record<AvatarPhotoView, File>>>({});
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const costFen = feature.estimatedCostsFen[style];

  const selectedFiles = useMemo(() => viewOptions
    .filter(({ view }) => style === "realistic" || view === "front")
    .map(({ view }) => ({ view, file: files[view] }))
    .filter((item): item is { view: AvatarPhotoView; file: File } => Boolean(item.file)),
  [files, style]);

  const resetAttempt = () => setIdempotencyKey(null);

  const selectStyle = (nextStyle: AvatarStyle) => {
    if (nextStyle === style) return;
    setStyle(nextStyle);
    setFiles({});
    setError("");
    resetAttempt();
  };

  const setPhoto = (view: AvatarPhotoView, file?: File) => {
    setError("");
    resetAttempt();
    if (!file) {
      setFiles((current) => {
        const next = { ...current };
        delete next[view];
        return next;
      });
      return;
    }
    if (!allowedTypes.has(file.type) || file.size > maximumBytes) {
      setError("仅支持 10 MB 以内的 JPG 或 PNG 照片");
      return;
    }
    setFiles((current) => ({ ...current, [view]: file }));
  };

  const openConfirmation = () => {
    setError("");
    if (!files.front) {
      setError("请添加正面全身照");
      return;
    }
    if (!rightsAccepted) {
      setError("请确认拥有照片使用授权");
      return;
    }
    setConfirmOpen(true);
  };

  const confirm = async () => {
    if (pending) return;
    const requestKey = idempotencyKey || globalThis.crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(requestKey);
    setPending(true);
    setError("");
    try {
      await onCreate({
        style,
        files: selectedFiles,
        acceptedCostVersion: feature.costVersion,
        idempotencyKey: requestKey,
      });
      setConfirmOpen(false);
      setFiles({});
      setRightsAccepted(false);
      setIdempotencyKey(null);
    } catch (cause) {
      setConfirmOpen(false);
      setError(safeCreateError(cause));
    } finally {
      setPending(false);
    }
  };

  const blockedLabel = !feature.generationAvailable
    ? "生成服务待配置"
    : quota.hasActiveJob
      ? "已有任务进行中"
      : quota.dailyRemaining <= 0
        ? "今日次数已用完"
        : "";

  return (
    <section className="composer-panel" aria-labelledby="composer-title">
      <div className="panel-heading">
        <div>
          <span className="utility-label">NEW AVATAR</span>
          <h1 id="composer-title">创建个人形象</h1>
        </div>
        <span className="quota-label">今日剩余 {quota.dailyRemaining} 次</span>
      </div>

      <div className="style-segment" aria-label="形象风格">
        <button
          type="button"
          aria-pressed={style === "realistic"}
          onClick={() => selectStyle("realistic")}
        >
          写实数字人
        </button>
        <button
          type="button"
          aria-pressed={style === "cartoon"}
          onClick={() => selectStyle("cartoon")}
        >
          卡通潮玩
        </button>
      </div>

      <div className="photo-rail" aria-label="人物照片">
        {viewOptions.map((option) => (
          <PhotoSlot
            key={option.view}
            {...option}
            file={files[option.view]}
            disabled={style === "cartoon" && option.view !== "front"}
            onChange={setPhoto}
          />
        ))}
      </div>

      <label className="rights-check">
        <input
          type="checkbox"
          checked={rightsAccepted}
          onChange={(event) => setRightsAccepted(event.target.checked)}
        />
        <span className="check-indicator" aria-hidden="true"><Check size={14} /></span>
        <span>确认拥有照片使用授权，且照片中的人物同意本次生成</span>
      </label>

      <div className="cost-row">
        <span>本次只生成 1 个模型</span>
        <strong>预计 ¥{(costFen / 100).toFixed(2)}</strong>
      </div>
      {error ? <p className="composer-error" role="alert">{error}</p> : null}
      <button
        className="primary-command composer-submit"
        type="button"
        disabled={Boolean(blockedLabel) || pending}
        onClick={openConfirmation}
      >
        <Sparkles size={18} />
        {blockedLabel || (pending ? "正在创建" : "生成 3D 形象")}
      </button>

      {confirmOpen ? (
        <div className="confirm-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <span className="utility-label">COST CONFIRMATION</span>
            <h2 id="confirm-title">确认本次生成</h2>
            <dl>
              <div><dt>风格</dt><dd>{style === "realistic" ? "写实数字人" : "卡通潮玩"}</dd></div>
              <div><dt>照片</dt><dd>{selectedFiles.length} 张</dd></div>
              <div><dt>预计费用</dt><dd>¥{(costFen / 100).toFixed(2)}</dd></div>
            </dl>
            <div className="confirm-actions">
              <button className="secondary-command" type="button" onClick={() => setConfirmOpen(false)} disabled={pending}>
                取消
              </button>
              <button className="primary-command" type="button" onClick={() => void confirm()} disabled={pending}>
                {pending ? "正在创建" : "确认并生成"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
