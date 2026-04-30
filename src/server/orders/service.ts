import { PaymentStatus, ServiceOrderStatus, ConsultationStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";

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
  consultationHasOrder(consultationId: string): Promise<boolean>;
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
    async consultationHasOrder(consultationId) {
      const count = await prisma.serviceOrder.count({
        where: { consultationId }
      });
      return count > 0;
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

  if (await deps.store.consultationHasOrder(consultationId)) {
    throw new Error("Consultation already has an order");
  }

  return deps.store.createOrderForConsultation({
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

  const order = await deps.store.findUniqueById(orderId);
  if (!order) {
    throw new Error("Service order not found");
  }

  if (order.status === ServiceOrderStatus.CANCELLED || order.status === ServiceOrderStatus.DISPUTED) {
    throw new Error(`Cannot mark ${order.status.toLowerCase()} order as paid`);
  }

  if (order.paymentStatus === PaymentStatus.PAID && order.status === ServiceOrderStatus.IN_PROGRESS) {
    return order;
  }

  return deps.store.updateOrder({
    where: { id: orderId },
    data: {
      paymentStatus: PaymentStatus.PAID,
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentReference: input.paymentReference ?? order.paymentReference
    }
  });
}
