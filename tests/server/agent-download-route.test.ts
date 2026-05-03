import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("@/server/agents/package-service", () => ({
  incrementPublishedAgentPackageDownloadCount: vi.fn()
}));

vi.mock("@/server/storage/download-authorization", () => ({
  authorizeAgentZipDownload: vi.fn()
}));

vi.mock("@/server/storage/download-tickets", () => ({
  createDownloadTicket: vi.fn(() => "signed-ticket"),
  verifyDownloadTicket: vi.fn()
}));

vi.mock("@/server/storage/local-storage", () => ({
  readStoredZip: vi.fn()
}));

vi.mock("@/server/audit/service", () => ({
  recordAuditLog: vi.fn()
}));

import { GET } from "@/app/api/agents/[slug]/download/route";
import {
  incrementPublishedAgentPackageDownloadCount
} from "@/server/agents/package-service";
import { recordAuditLog } from "@/server/audit/service";
import { authorizeAgentZipDownload } from "@/server/storage/download-authorization";
import { readStoredZip } from "@/server/storage/local-storage";
import { createDownloadTicket, verifyDownloadTicket } from "@/server/storage/download-tickets";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent download route", () => {
  it("returns the stored zip for a published package", async () => {
    vi.mocked(authorizeAgentZipDownload).mockResolvedValue({
      actorScope: "anonymous",
      resourceType: "agent_zip",
      resourceId: "pkg-1",
      objectKey: "agents/stored-file.zip",
      resourceVersion: "2026-05-03T00:00:00.000Z",
      fileName: "stored-file.zip",
      slug: "research-assistant-1-0-0"
    });
    vi.mocked(readStoredZip).mockResolvedValue(Buffer.from("zip-bytes"));

    const response = await GET(new Request("http://localhost/api/agents/research-assistant-1-0-0/download"), {
      params: Promise.resolve({ slug: "research-assistant-1-0-0" })
    });

    expect(createDownloadTicket).toHaveBeenCalled();
    expect(verifyDownloadTicket).toHaveBeenCalledWith("signed-ticket", {
      audience: "agent-download"
    });
    expect(incrementPublishedAgentPackageDownloadCount).toHaveBeenCalledWith("research-assistant-1-0-0");
    expect(readStoredZip).toHaveBeenCalledWith("stored-file.zip");
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "asset.download",
      targetType: "AgentPackage",
      targetId: "pkg-1"
    }));
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="research-assistant-1-0-0.zip"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("zip-bytes"));
  });

  it("returns not found for an unknown package slug", async () => {
    vi.mocked(authorizeAgentZipDownload).mockRejectedValue(new Error("Agent package not found"));

    await expect(GET(new Request("http://localhost/api/agents/missing/download"), {
      params: Promise.resolve({ slug: "missing" })
    })).rejects.toThrow("NOT_FOUND");

    expect(incrementPublishedAgentPackageDownloadCount).not.toHaveBeenCalled();
  });
});
