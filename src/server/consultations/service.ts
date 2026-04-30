import { AgentPackageStatus, ConsultationStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";

const consultationEmailSchema = z.string().trim().min(1).email().transform((value) => value.toLowerCase());
const consultationRequirementSchema = z.string().trim().min(1).max(5000);
const consultationScopedSummarySchema = z.string().trim().min(1).max(5000);

type ConsultationWithRelations = Prisma.ConsultationGetPayload<{
  include: {
    agentPackage: true;
    provider: true;
    buyerUser: true;
    orders: true;
  };
}>;

type ConsultationStore = {
  create(args: Prisma.ConsultationCreateArgs): Promise<ConsultationWithRelations>;
  findPublishedAgentPackageBySlug(slug: string): Promise<{ id: string; ownerId: string } | null>;
  findManyForProvider(providerId: string): Promise<ConsultationWithRelations[]>;
  findUnique(args: Prisma.ConsultationFindUniqueArgs): Promise<ConsultationWithRelations | null>;
  update(args: Prisma.ConsultationUpdateArgs): Promise<ConsultationWithRelations>;
};

type ConsultationServiceDeps = {
  store: ConsultationStore;
};

export type CreateConsultationInput = {
  agentSlug: string;
  buyerEmail: string;
  requirement: string;
  buyerUserId?: string | null;
};

export type UpdateConsultationInput = {
  consultationId: string;
  providerId: string;
  status: ConsultationStatus;
  scopedSummary?: string | null;
};

const defaultDeps: ConsultationServiceDeps = {
  store: {
    create(args) {
      return prisma.consultation.create({
        ...args,
        include: {
          agentPackage: true,
          provider: true,
          buyerUser: true,
          orders: true
        }
      });
    },
    findPublishedAgentPackageBySlug(slug) {
      return prisma.agentPackage.findFirst({
        where: {
          slug,
          status: AgentPackageStatus.PUBLISHED
        },
        select: {
          id: true,
          ownerId: true
        }
      });
    },
    findManyForProvider(providerId) {
      return prisma.consultation.findMany({
        where: { providerId },
        include: {
          agentPackage: true,
          provider: true,
          buyerUser: true,
          orders: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    },
    findUnique(args) {
      return prisma.consultation.findUnique({
        ...args,
        include: {
          agentPackage: true,
          provider: true,
          buyerUser: true,
          orders: true
        }
      });
    },
    update(args) {
      return prisma.consultation.update({
        ...args,
        include: {
          agentPackage: true,
          provider: true,
          buyerUser: true,
          orders: true
        }
      });
    }
  }
};

function assertConsultationStatusTransition(currentStatus: ConsultationStatus, nextStatus: ConsultationStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTransitions: Record<ConsultationStatus, ConsultationStatus[]> = {
    NEW: [ConsultationStatus.IN_DISCUSSION, ConsultationStatus.SCOPED, ConsultationStatus.CLOSED],
    IN_DISCUSSION: [ConsultationStatus.SCOPED, ConsultationStatus.CLOSED],
    SCOPED: [ConsultationStatus.IN_DISCUSSION, ConsultationStatus.CLOSED],
    ORDER_CREATED: [],
    CLOSED: []
  };

  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new Error(`Invalid consultation status transition: ${currentStatus} -> ${nextStatus}`);
  }
}

export async function createConsultation(
  input: CreateConsultationInput,
  deps: ConsultationServiceDeps = defaultDeps
) {
  const agentSlug = input.agentSlug.trim();
  if (!agentSlug) {
    throw new Error("Agent slug is required");
  }

  const buyerEmail = consultationEmailSchema.parse(input.buyerEmail);
  const requirement = consultationRequirementSchema.parse(input.requirement);

  const agentPackage = await deps.store.findPublishedAgentPackageBySlug(agentSlug);
  if (!agentPackage) {
    throw new Error("Published agent package not found");
  }

  return deps.store.create({
    data: {
      agentPackageId: agentPackage.id,
      providerId: agentPackage.ownerId,
      buyerEmail,
      buyerUserId: input.buyerUserId ?? null,
      requirement,
      status: ConsultationStatus.NEW
    }
  });
}

export async function listConsultationsForProvider(providerId: string, deps: ConsultationServiceDeps = defaultDeps) {
  const normalizedProviderId = providerId.trim();
  if (!normalizedProviderId) {
    throw new Error("Provider ID is required");
  }

  return deps.store.findManyForProvider(normalizedProviderId);
}

export async function getConsultationById(consultationId: string, deps: ConsultationServiceDeps = defaultDeps) {
  const normalizedConsultationId = consultationId.trim();
  if (!normalizedConsultationId) {
    throw new Error("Consultation ID is required");
  }

  return deps.store.findUnique({
    where: { id: normalizedConsultationId }
  });
}

export async function updateConsultation(
  input: UpdateConsultationInput,
  deps: ConsultationServiceDeps = defaultDeps
) {
  const consultationId = input.consultationId.trim();
  if (!consultationId) {
    throw new Error("Consultation ID is required");
  }

  const providerId = input.providerId.trim();
  if (!providerId) {
    throw new Error("Provider ID is required");
  }

  const consultation = await deps.store.findUnique({
    where: { id: consultationId }
  });

  if (!consultation) {
    throw new Error("Consultation not found");
  }

  if (consultation.providerId !== providerId) {
    throw new Error("Consultation does not belong to this provider");
  }

  assertConsultationStatusTransition(consultation.status, input.status);

  let scopedSummary: string | null | undefined = input.scopedSummary;
  if (input.status === ConsultationStatus.SCOPED) {
    scopedSummary = consultationScopedSummarySchema.parse(input.scopedSummary);
  } else if (scopedSummary !== undefined && scopedSummary !== null && scopedSummary !== "") {
    scopedSummary = consultationScopedSummarySchema.parse(scopedSummary);
  } else {
    scopedSummary = consultation.scopedSummary;
  }

  return deps.store.update({
    where: { id: consultationId },
    data: {
      status: input.status,
      scopedSummary
    }
  });
}
