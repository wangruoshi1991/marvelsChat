import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvatarComposer } from "./AvatarComposer";

const feature = {
  enabled: true,
  generationAvailable: true,
  dailyLimit: 3,
  retentionDays: 7,
  costVersion: "2026-07-17",
  estimatedCostsFen: { realistic: 210, cartoon: 224 },
};

const quota = { dailyUsed: 0, dailyRemaining: 3, hasActiveJob: false };

describe("AvatarComposer", () => {
  it("renders fixed photo views, switches prices, and requires a front photo plus rights", async () => {
    render(<AvatarComposer feature={feature} quota={quota} onCreate={vi.fn()} />);

    expect(screen.getAllByTestId("photo-slot")).toHaveLength(4);
    expect(screen.getByText("正面全身")).not.toBeNull();
    expect(screen.getByText("左侧")).not.toBeNull();
    expect(screen.getByText("背面")).not.toBeNull();
    expect(screen.getByText("右侧")).not.toBeNull();
    expect(screen.getByText("预计 ¥2.10")).not.toBeNull();
    expect(screen.getByText("今日剩余 3 次")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "卡通潮玩" }));
    expect(screen.getByText("预计 ¥2.24")).not.toBeNull();
    expect((screen.getByLabelText("左侧照片") as HTMLInputElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "生成 3D 形象" }));
    expect(screen.getByRole("alert").textContent).toContain("请添加正面全身照");
  });

  it("uses one confirmation and reuses the same idempotency key after a failed request", async () => {
    const onCreate = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    render(<AvatarComposer feature={feature} quota={quota} onCreate={onCreate} />);
    const front = new File([new Uint8Array([1, 2, 3])], "front.jpg", { type: "image/jpeg" });

    fireEvent.change(screen.getByLabelText("正面全身照片"), { target: { files: [front] } });
    await userEvent.click(screen.getByRole("checkbox", { name: /确认拥有照片使用授权/ }));
    await userEvent.click(screen.getByRole("button", { name: "生成 3D 形象" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "确认并生成" }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "生成 3D 形象" }));
    await userEvent.click(screen.getByRole("button", { name: "确认并生成" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));

    expect(onCreate.mock.calls[0][0].idempotencyKey).toBe(onCreate.mock.calls[1][0].idempotencyKey);
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it("disables paid creation while another task is active or quota is exhausted", () => {
    const { rerender } = render(
      <AvatarComposer
        feature={feature}
        quota={{ ...quota, hasActiveJob: true }}
        onCreate={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "已有任务进行中" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <AvatarComposer
        feature={feature}
        quota={{ ...quota, dailyRemaining: 0, dailyUsed: 3 }}
        onCreate={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "今日次数已用完" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
