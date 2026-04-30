import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("@/server/agents/package-service", () => ({
  getPublishedAgentPackageBySlug: vi.fn()
}));

vi.mock("@/server/storage/local-storage", () => ({
  readStoredZip: vi.fn()
}));

import { GET } from "@/app/api/agents/[slug]/download/route";
import { getPublishedAgentPackageBySlug } from "@/server/agents/package-service";
import { readStoredZip } from "@/server/storage/local-storage";

describe("agent download route", () => {
  it("returns the stored zip for a published package", async () => {
    vi.mocked(getPublishedAgentPackageBySlug).mockResolvedValue({
      slug: "research-assistant-1-0-0",
      zipFileName: "stored-file.zip"
    } as never);
    vi.mocked(readStoredZip).mockResolvedValue(Buffer.from("zip-bytes"));

    const response = await GET(new Request("http://localhost/api/agents/research-assistant-1-0-0/download"), {
      params: Promise.resolve({ slug: "research-assistant-1-0-0" })
    });

    expect(readStoredZip).toHaveBeenCalledWith("stored-file.zip");
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="research-assistant-1-0-0.zip"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("zip-bytes"));
  });

  it("returns not found for an unknown package slug", async () => {
    vi.mocked(getPublishedAgentPackageBySlug).mockResolvedValue(null);

    await expect(GET(new Request("http://localhost/api/agents/missing/download"), {
      params: Promise.resolve({ slug: "missing" })
    })).rejects.toThrow("NOT_FOUND");
  });
});
