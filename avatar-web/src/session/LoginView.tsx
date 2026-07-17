import { ArrowRight, LockKeyhole, ScanFace } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AvatarApiError } from "../api";
import type { AvatarSession } from "../types";

interface LoginViewProps {
  login: (credentials: { identifier: string; password: string }) => Promise<AvatarSession>;
  onAuthenticated: (session: AvatarSession) => void | Promise<void>;
}

export function LoginView({ login, onAuthenticated }: LoginViewProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const session = await login({ identifier: identifier.trim(), password });
      await onAuthenticated(session);
    } catch (cause) {
      const apiError = cause instanceof AvatarApiError ? cause : null;
      setError(apiError?.status === 401
        ? "账号或密码不正确"
        : "暂时无法登录，请稍后重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login-shell">
      <header className="brand-bar" aria-label="妙讯">
        <span className="brand-mark">MX</span>
        <span className="brand-name">妙讯</span>
        <span className="brand-product">3D 个人形象</span>
      </header>

      <section className="login-layout">
        <div className="capture-volume" aria-hidden="true">
          <div className="capture-volume-label">PERSONAL VOLUME / 01</div>
          <div className="capture-guide">
            <span className="guide-corner corner-a" />
            <span className="guide-corner corner-b" />
            <span className="guide-corner corner-c" />
            <span className="guide-corner corner-d" />
            <ScanFace size={104} strokeWidth={0.8} />
          </div>
          <div className="capture-ticks" />
        </div>

        <div className="login-panel">
          <div className="login-heading">
            <span className="utility-label">PRIVATE WORKSPACE</span>
            <h1>继续创建你的<br />3D 个人形象</h1>
          </div>
          <form className="login-form" onSubmit={submit}>
            <label>
              <span>账号</span>
              <input
                name="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </label>
            <label>
              <span>密码</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-command" type="submit" disabled={pending}>
              <LockKeyhole size={18} aria-hidden="true" />
              <span>{pending ? "正在登录" : "登录"}</span>
              {!pending ? <ArrowRight size={18} aria-hidden="true" /> : null}
            </button>
          </form>
          <p className="privacy-note">仅限已获授权的测试账号</p>
        </div>
      </section>
    </main>
  );
}
