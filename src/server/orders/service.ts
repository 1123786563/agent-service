import { PaymentStatus, ServiceOrderStatus, ConsultationStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";

export class ConcurrentModificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrentModificationError";
  }
}

const titleSchema = z.string().trim().min(1).max(200);
const scopeSchema = z.string().trim().min(1).max(5000);
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());

type ServiceOrderWithRelations = Prisma.ServiceOrderGetPayload<{
  include: {
    consultation: true;
    buyerUser: true;
    provider: true;
  };
}>;

type ConsultationSummary = {
  id: string;
  providerId: string;
  buyerEmail: string;
  buyerUserId: string | null;
  status: ConsultationStatus;
  scopedSummary: string | null;
};

type OrderStore = {
  findConsultationById(id: string): Promise<ConsultationSummary | null>;
  createOrderForConsultation(data: {
    consultationId: string;
    buyerEmail: string;
    buyerUserId: string | null;
    providerId: string;
    title: string;
    scope: string;
    priceCents: number;
    currency: string;
    paymentProvider: string;
  }): Promise<ServiceOrderWithRelations>;
  findManyForBuyerEmail(buyerEmail: string): Promise<ServiceOrderWithRelations[]>;
  findManyForProvider(providerId: string): Promise<ServiceOrderWithRelations[]>;
  findUniqueById(id: string): Promise<ServiceOrderWithRelations | null>;
  updateOrder(args: Prisma.ServiceOrderUpdateArgs): Promise<ServiceOrderWithRelations>;
  updateMany(args: Prisma.ServiceOrderUpdateManyArgs): Promise<{ count: number }>;
};

type OrderServiceDeps = {
  store: OrderStore;
};

export type CreateServiceOrderInput = {
  consultationId: string;
  providerId: string;
  title: string;
  scope: string;
  priceCents: number;
  currency: string;
  paymentProvider: string;
};

export type MarkServiceOrderPaidInput = {
  orderId: string;
  paymentReference?: string | null;
};

export type MarkServiceOrderPaymentFailedInput = {
  orderId: string;
  paymentReference?: string | null;
};

export type MarkServiceOrderPaymentCancelledInput = {
  orderId: string;
  paymentReference?: string | null;
};

export type MarkServiceOrderDisputedInput = {
  orderId: string;
};

export type ResolveDisputedServiceOrderInput = {
  orderId: string;
  nextStatus: "IN_PROGRESS" | "DELIVERED" | "CANCELLED";
};

export type CancelServiceOrderInput = {
  orderId: string;
};

const defaultDeps: OrderServiceDeps = {
  store: {
    findConsultationById(id) {
      return prisma.consultation.findUnique({
        where: { id },
        select: {
          id: true,
          providerId: true,
          buyerEmail: true,
          buyerUserId: true,
          status: true,
          scopedSummary: true
        }
      });
    },
    createOrderForConsultation(data) {
      return prisma.$transaction(async (tx) => {
        const order = await tx.serviceOrder.create({
          data: {
            consultationId: data.consultationId,
            buyerEmail: data.buyerEmail,
            buyerUserId: data.buyerUserId,
            providerId: data.providerId,
            title: data.title,
            scope: data.scope,
            priceCents: data.priceCents,
            currency: data.currency,
            status: ServiceOrderStatus.PENDING_PAYMENT,
            paymentStatus: PaymentStatus.UNPAID,
            paymentProvider: data.paymentProvider
          },
          include: {
            consultation: true,
            buyerUser: true,
            provider: true
          }
        });

        await tx.consultation.update({
          where: { id: data.consultationId },
          data: { status: ConsultationStatus.ORDER_CREATED }
        });

        return order;
      });
    },
    findManyForBuyerEmail(buyerEmail) {
      return prisma.serviceOrder.findMany({
        where: { buyerEmail },
        include: {
          consultation: true,
          buyerUser: true,
          provider: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    },
    findManyForProvider(providerId) {
      return prisma.serviceOrder.findMany({
        where: { providerId },
        include: {
          consultation: true,
          buyerUser: true,
          provider: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    },
    findUniqueById(id) {
      return prisma.serviceOrder.findUnique({
        where: { id },
        include: {
          consultation: true,
          buyerUser: true,
          provider: true
        }
      });
    },
    updateOrder(args) {
      return prisma.serviceOrder.update({
        ...args,
        include: {
          consultation: true,
          buyerUser: true,
          provider: true
        }
      });
    },
    updateMany(args) {
      return prisma.serviceOrder.updateMany(args);
    }
  }
};

function assertPositivePrice(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Price must be a positive integer amount in cents");
  }
}

export async function createServiceOrder(
  input: CreateServiceOrderInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const consultationId = input.consultationId.trim();
  if (!consultationId) {
    throw new Error("Consultation ID is required");
  }

  const providerId = input.providerId.trim();
  if (!providerId) {
    throw new Error("Provider ID is required");
  }

  const title = titleSchema.parse(input.title);
  const scope = scopeSchema.parse(input.scope);
  const currency = currencySchema.parse(input.currency);
  const paymentProvider = input.paymentProvider.trim();
  if (!paymentProvider) {
    throw new Error("Payment provider is required");
  }

  assertPositivePrice(input.priceCents);

  const consultation = await deps.store.findConsultationById(consultationId);
  if (!consultation) {
    throw new Error("Consultation not found");
  }

  if (consultation.providerId !== providerId) {
    throw new Error("Consultation does not belong to this provider");
  }

  if (consultation.status !== ConsultationStatus.SCOPED) {
    throw new Error("Consultation must be scoped before creating an order");
  }

  try {
    return await deps.store.createOrderForConsultation({
      consultationId,
      buyerEmail: consultation.buyerEmail,
      buyerUserId: consultation.buyerUserId,
      providerId,
      title,
      scope,
      priceCents: input.priceCents,
      currency,
      paymentProvider
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      throw new Error("订单已创建");
    }
    throw error;
  }
}

export async function listServiceOrdersForBuyerEmail(buyerEmail: string, deps: OrderServiceDeps = defaultDeps) {
  const normalizedBuyerEmail = z.string().trim().min(1).email().parse(buyerEmail).toLowerCase();
  return deps.store.findManyForBuyerEmail(normalizedBuyerEmail);
}

export async function listServiceOrdersForProvider(providerId: string, deps: OrderServiceDeps = defaultDeps) {
  const normalizedProviderId = providerId.trim();
  if (!normalizedProviderId) {
    throw new Error("Provider ID is required");
  }

  return deps.store.findManyForProvider(normalizedProviderId);
}

export async function getServiceOrderById(orderId: string, deps: OrderServiceDeps = defaultDeps) {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new Error("Order ID is required");
  }

  return deps.store.findUniqueById(normalizedOrderId);
}

export async function markServiceOrderPaid(
  input: MarkServiceOrderPaidInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const existing = await deps.store.findUniqueById(orderId);
  if (!existing) {
    throw new Error("Service order not found");
  }

  // Idempotency: already paid
  if (existing.paymentStatus === PaymentStatus.PAID && existing.status === ServiceOrderStatus.IN_PROGRESS) {
    return existing;
  }

  if (existing.status === ServiceOrderStatus.CANCELLED || existing.status === ServiceOrderStatus.DISPUTED) {
    throw new Error(`Cannot mark ${existing.status.toLowerCase()} order as paid`);
  }

  // Atomic transition: only update if still in a payable state
  const result = await deps.store.updateMany({
    where: {
      id: orderId,
      status: { notIn: [ServiceOrderStatus.CANCELLED, ServiceOrderStatus.DISPUTED] },
      paymentStatus: { not: PaymentStatus.PAID }
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentReference: input.paymentReference ?? existing.paymentReference
    }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError("状态已变更，请刷新重试");
  }

  return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
}

export async function markServiceOrderPaymentFailed(
  input: MarkServiceOrderPaymentFailedInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const existing = await deps.store.findUniqueById(orderId);
  if (!existing) {
    throw new Error("Service order not found");
  }

  if (
    existing.status === ServiceOrderStatus.CANCELLED ||
    existing.status === ServiceOrderStatus.DISPUTED ||
    existing.status === ServiceOrderStatus.DELIVERED ||
    existing.status === ServiceOrderStatus.COMPLETED
  ) {
    throw new Error(`Cannot mark ${existing.status.toLowerCase()} order as failed`);
  }

  // Idempotency: already failed
  if (existing.paymentStatus === PaymentStatus.FAILED && existing.status === ServiceOrderStatus.PENDING_PAYMENT) {
    return existing;
  }

  const result = await deps.store.updateMany({
    where: {
      id: orderId,
      status: { notIn: [ServiceOrderStatus.CANCELLED, ServiceOrderStatus.DISPUTED, ServiceOrderStatus.DELIVERED, ServiceOrderStatus.COMPLETED] }
    },
    data: {
      paymentStatus: PaymentStatus.FAILED,
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentReference: input.paymentReference ?? existing.paymentReference
    }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError("状态已变更，请刷新重试");
  }

  return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
}

export async function markServiceOrderPaymentCancelled(
  input: MarkServiceOrderPaymentCancelledInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const existing = await deps.store.findUniqueById(orderId);
  if (!existing) {
    throw new Error("Service order not found");
  }

  if (existing.status !== ServiceOrderStatus.PENDING_PAYMENT) {
    throw new Error("Cannot mark non-pending order payment as cancelled");
  }

  // Idempotency: already cancelled
  if (existing.paymentStatus === PaymentStatus.CANCELLED) {
    return existing;
  }

  const result = await deps.store.updateMany({
    where: {
      id: orderId,
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: { not: PaymentStatus.CANCELLED }
    },
    data: {
      paymentStatus: PaymentStatus.CANCELLED,
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentReference: input.paymentReference ?? existing.paymentReference
    }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError("状态已变更，请刷新重试");
  }

  return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
}

export async function markServiceOrderDisputed(
  input: MarkServiceOrderDisputedInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const existing = await deps.store.findUniqueById(orderId);
  if (!existing) {
    throw new Error("Service order not found");
  }

  const disputableStatuses: ServiceOrderStatus[] = [
    ServiceOrderStatus.PAID,
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.DELIVERED
  ];
  if (!disputableStatuses.includes(existing.status)) {
    throw new Error("Service order cannot enter dispute from its current status");
  }

  // Idempotency: already disputed
  if (existing.status === ServiceOrderStatus.DISPUTED) {
    return existing;
  }

  const result = await deps.store.updateMany({
    where: {
      id: orderId,
      status: { in: [ServiceOrderStatus.PAID, ServiceOrderStatus.IN_PROGRESS, ServiceOrderStatus.DELIVERED] }
    },
    data: { status: ServiceOrderStatus.DISPUTED }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError("状态已变更，请刷新重试");
  }

  return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
}

export async function resolveDisputedServiceOrder(
  input: ResolveDisputedServiceOrderInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const existing = await deps.store.findUniqueById(orderId);
  if (!existing) {
    throw new Error("Service order not found");
  }

  if (existing.status !== ServiceOrderStatus.DISPUTED) {
    throw new Error("Service order is not disputed");
  }

  const result = await deps.store.updateMany({
    where: { id: orderId, status: ServiceOrderStatus.DISPUTED },
    data: { status: input.nextStatus }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError("状态已变更，请刷新重试");
  }

  return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
}

export async function cancelServiceOrder(
  input: CancelServiceOrderInput,
  deps: OrderServiceDeps = defaultDeps
) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const existing = await deps.store.findUniqueById(orderId);
  if (!existing) {
    throw new Error("Service order not found");
  }

  const cancellablePaymentStatuses: PaymentStatus[] = [PaymentStatus.UNPAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED];
  if (existing.status !== ServiceOrderStatus.PENDING_PAYMENT || !cancellablePaymentStatuses.includes(existing.paymentStatus)) {
    throw new Error("Only unpaid pending orders can be cancelled");
  }

  const result = await deps.store.updateMany({
    where: {
      id: orderId,
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED] }
    },
    data: { status: ServiceOrderStatus.CANCELLED }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError("状态已变更，请刷新重试");
  }

  return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
}
