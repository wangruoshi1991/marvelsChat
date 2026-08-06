import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvatarComposer } from "./AvatarComposer";

const feature = {
  enabled: true,
  generationAvailable: true,
  dailyLimit: 3,
  retentionDays: 7,
  costVersion: "2026-07-21",
  referenceGenerationEstimatedCostFen: 200,
  defaultQualityPreset: "ultra" as const,
  qualityPresets: [
    {
      id: "standard" as const,
      label: "标准",
      description: "高清纹理，适合个人主页和日常查看",
      estimatedCostFen: 280,
    },
    {
      id: "ultra" as const,
      label: "精细",
      description: "适合大屏查看和专业处理",
      estimatedCostFen: 420,
    },
  ],
};

const quota = { dailyUsed: 0, dailyRemaining: 3, hasActiveJob: false };

const addRequiredConsents = async () => {
  await userEvent.click(screen.getByRole("checkbox", { name: /照片使用授权/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: /补全未展示/ }));
};

describe("AvatarComposer", () => {
  it("uses one face photo and separates the reference-image cost", async () => {
    render(<AvatarComposer feature={feature} quota={quota} onCreate={vi.fn()} />);

    expect(screen.getByLabelText("正面脸照")).not.toBeNull();
    expect(screen.queryByLabelText("左侧照片")).toBeNull();
    expect(screen.getByText("预计 ¥2.00")).not.toBeNull();
    expect(screen.getByText("今日剩余 3 次")).not.toBeNull();
    expect(screen.getByRole("button", { name: "匀称" }).getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: "生成四视图" }));
    expect(screen.getByRole("alert").textContent).toContain("请添加正面脸照");
  });

  it("keeps advisory photos usable and reuses the idempotency key after ambiguity", async () => {
    const onCreate = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const inspectPhoto = vi.fn().mockResolvedValue({
      status: "advisory",
      message: "照片仍可继续；清晰展示五官会更接近本人",
    });
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    render(
      <AvatarComposer
        feature={feature}
        quota={quota}
        onCreate={onCreate}
        inspectPhoto={inspectPhoto}
      />,
    );
    const face = new File([new Uint8Array([1, 2, 3])], "face.jpg", { type: "image/jpeg" });

    fireEvent.change(screen.getByLabelText("正面脸照"), { target: { files: [face] } });
    expect(await screen.findByText("照片仍可继续；清晰展示五官会更接近本人")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "运动感" }));
    await userEvent.selectOptions(screen.getByLabelText("服装方向"), "sport");
    await userEvent.type(screen.getByLabelText("补充要求"), "蓝白色运动套装");
    await addRequiredConsents();

    await userEvent.click(screen.getByRole("button", { name: "生成四视图" }));
    expect(screen.getByRole("dialog").textContent).toContain("预计费用¥2.00");
    expect(screen.getByRole("dialog").textContent).toContain("确认效果后才会开始 3D 建模");
    await userEvent.click(screen.getByRole("button", { name: "确认并生成四视图" }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "生成四视图" }));
    await userEvent.click(screen.getByRole("button", { name: "确认并生成四视图" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));

    expect(onCreate.mock.calls[0][0].idempotencyKey).toBe(onCreate.mock.calls[1][0].idempotencyKey);
    expect(onCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
      file: face,
      bodyShape: "athletic",
      outfit: "sport",
      userDescription: "蓝白色运动套装",
      qualityPreset: "ultra",
      acceptedReferenceCostVersion: "2026-07-21",
    }));
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it("blocks only technically invalid photos and disables creation for active quota", async () => {
    const inspectPhoto = vi.fn().mockResolvedValue({
      status: "invalid",
      message: "照片无法读取",
    });
    const { rerender } = render(
      <AvatarComposer
        feature={feature}
        quota={quota}
        onCreate={vi.fn()}
        inspectPhoto={inspectPhoto}
      />,
    );
    const face = new File([new Uint8Array([1, 2, 3])], "face.jpg", { type: "image/jpeg" });

    fireEvent.change(screen.getByLabelText("正面脸照"), { target: { files: [face] } });
    expect(await screen.findByText("照片无法读取")).not.toBeNull();
    await addRequiredConsents();
    await userEvent.click(screen.getByRole("button", { name: "生成四视图" }));
    expect(screen.getByRole("alert").textContent).toContain("这张照片无法使用");
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <AvatarComposer
        feature={feature}
        quota={{ ...quota, hasActiveJob: true }}
        onCreate={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "已有任务进行中" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
