import { describe, expect, it, vi } from "vitest";
import { createAvatarApi } from "./api";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "x-request-id": "request-1" },
});

describe("avatarApi", () => {
  it("uses same-origin cookies and keeps CSRF only in client memory", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { user: { id: "u" }, csrfToken: "csrf-1" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { deleted: true } }));
    const api = createAvatarApi(fetcher);

    await api.login({ identifier: "person@example.com", password: "Password1" });
    await api.logout();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/avatar-3d/session", expect.objectContaining({
      credentials: "same-origin",
      method: "POST",
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/avatar-3d/session", expect.objectContaining({
      credentials: "same-origin",
      method: "DELETE",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-1" }),
    }));
    expect(JSON.stringify(api)).not.toContain("csrf-1");
  });

  it("binds four-view confirmation to the exact set, quality, and cost version", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { user: { id: "u" }, csrfToken: "csrf-2" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { job: { id: "job-1" } } }));
    const api = createAvatarApi(fetcher);

    await api.login({ identifier: "person@example.com", password: "Password1" });
    await api.confirmReferences("job-1", {
      referenceSetId: "reference-set-1",
      qualityPreset: "ultra",
      acceptedCostVersion: "2026-07-21",
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/avatar-3d/jobs/job-1/references/confirm",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-2",
        }),
        body: JSON.stringify({
          referenceSetId: "reference-set-1",
          qualityPreset: "ultra",
          acceptedCostVersion: "2026-07-21",
          accepted: true,
        }),
      }),
    );
  });
});
