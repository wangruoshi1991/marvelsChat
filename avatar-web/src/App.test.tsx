import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { avatarApi } from "./api";
import type { AvatarBootstrap } from "./types";

vi.mock("./workspace/AvatarWorkspace", () => ({ AvatarWorkspace: () => null }));

it("ends the server session and returns to login when tab storage cannot be cleared", async () => {
  const removeItem = vi.fn(() => {
    throw new DOMException("Storage unavailable", "SecurityError");
  });
  vi.stubGlobal("sessionStorage", { removeItem });
  try {
    const api = {
      ...avatarApi,
      bootstrap: vi.fn().mockResolvedValue({ user: { id: "owner", displayName: "QA" } } as AvatarBootstrap),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    render(<App api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "退出登录" }));
    expect((await screen.findByRole("alert")).textContent).toBe("本页提交记录未能清除。");
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
