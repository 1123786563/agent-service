import { AgentPackageStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  listRecommendedAgentPackages,
  submitAgentPackageReview,
  toggleAgentPackageFavorite,
  upsertAgentPackageImportInstruction
} from "@/server/agents/product-service";

describe("agent product service", () => {
  it("toggles favorites", async () => {
    const store = {
      agentPackageFavorite: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "favorite-1" }),
        delete: vi.fn()
      }
    } as never;

    await expect(toggleAgentPackageFavorite({
      agentPackageId: "pkg-1",
      userId: "user-1"
    }, store)).resolves.toEqual({
      favorited: true
    });
  });

  it("validates review rating range", async () => {
    await expect(submitAgentPackageReview({
      agentPackageId: "pkg-1",
      userId: "user-1",
      rating: 6
    }, {} as never)).rejects.toThrow("Review rating must be between 1 and 5");
  });

  it("upserts import instructions for CLI and one-click import", async () => {
    const store = {
      agentPackageImportInstruction: {
        upsert: vi.fn().mockResolvedValue({
          id: "import-1",
          cliCommand: "hermes install pkg-1"
        })
      }
    } as never;

    const instruction = await upsertAgentPackageImportInstruction({
      agentPackageId: "pkg-1",
      createdByUserId: "admin-1",
      cliCommand: " hermes install pkg-1 ",
      oneClickUrl: "hermes://install/pkg-1"
    }, store);

    expect(instruction.cliCommand).toBe("hermes install pkg-1");
  });

  it("sorts recommended packages by combined quality signals", async () => {
    const store = {
      agentPackage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pkg-low",
            status: AgentPackageStatus.PUBLISHED,
            summary: "",
            categories: [],
            skills: [{ description: "" }],
            workflows: [],
            metadataJson: {},
            downloadCount: 1,
            reviews: [{ rating: 2 }],
            favorites: [],
            consultations: []
          },
          {
            id: "pkg-high",
            status: AgentPackageStatus.PUBLISHED,
            summary: "Useful package",
            categories: ["ops"],
            skills: [{ description: "Does work" }],
            workflows: [{ description: "Default flow" }],
            metadataJson: {
              author: { name: "Creator" },
              service: { available: true, types: ["customization"] }
            },
            downloadCount: 20,
            reviews: [{ rating: 5 }],
            favorites: [{ id: "favorite-1" }],
            consultations: [{ orders: [{ status: "COMPLETED" }] }]
          }
        ])
      }
    } as never;

    const packages = await listRecommendedAgentPackages({ take: 2 }, store);

    expect(packages[0].id).toBe("pkg-high");
    expect(packages[0].averageRating).toBe(5);
  });
});
