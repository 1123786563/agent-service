import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  })
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn(),
  requireCreator: vi.fn()
}));

vi.mock("@/server/agents/package-service", () => ({
  createAgentPackageFromZip: vi.fn()
}));

import { POST } from "@/app/api/creator/agents/route";
import { redirect } from "next/navigation";
import { getCurrentUser, requireCreator } from "@/server/auth/session";
import { createAgentPackageFromZip } from "@/server/agents/package-service";

describe("creator upload route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(POST(new Request("http://localhost/api/creator/agents", {
      method: "POST",
      body: new FormData()
    }))).rejects.toThrow("REDIRECT:/login");

    expect(requireCreator).not.toHaveBeenCalled();
  });

  it("returns 403 when the creator is not whitelisted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      whitelistStatus: "INVITED"
    } as never);

    const response = await POST(new Request("http://localhost/api/creator/agents", {
      method: "POST",
      body: new FormData()
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Creator whitelist is required"]
    });
    expect(requireCreator).not.toHaveBeenCalled();
  });

  it("returns 400 when the upload is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      whitelistStatus: "ACTIVE"
    } as never);
    vi.mocked(requireCreator).mockResolvedValue({ id: "user-123" } as never);

    const request = new Request("http://localhost/api/creator/agents", {
      method: "POST",
      body: new FormData()
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["Missing ZIP file"]
    });
    expect(createAgentPackageFromZip).not.toHaveBeenCalled();
  });

  it("returns validation errors from package creation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      whitelistStatus: "ACTIVE"
    } as never);
    vi.mocked(requireCreator).mockResolvedValue({ id: "user-123" } as never);
    vi.mocked(createAgentPackageFromZip).mockResolvedValue({
      ok: false,
      errors: ["Missing required file: README.md"],
      risks: ["script.file:setup.sh"]
    });

    const formData = new FormData();
    formData.set("file", new File([Buffer.from("zip-bytes")], "agent.zip", { type: "application/zip" }));

    const response = await POST(new Request("http://localhost/api/creator/agents", {
      method: "POST",
      body: formData
    }));

    expect(response.status).toBe(400);
    expect(createAgentPackageFromZip).toHaveBeenCalledWith({
      ownerId: "user-123",
      fileName: "agent.zip",
      buffer: Buffer.from("zip-bytes")
    });
    await expect(response.json()).resolves.toEqual({
      errors: ["Missing required file: README.md"],
      risks: ["script.file:setup.sh"]
    });
  });

  it("redirects to the package detail page after a successful upload", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      whitelistStatus: "ACTIVE"
    } as never);
    vi.mocked(requireCreator).mockResolvedValue({ id: "user-123" } as never);
    vi.mocked(createAgentPackageFromZip).mockResolvedValue({
      ok: true,
      package: {
        slug: "research-assistant-1-0-0"
      },
      storage: {
        url: "/api/uploads/file.zip",
        fileName: "file.zip",
        sizeBytes: 42
      },
      risks: []
    } as never);

    const formData = new FormData();
    formData.set("file", new File([Buffer.from("zip-bytes")], "agent.zip", { type: "application/zip" }));

    await expect(POST(new Request("http://localhost/api/creator/agents", {
      method: "POST",
      body: formData
    }))).rejects.toThrow("REDIRECT:/agents/research-assistant-1-0-0");

    expect(redirect).toHaveBeenCalledWith("/agents/research-assistant-1-0-0");
  });
});
