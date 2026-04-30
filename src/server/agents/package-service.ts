import { AgentPackageStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { deleteStoredZip, readStoredZip, saveUploadedZip, type StoredZipFile } from "@/server/storage/local-storage";
import { validateAgentZip, type ZipValidationResult } from "./zip-validator";

type AgentPackageWithRelations = Prisma.AgentPackageGetPayload<{
  include: {
    owner: true;
    skills: true;
    workflows: true;
  };
}>;
type CreatePackageArgs = Prisma.AgentPackageCreateArgs & {
  include: {
    owner: true;
    skills: true;
    workflows: true;
  };
};

type PackageServiceDeps = {
  packageStore: {
    createPackage(args: CreatePackageArgs): Promise<AgentPackageWithRelations>;
    findSlugsWithPrefix(prefix: string): Promise<string[]>;
    listPublishedPackages(): Promise<AgentPackageWithRelations[]>;
    findPublishedPackageBySlug(slug: string): Promise<AgentPackageWithRelations | null>;
  };
  validateZip(buffer: Buffer): Promise<ZipValidationResult>;
  storage: {
    saveUploadedZip(buffer: Buffer, originalFileName: string): Promise<StoredZipFile>;
    readStoredZip(fileName: string): Promise<Buffer>;
    deleteStoredZip(fileName: string): Promise<void>;
  };
};

export type CreateAgentPackageFailure = {
  ok: false;
  errors: string[];
  risks: string[];
};

export type CreateAgentPackageSuccess = {
  ok: true;
  package: AgentPackageWithRelations;
  storage: StoredZipFile;
  risks: string[];
};

export type CreateAgentPackageResult = CreateAgentPackageFailure | CreateAgentPackageSuccess;
export type CreateAgentPackageInput = {
  ownerId: string;
  buffer: Buffer;
  fileName: string;
};

const defaultDeps: PackageServiceDeps = {
  packageStore: {
    createPackage(args) {
      return prisma.agentPackage.create(args);
    },
    async findSlugsWithPrefix(prefix) {
      const packages = await prisma.agentPackage.findMany({
        where: {
          slug: {
            startsWith: prefix
          }
        },
        select: {
          slug: true
        }
      });

      return packages.map((item) => item.slug);
    },
    listPublishedPackages() {
      return prisma.agentPackage.findMany({
        where: {
          status: AgentPackageStatus.PUBLISHED
        },
        orderBy: [
          { publishedAt: "desc" },
          { createdAt: "desc" }
        ],
        include: {
          owner: true,
          skills: true,
          workflows: true
        }
      });
    },
    findPublishedPackageBySlug(slug) {
      return prisma.agentPackage.findUnique({
        where: {
          slug
        },
        include: {
          owner: true,
          skills: true,
          workflows: true
        }
      }).then((agentPackage) => {
        if (!agentPackage || agentPackage.status !== AgentPackageStatus.PUBLISHED) {
          return null;
        }

        return agentPackage;
      });
    }
  },
  validateZip: validateAgentZip,
  storage: {
    saveUploadedZip,
    readStoredZip,
    deleteStoredZip
  }
};

export function slugifyPackageName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function resolveUniquePackageSlug(baseSlug: string, existingSlugs: string[]) {
  const normalizedBaseSlug = baseSlug.replace(/^-+|-+$/g, "") || "agent-package";
  const usedSlugs = new Set(existingSlugs);

  if (!usedSlugs.has(normalizedBaseSlug)) {
    return normalizedBaseSlug;
  }

  let suffix = 2;
  while (usedSlugs.has(`${normalizedBaseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBaseSlug}-${suffix}`;
}

function isSlugConflictError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") {
    return false;
  }

  if (!candidate.meta?.target) {
    return true;
  }

  if (Array.isArray(candidate.meta.target)) {
    return candidate.meta.target.includes("slug");
  }

  return candidate.meta.target === "slug";
}

export async function createAgentPackageFromZip(
  input: CreateAgentPackageInput,
  deps: PackageServiceDeps = defaultDeps
): Promise<CreateAgentPackageResult> {
  const validation = await deps.validateZip(input.buffer);

  if (!validation.ok || !validation.metadata) {
    return {
      ok: false,
      errors: validation.errors,
      risks: validation.risks
    };
  }

  const storage = await deps.storage.saveUploadedZip(input.buffer, input.fileName);
  const baseSlug = slugifyPackageName(validation.metadata.name) || slugifyPackageName(validation.metadata.id) || "agent-package";
  const existingSlugs = await deps.packageStore.findSlugsWithPrefix(baseSlug);
  const attemptedSlugs = [...existingSlugs];

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = resolveUniquePackageSlug(baseSlug, attemptedSlugs);

      try {
        const createdPackage = await deps.packageStore.createPackage({
          data: {
            ownerId: input.ownerId,
            name: validation.metadata.name,
            slug,
            version: validation.metadata.version,
            summary: validation.metadata.summary,
            categories: validation.metadata.categories,
            metadataJson: validation.metadata,
            zipFileUrl: storage.url,
            zipFileName: storage.fileName,
            zipSizeBytes: storage.sizeBytes,
            validationResult: {
              errors: validation.errors,
              risks: validation.risks,
              fileNames: validation.fileNames
            },
            status: AgentPackageStatus.PUBLISHED,
            publishedAt: new Date(),
            skills: {
              create: validation.metadata.skills.map((skill) => ({
                name: skill.name,
                path: skill.path,
                description: skill.description
              }))
            },
            workflows: {
              create: validation.metadata.workflows.map((workflow) => ({
                name: workflow.name,
                path: workflow.path,
                description: workflow.description
              }))
            }
          },
          include: {
            owner: true,
            skills: true,
            workflows: true
          }
        });

        return {
          ok: true,
          package: createdPackage,
          storage,
          risks: validation.risks
        };
      } catch (error) {
        if (isSlugConflictError(error)) {
          attemptedSlugs.push(slug);
          continue;
        }

        throw error;
      }
    }

    throw new Error("Could not allocate a unique package slug");
  } catch (error) {
    try {
      await deps.storage.deleteStoredZip(storage.fileName);
    } catch {
      // Best-effort cleanup. Preserve the original package creation failure.
    }

    throw error;
  }
}

export async function listPublishedAgentPackages(deps: PackageServiceDeps = defaultDeps) {
  return deps.packageStore.listPublishedPackages();
}

export async function getPublishedAgentPackageBySlug(slug: string, deps: PackageServiceDeps = defaultDeps) {
  return deps.packageStore.findPublishedPackageBySlug(slug);
}

export async function readAgentPackageZip(fileName: string, deps: PackageServiceDeps = defaultDeps) {
  return deps.storage.readStoredZip(fileName);
}
