import { Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AvatarFeature,
  AvatarPhotoView,
  AvatarQualityPreset,
  AvatarReferences,
} from "../types";

const viewLabels: Record<AvatarPhotoView, string> = {
  front: "正面",
  left: "左侧",
  back: "背面",
  right: "右侧",
};

interface ReferenceConfirmationProps {
  references: AvatarReferences;
  feature: AvatarFeature;
  imageUrl: (view: AvatarPhotoView) => string;
  pending: boolean;
  onConfirm: (qualityPreset: AvatarQualityPreset) => Promise<void>;
  onReject: () => Promise<void>;
}

export function ReferenceConfirmation({
  references,
  feature,
  imageUrl,
  pending,
  onConfirm,
  onReject,
}: ReferenceConfirmationProps) {
  const orderedImages = useMemo(
    () => [...references.images].sort((left, right) => left.sequenceIndex - right.sequenceIndex),
    [references.images],
  );
  const [selectedView, setSelectedView] = useState<AvatarPhotoView>(
    orderedImages[0]?.view || "front",
  );
  const [qualityPreset, setQualityPreset] = useState<AvatarQualityPreset>(
    feature.defaultQualityPreset,
  );
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!orderedImages.some((image) => image.view === selectedView)) {
      setSelectedView(orderedImages[0]?.view || "front");
    }
  }, [orderedImages, selectedView]);

  const selectedQuality = feature.qualityPresets.find(({ id }) => id === qualityPreset)
    || feature.qualityPresets[0];

  const run = async (action: () => Promise<void>) => {
    setActionError("");
    try {
      await action();
    } catch {
      setActionError("操作未完成，请稍后重试");
    }
  };

  return (
    <div className="reference-confirmation">
      <div className="reference-focus">
        <img src={imageUrl(selectedView)} alt={`${viewLabels[selectedView]}四视图`} />
        <span>{viewLabels[selectedView]}</span>
      </div>
      <div className="reference-strip" aria-label="四视图">
        {orderedImages.map((image) => (
          <button
            key={image.id}
            type="button"
            aria-pressed={selectedView === image.view}
            aria-label={`查看${viewLabels[image.view]}`}
            onClick={() => setSelectedView(image.view)}
          >
            <img src={imageUrl(image.view)} alt="" />
            <span>{viewLabels[image.view]}</span>
          </button>
        ))}
      </div>

      <div className="reference-decision">
        <div className="reference-quality">
          <div>
            <strong>3D 生成精度</strong>
            <small>{selectedQuality?.description}</small>
          </div>
          <div className="quality-segment" aria-label="3D 生成精度">
            {feature.qualityPresets.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={qualityPreset === option.id}
                onClick={() => setQualityPreset(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="reference-cost">
          <span>确认后开始 3D 建模</span>
          <strong>预计 ¥{((selectedQuality?.estimatedCostFen || 0) / 100).toFixed(2)}</strong>
        </div>
        {actionError ? <p className="composer-error" role="alert">{actionError}</p> : null}
        <div className="reference-actions">
          <button
            className="secondary-command"
            type="button"
            disabled={pending}
            onClick={() => void run(onReject)}
          >
            <X size={18} />
            不使用这组四视图
          </button>
          <button
            className="primary-command"
            type="button"
            disabled={pending || orderedImages.length !== 4}
            onClick={() => void run(() => onConfirm(qualityPreset))}
          >
            <Check size={18} />
            {pending ? "正在确认" : "确认四视图并生成 3D"}
          </button>
        </div>
      </div>
    </div>
  );
}
