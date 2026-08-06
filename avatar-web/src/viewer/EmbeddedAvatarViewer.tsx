import { lazy, Suspense } from "react";
import type { AvatarApi } from "../api";
import type { AvatarBootstrap } from "../types";

const AvatarViewer = lazy(() => import("./AvatarViewer").then((module) => ({
  default: module.AvatarViewer,
})));

export function EmbeddedAvatarViewer({
  api,
  bootstrap,
  modelId,
}: {
  api: AvatarApi;
  bootstrap: AvatarBootstrap;
  modelId: string;
}) {
  const model = bootstrap.models.find((item) => item.id === modelId) || null;

  return (
    <div className="embedded-viewer-stage">
      {model ? (
        <Suspense fallback={<div className="viewer-empty"><p>正在准备查看器</p></div>}>
          <AvatarViewer
            embedded
            model={model}
            modelUrl={api.modelFileUrl(model.id)}
            thumbnailUrl={model.thumbnailAvailable
              ? api.modelThumbnailUrl(model.id)
              : ""}
          />
        </Suspense>
      ) : (
        <div className="viewer-empty">
          <h2>暂无 3D 形象</h2>
        </div>
      )}
    </div>
  );
}
