import { AgentPackageStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createAgentZip } from "@/test/fixtures";
import {
  createAgentPackageFromZip,
  getPublishedAgentPackageBySlug,
  getAgentPackageCompleteness,
  isAgentPackageServiceAvailable,
  getAgentPackageConversionMetrics,
  incrementPublishedAgentPackageDownloadCount,
  listPublishedAgentPackages,
  resolveUniquePackageSlug,
  slugifyPackageName
} from "@/server/agents/package-service";
import { validateAgentZip } from "@/server/agents/zip-validator";

describe("package service helpers", () => {
  it("slugifies package names conservatively", () => {
    expect(slugifyPackageName("Research Assistant v2")).toBe("research-assistant-v2");
    expect(resolveUniquePackageSlug("research-assistant", ["research-assistant", "research-assistant-2"])).toBe(
      "research-assistant-3"
    );
  });

  it("computes package completeness from market-facing metadata", () => {
    expect(getAgentPackageCompleteness({
      summary: "Summarizes research findings.",
      categories: ["research"],
      skills: [{ description: "Finds sources." }],
      workflows: [{ description: "Default flow." }],
      metadataJson: {
        author: { name: "Creator" },
        service: { available: true, types: ["customization"] }
      }
    }).score).toBe(100);

    expect(getAgentPackageCompleteness({
      summary: "",
      categories: [],
      skills: [{ description: "" }],
      workflows: [],
      metadataJson: {}
    }).score).toBe(0);
  });

  it("detects whether a package exposes paid services", () => {
    expect(isAgentPackageServiceAvailable({
      service: { available: true, types: ["customization"] }
    })).toBe(true);

    expect(isAgentPackageServiceAvailable({
      service: { available: false, types: ["customization"] }
    })).toBe(false);

    expect(isAgentPackageServiceAvailable({})).toBe(false);
  });

  it("computes package conversion metrics from consultations and orders", () => {
    expect(getAgentPackageConversionMetrics({
      downloadCount: 20,
      consultations: [
        { orders: [{ status: "COMPLETED" }] },
        { orders: [{ status: "IN_PROGRESS" }] }
      ]
    })).toEqual({
      downloads: 20,
      consultations: 2,
      orders: 2,
      completedOrders: 1,
      consultationRate: 10,
      completionRate: 50,
      conversionScore: 70
    });
  });
});

describe("createAgentPackageFromZip", () => {
  it("returns validation errors without storing or persisting invalid zips", async () => {
    const saveUploadedZip = vi.fn();
    const createPackage = vi.fn();

    const result = await createAgentPackageFromZip(
      {
        ownerId: "user-123",
        buffer: Buffer.from("not-a-zip"),
        fileName: "broken.zip"
      },
      {
        validateZip: validateAgentZip,
        storage: {
          saveUploadedZip,
          readStoredZip: vi.fn(),
          deleteStoredZip: vi.fn()
        },
        packageStore: {
          createPackage,
          findSlugsWithPrefix: vi.fn(),
          listPublishedPackages: vi.fn(),
          findPublishedPackageBySlug: vi.fn(),
          incrementDownloadCount: vi.fn()
        }
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Uploaded file is not a readable ZIP archive");
    expect(saveUploadedZip).not.toHaveBeenCalled();
    expect(createPackage).not.toHaveBeenCalled();
  });

  it("stores validated zips and persists package records", async () => {
    const zipBuffer = await createAgentZip();
    const validation = await validateAgentZip(zipBuffer);
    const saveUploadedZip = vi.fn().mockResolvedValue({
      url: "/api/uploads/research-assistant-a1b2c3d4.zip",
      fileName: "research-assistant-a1b2c3d4.zip",
      sizeBytes: zipBuffer.byteLength
    });
    const findSlugsWithPrefix = vi.fn().mockResolvedValue(["research-assistant"]);
    const createdPackage = {
      id: "pkg-123",
      ownerId: "user-123",
      name: validation.metadata?.name,
      slug: "research-assistant-2",
      version: validation.metadata?.version,
      summary: validation.metadata?.summary,
      categories: validation.metadata?.categories,
      metadataJson: validation.metadata,
      zipFileUrl: "/api/uploads/research-assistant-a1b2c3d4.zip",
      zipFileName: "research-assistant-a1b2c3d4.zip",
      zipSizeBytes: zipBuffer.byteLength,
      coverUrl: null,
      downloadCount: 0,
      status: AgentPackageStatus.PUBLISHED,
      validationResult: {
        errors: [],
        risks: validation.risks,
        fileNames: validation.fileNames
      },
      publishedAt: new Date("2026-04-30T00:00:00.000Z"),
      createdAt: new Date("2026-04-30T00:00:00.000Z"),
      updatedAt: new Date("2026-04-30T00:00:00.000Z"),
      owner: { id: "user-123", email: "user@example.com" },
      skills: validation.metadata?.skills ?? [],
      workflows: validation.metadata?.workflows ?? []
    };
    const createPackage = vi.fn().mockResolvedValue(createdPackage);

    const result = await createAgentPackageFromZip({
      ownerId: "user-123",
      buffer: zipBuffer,
      fileName: "Research Assistant.zip"
    }, {
      validateZip: validateAgentZip,
      storage: {
        saveUploadedZip,
        readStoredZip: vi.fn(),
        deleteStoredZip: vi.fn()
      },
      packageStore: {
        createPackage,
        findSlugsWithPrefix,
        listPublishedPackages: vi.fn(),
        findPublishedPackageBySlug: vi.fn(),
        incrementDownloadCount: vi.fn()
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected package creation to succeed");
    }

    expect(saveUploadedZip).toHaveBeenCalledWith(zipBuffer, "Research Assistant.zip");
    expect(findSlugsWithPrefix).toHaveBeenCalledWith("research-assistant");
    expect(createPackage).toHaveBeenCalledWith({
      data: {
        ownerId: "user-123",
        name: validation.metadata?.name,
        slug: "research-assistant-2",
        version: validation.metadata?.version,
        summary: validation.metadata?.summary,
        categories: validation.metadata?.categories,
        metadataJson: validation.metadata,
        zipFileUrl: "/api/uploads/research-assistant-a1b2c3d4.zip",
        zipFileName: "research-assistant-a1b2c3d4.zip",
        zipSizeBytes: zipBuffer.byteLength,
        downloadCount: 0,
        validationResult: {
          errors: [],
          risks: validation.risks,
          fileNames: validation.fileNames
        },
        status: AgentPackageStatus.PUBLISHED,
        publishedAt: expect.any(Date),
        skills: {
          create: validation.metadata?.skills
        },
        workflows: {
          create: validation.metadata?.workflows
        }
      },
      include: {
        owner: true,
        skills: true,
        workflows: true
      }
    });
    expect(result.package.slug).toBe("research-assistant-2");
  });

  it("deletes the stored zip when persistence fails after upload", async () => {
    const zipBuffer = await createAgentZip();
    const saveUploadedZip = vi.fn().mockResolvedValue({
      url: "/api/uploads/research-assistant-a1b2c3d4.zip",
      fileName: "research-assistant-a1b2c3d4.zip",
      sizeBytes: zipBuffer.byteLength
    });
    const deleteStoredZip = vi.fn().mockResolvedValue(undefined);
    const createPackage = vi.fn().mockRejectedValue(new Error("database offline"));

    await expect(
      createAgentPackageFromZip({
        ownerId: "user-123",
        buffer: zipBuffer,
        fileName: "Research Assistant.zip"
      }, {
        validateZip: validateAgentZip,
        storage: {
          saveUploadedZip,
          readStoredZip: vi.fn(),
          deleteStoredZip
        },
        packageStore: {
          createPackage,
          findSlugsWithPrefix: vi.fn().mockResolvedValue([]),
          listPublishedPackages: vi.fn(),
          findPublishedPackageBySlug: vi.fn(),
          incrementDownloadCount: vi.fn()
        }
      })
    ).rejects.toThrow("database offline");

    expect(deleteStoredZip).toHaveBeenCalledWith("research-assistant-a1b2c3d4.zip");
  });

  it("retries with a new slug after a slug uniqueness conflict", async () => {
    const zipBuffer = await createAgentZip();
    const saveUploadedZip = vi.fn().mockResolvedValue({
      url: "/api/uploads/research-assistant-a1b2c3d4.zip",
      fileName: "research-assistant-a1b2c3d4.zip",
      sizeBytes: zipBuffer.byteLength
    });
    const createPackage = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2002", meta: { target: ["slug"] } })
      .mockResolvedValueOnce({ slug: "research-assistant-4" });

    const result = await createAgentPackageFromZip({
      ownerId: "user-123",
      buffer: zipBuffer,
      fileName: "Research Assistant.zip"
    }, {
      validateZip: validateAgentZip,
      storage: {
        saveUploadedZip,
        readStoredZip: vi.fn(),
        deleteStoredZip: vi.fn()
      },
      packageStore: {
        createPackage,
        findSlugsWithPrefix: vi.fn().mockResolvedValue(["research-assistant", "research-assistant-2"]),
        listPublishedPackages: vi.fn(),
        findPublishedPackageBySlug: vi.fn(),
        incrementDownloadCount: vi.fn()
      }
    });

    expect(result.ok).toBe(true);
    expect(createPackage).toHaveBeenCalledTimes(2);
    expect(createPackage.mock.calls[0][0].data.slug).toBe("research-assistant-3");
    expect(createPackage.mock.calls[1][0].data.slug).toBe("research-assistant-4");
  });
});

describe("published package queries", () => {
  it("lists and fetches published packages only", async () => {
    const listPublishedPackages = vi.fn().mockResolvedValue([{ slug: "published-agent" }]);
    const findPublishedPackageBySlug = vi.fn().mockResolvedValue({ slug: "published-agent" });
    const incrementDownloadCount = vi.fn().mockResolvedValue(undefined);
    const deps = {
      validateZip: vi.fn(),
      storage: {
        saveUploadedZip: vi.fn(),
        readStoredZip: vi.fn(),
        deleteStoredZip: vi.fn()
      },
      packageStore: {
        createPackage: vi.fn(),
        findSlugsWithPrefix: vi.fn(),
        listPublishedPackages,
        findPublishedPackageBySlug,
        incrementDownloadCount
      }
    };

    await expect(listPublishedAgentPackages({ query: "published", sort: "downloads" }, deps)).resolves.toEqual([
      { slug: "published-agent" }
    ]);
    await expect(getPublishedAgentPackageBySlug("published-agent", deps)).resolves.toEqual({ slug: "published-agent" });
    await expect(incrementPublishedAgentPackageDownloadCount("published-agent", deps)).resolves.toBeUndefined();

    expect(listPublishedPackages).toHaveBeenCalledWith({
      query: "published",
      category: "",
      sort: "downloads"
    });
    expect(findPublishedPackageBySlug).toHaveBeenCalledWith("published-agent");
    expect(incrementDownloadCount).toHaveBeenCalledWith("published-agent");
  });

  it("sorts published packages by derived conversion metrics", async () => {
    const listPublishedPackages = vi.fn().mockResolvedValue([
      {
        slug: "low-conversion",
        downloadCount: 50,
        consultations: []
      },
      {
        slug: "high-conversion",
        downloadCount: 10,
        consultations: [
          { orders: [{ status: "COMPLETED" }] },
          { orders: [{ status: "IN_PROGRESS" }] }
        ]
      }
    ]);
    const deps = {
      validateZip: vi.fn(),
      storage: {
        saveUploadedZip: vi.fn(),
        readStoredZip: vi.fn(),
        deleteStoredZip: vi.fn()
      },
      packageStore: {
        createPackage: vi.fn(),
        findSlugsWithPrefix: vi.fn(),
        listPublishedPackages,
        findPublishedPackageBySlug: vi.fn(),
        incrementDownloadCount: vi.fn()
      }
    };

    await expect(listPublishedAgentPackages({ sort: "conversion" }, deps)).resolves.toEqual([
      {
        slug: "high-conversion",
        downloadCount: 10,
        consultations: [
          { orders: [{ status: "COMPLETED" }] },
          { orders: [{ status: "IN_PROGRESS" }] }
        ]
      },
      {
        slug: "low-conversion",
        downloadCount: 50,
        consultations: []
      }
    ]);
    expect(listPublishedPackages).toHaveBeenCalledWith({
      query: "",
      category: "",
      sort: "conversion"
    });
  });
});
