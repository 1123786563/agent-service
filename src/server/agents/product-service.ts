import { AgentPackageStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { getAgentPackageCompleteness, getAgentPackageConversionMetrics } from "./package-service";

type ProductStore = Pick<typeof prisma, "agentPackage" | "agentPackageFavorite" | "agentPackageReview" | "agentPackageImportInstruction">;

const defaultStore: ProductStore = prisma;

export async function toggleAgentPackageFavorite(input: {
  agentPackageId: string;
  userId: string;
}, store: ProductStore = defaultStore) {
  const existing = await store.agentPackageFavorite.findUnique({
    where: {
      agentPackageId_userId: {
        agentPackageId: input.agentPackageId,
        userId: input.userId
      }
    }
  });

  if (existing) {
    await store.agentPackageFavorite.delete({
      where: {
        id: existing.id
      }
    });
    return {
      favorited: false
    };
  }

  await store.agentPackageFavorite.create({
    data: {
      agentPackageId: input.agentPackageId,
      userId: input.userId
    }
  });
  return {
    favorited: true
  };
}

export async function submitAgentPackageReview(input: {
  agentPackageId: string;
  userId?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
}, store: ProductStore = defaultStore) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("Review rating must be between 1 and 5");
  }

  return store.agentPackageReview.create({
    data: {
      agentPackageId: input.agentPackageId,
      userId: input.userId ?? null,
      rating: input.rating,
      title: input.title?.trim() || null,
      body: input.body?.trim() || null
    }
  });
}

export async function upsertAgentPackageImportInstruction(input: {
  agentPackageId: string;
  createdByUserId?: string | null;
  cliCommand: string;
  oneClickUrl?: string | null;
}, store: ProductStore = defaultStore) {
  const cliCommand = input.cliCommand.trim();
  if (!cliCommand) {
    throw new Error("CLI command is required");
  }

  return store.agentPackageImportInstruction.upsert({
    where: {
      agentPackageId: input.agentPackageId
    },
    create: {
      agentPackageId: input.agentPackageId,
      createdByUserId: input.createdByUserId ?? null,
      cliCommand,
      oneClickUrl: input.oneClickUrl?.trim() || null
    },
    update: {
      createdByUserId: input.createdByUserId ?? null,
      cliCommand,
      oneClickUrl: input.oneClickUrl?.trim() || null
    }
  });
}

export async function listRecommendedAgentPackages(
  options: {
    take?: number;
  } = {},
  store: ProductStore = defaultStore
) {
  const packages = await store.agentPackage.findMany({
    where: {
      status: AgentPackageStatus.PUBLISHED
    },
    include: {
      owner: true,
      skills: true,
      workflows: true,
      reviews: {
        select: {
          rating: true
        }
      },
      favorites: {
        select: {
          id: true
        }
      },
      consultations: {
        include: {
          orders: {
            select: {
              status: true
            }
          }
        }
      }
    }
  });

  return packages
    .map((agentPackage) => {
      const reviewCount = agentPackage.reviews.length;
      const averageRating = reviewCount
        ? agentPackage.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
        : 0;
      const completeness = getAgentPackageCompleteness(agentPackage);
      const conversion = getAgentPackageConversionMetrics(agentPackage);
      const recommendationScore =
        completeness.score * 0.35 +
        conversion.conversionScore * 0.3 +
        averageRating * 20 * 0.25 +
        Math.min(agentPackage.favorites.length, 20) * 0.5;

      return {
        ...agentPackage,
        recommendationScore,
        averageRating,
        reviewCount,
        favoriteCount: agentPackage.favorites.length
      };
    })
    .sort((left, right) => right.recommendationScore - left.recommendationScore)
    .slice(0, options.take ?? 12);
}

export type RecommendedAgentPackage = Awaited<ReturnType<typeof listRecommendedAgentPackages>>[number];
