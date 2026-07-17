import { Maximize2, Minimize2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AvatarModel } from "../types";
import { createModelScene, type ModelScene } from "./modelScene";

interface AvatarViewerProps {
  model: AvatarModel | null;
  modelUrl: string;
  thumbnailUrl: string;
  onDelete: (modelId: string) => Promise<void>;
  sceneFactory?: (canvas: HTMLCanvasElement) => ModelScene;
}

export function AvatarViewer({
  model,
  modelUrl,
  thumbnailUrl,
  onDelete,
  sceneFactory = createModelScene,
}: AvatarViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ModelScene | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasModel = Boolean(model);

  useEffect(() => {
    if (!hasModel || !canvasRef.current) return undefined;
    const scene = sceneFactory(canvasRef.current);
    sceneRef.current = scene;
    const resize = () => {
      const bounds = containerRef.current?.getBoundingClientRect();
      scene.resize(bounds?.width || 1, bounds?.height || 1);
    };
    resize();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function" && containerRef.current) {
      observer = new ResizeObserver(resize);
      observer.observe(containerRef.current);
    } else {
      window.addEventListener("resize", resize);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [hasModel, sceneFactory]);

  useEffect(() => {
    if (!model || !modelUrl || !sceneRef.current) return undefined;
    let cancelled = false;
    setLoadState("loading");
    sceneRef.current.load(modelUrl)
      .then(() => {
        if (!cancelled) {
          const snapshot = sceneRef.current?.getFramingSnapshot();
          if (canvasRef.current && snapshot) {
            canvasRef.current.dataset.frameRadius = String(snapshot.radius);
            canvasRef.current.dataset.cameraDistance = String(snapshot.cameraDistance);
            canvasRef.current.dataset.cameraAspect = String(snapshot.aspect);
          }
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [model?.id, modelUrl]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  if (!model) {
    return (
      <div className="viewer-empty">
        <span className="utility-label">MODEL VIEWER</span>
        <h2>暂无 3D 模型</h2>
      </div>
    );
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current?.requestFullscreen();
    }
  };

  const deleteSelected = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(model.id);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="avatar-viewer" ref={containerRef} data-testid="avatar-viewer">
      {thumbnailUrl && loadState !== "ready" ? (
        <img className="viewer-poster" src={thumbnailUrl} alt="" aria-hidden="true" />
      ) : null}
      <canvas ref={canvasRef} aria-label={`${model.title} 3D 预览`} />
      <div className="viewer-toolbar" aria-label="模型查看工具">
        <button type="button" title="重置视角" aria-label="重置视角" onClick={() => sceneRef.current?.resetCamera()}>
          <RotateCcw size={18} />
        </button>
        <button
          type="button"
          title={isFullscreen ? "退出全屏" : "进入全屏"}
          aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
          onClick={() => void toggleFullscreen()}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button className="danger-tool" type="button" title="删除模型" aria-label="删除模型" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="viewer-caption">
        <span className="utility-label">PRIVATE MODEL</span>
        <h2>{model.title}</h2>
        <p>{(model.byteSize / 1024 / 1024).toFixed(1)} MB</p>
      </div>
      {loadState === "loading" ? <div className="viewer-state">正在加载模型</div> : null}
      {loadState === "error" ? <div className="viewer-state is-error">模型暂时无法显示</div> : null}

      {confirmDelete ? (
        <div className="confirm-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-model-title">
            <span className="utility-label">DELETE MODEL</span>
            <h2 id="delete-model-title">删除这个模型？</h2>
            <p className="delete-warning">删除后无法恢复。</p>
            <div className="confirm-actions">
              <button className="secondary-command" type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                取消
              </button>
              <button className="danger-command" type="button" disabled={deleting} onClick={() => void deleteSelected()}>
                {deleting ? "正在删除" : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
