import { LogOut, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { avatarApi, AvatarApiError, type AvatarApi } from "./api";
import { LoginView } from "./session/LoginView";
import type { AvatarBootstrap } from "./types";
import { AvatarWorkspace } from "./workspace/AvatarWorkspace";

export function App({ api = avatarApi }: { api?: AvatarApi }) {
  const [bootstrap, setBootstrap] = useState<AvatarBootstrap | null>(null);
  const [state, setState] = useState<"loading" | "login" | "workspace" | "error">("loading");

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const next = await api.bootstrap();
      setBootstrap(next);
      setState("workspace");
    } catch (cause) {
      if (cause instanceof AvatarApiError && cause.status === 401) {
        setState("login");
      } else {
        setState("error");
      }
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state === "loading") {
    return (
      <main className="status-screen" aria-live="polite">
        <div className="status-spinner" />
        <p>正在恢复工作区</p>
      </main>
    );
  }

  if (state === "login") {
    return <LoginView login={api.login} onAuthenticated={refresh} />;
  }

  if (state === "error" || !bootstrap) {
    return (
      <main className="status-screen">
        <p>工作区暂时无法加载</p>
        <button className="secondary-command" type="button" onClick={() => void refresh()}>
          <RotateCw size={18} />
          重试
        </button>
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
          onClick={() => void api.logout().then(() => {
            setBootstrap(null);
            setState("login");
          })}
        >
          <LogOut size={19} />
        </button>
      </header>
      <AvatarWorkspace initialBootstrap={bootstrap} api={api} />
    </main>
  );
}
