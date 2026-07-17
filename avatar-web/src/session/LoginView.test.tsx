import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvatarApiError } from "../api";
import { LoginView } from "./LoginView";

describe("LoginView", () => {
  it("submits credentials once, disables while pending, and keeps session data out of storage", async () => {
    let resolveLogin: ((value: { user: { id: string; displayName: string }; csrfToken: string }) => void) | undefined;
    const login = vi.fn(() => new Promise<{ user: { id: string; displayName: string }; csrfToken: string }>((resolve) => {
      resolveLogin = resolve;
    }));
    const onAuthenticated = vi.fn();
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(<LoginView login={login} onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("账号"), "person@example.com");
    await user.type(screen.getByLabelText("密码"), "Password1");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(login).toHaveBeenCalledWith({
      identifier: "person@example.com",
      password: "Password1",
    });
    expect((screen.getByRole("button", { name: "正在登录" }) as HTMLButtonElement).disabled).toBe(true);

    resolveLogin?.({
      user: { id: "user-1", displayName: "Person" },
      csrfToken: "csrf-in-memory",
    });
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("shows generic copy for invalid credentials and never renders raw backend text", async () => {
    const login = vi.fn().mockRejectedValue(new AvatarApiError({
      status: 401,
      code: "AUTH_FAILED",
      requestId: "request-123",
    }));
    render(<LoginView login={login} onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: "登录" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toContain("账号或密码不正确");
    expect(screen.queryByText("Invalid login credentials.")).toBeNull();
  });
});
