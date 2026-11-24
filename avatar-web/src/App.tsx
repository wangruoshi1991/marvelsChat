import { LogOut, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { avatarApi, AvatarApiError, type AvatarApi } from "./api";
import { LoginView } from "./session/LoginView";
import type { AvatarBootstrap } from "./types";
import { EmbeddedAvatarViewer } from "./viewer/EmbeddedAvatarViewer";
import { AvatarWorkspace } from "./workspace/AvatarWorkspace";
import { clearAvatarSubmission } from "./workspace/avatarSubmission";

export function App({ api = avatarApi }: { api?: AvatarApi }) {
  const launchMode = new URLSearchParams(window.location.search).get("mode");
  const isAppLaunch = launchMode === "viewer";
  const requestedModelId = isAppLaunch
    ? new URLSearchParams(window.location.search).get("modelId") || ""
    : "";
  const [bootstrap, setBootstrap] = useState<AvatarBootstrap | null>(null);
  const [state, setState] = useState<"loading" | "login" | "workspace" | "error">("loading");
  const session = useRef(0);
  const [logoutError, setLogoutError] = useState("");

  const refresh = useCallback(async () => {
    const current = ++session.current;
    setState("loading");
    try {
      const next = await api.bootstrap();
      if (current !== session.current) return;
      setBootstrap(next);
      setState("workspace");
    } catch (cause) {
      if (current !== session.current) return;
      if (!isAppLaunch && cause instanceof AvatarApiError && cause.status === 401) {
        setLogoutError(clearAvatarSubmission() ? "" : "本页提交记录未能清除。");
        setBootstrap(null);
        setState("login");
      } else {
        setState("error");
      }
    }
  }, [api, isAppLaunch]);

  useEffect(() => {
    void refresh();
    return () => { session.current++; };
  }, [refresh]);

  if (state === "loading") {
    return (
      <main className="status-screen" aria-live="polite">
        <div className="status-spinner" />
        <p>{isAppLaunch ? "正在加载3D形象" : "正在恢复工作区"}</p>
      </main>
    );
  }

  if (state === "login") {
    return <><LoginView login={api.login} onAuthenticated={refresh} />
      {logoutError && <p role="alert">{logoutError}</p>}</>;
  }

  if (state === "error" || !bootstrap) {
    return (
      <main className="status-screen">
        <p>{isAppLaunch ? "3D形象暂时无法加载" : "工作区暂时无法加载"}</p>
        <button className="secondary-command" type="button" onClick={() => void refresh()}>
          <RotateCw size={18} />
          重试
        </button>
      </main>
    );
  }

  if (launchMode === "viewer") {
    return (
      <main className="embedded-shell">
        <EmbeddedAvatarViewer
          api={api}
          bootstrap={bootstrap}
          modelId={requestedModelId}
        />
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div className="workspace-brand">
          <span className="brand-mark">MX</span>
          <div>
            <strong>3D 个人形象</strong>
            <span>{bootstrap.user.displayName}</span>
          </div>
        </div>
        <button
          className="icon-command"
          type="button"
          title="退出登录"
          aria-label="退出登录"
          onClick={async () => {
            const current = ++session.current;
            const localCleared = clearAvatarSubmission();
            setLogoutError("");
            setBootstrap(null);
            setState("loading");
            const warnings = localCleared ? [] : ["本页提交记录未能清除。"];
            try {
              await api.logout();
            } catch {
              warnings.push("服务器注销未确认。");
            }
            if (current === session.current) {
              setLogoutError(warnings.join(""));
              setState("login");
            }
          }}
        >
          <LogOut size={19} />
        </button>
      </header>
      <AvatarWorkspace key={bootstrap.user.id} initialBootstrap={bootstrap} api={api} />
    </main>
  );
}
