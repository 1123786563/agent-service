import { PaymentStatus, ServiceOrderStatus, UserRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  deleteDeliveryFile,
  readDeliveryFile,
  saveDeliveryFile,
  type StoredDeliveryFile
} from "@/server/storage/local-delivery-storage";

const deliveryNoteSchema = z.string().trim().max(5000);

type DeliveryWithRelations = Prisma.DeliveryGetPayload<{
  include: {
    serviceOrder: true;
    provider: true;
  };
}>;

type OrderSummary = {
  id: string;
  providerId: string;
  buyerEmail: string;
  status: ServiceOrderStatus;
  paymentStatus: PaymentStatus;
};

type DeliveryStore = {
  findOrderById(id: string): Promise<OrderSummary | null>;
  createDeliveryAndMarkDelivered(data: {
    serviceOrderId: string;
    providerId: string;
    fileUrl: string;
    fileName: string;
    fileSizeBytes: number;
    note: string | null;
  }): Promise<DeliveryWithRelations>;
  findManyForOrder(orderId: string): Promise<DeliveryWithRelations[]>;
  findDeliveryById(deliveryId: string): Promise<DeliveryWithRelations | null>;
  acceptLatestDeliveryForOrder(data: {
    orderId: string;
    acceptedAt: Date;
  }): Promise<DeliveryWithRelations>;
};

type DeliveryStorage = {
  save(buffer: Buffer, originalFileName: string): Promise<StoredDeliveryFile>;
  read(fileName: string): Promise<Buffer>;
  delete(fileName: string): Promise<void>;
};

type DeliveryServiceDeps = {
  store: DeliveryStore;
  storage: DeliveryStorage;
};

export type CreateDeliveryInput = {
  orderId: string;
  providerId: string;
  buffer: Buffer;
  fileName: string;
  note?: string | null;
};

export type DeliveryDownloadRequester = {
  userId: string;
  email: string;
  role: UserRole;
};

export type AcceptDeliveryInput = {
  orderId: string;
  buyerEmail: string;
};

const defaultDeps: DeliveryServiceDeps = {
  store: {
    findOrderById(id) {
      return prisma.serviceOrder.findUnique({
        where: { id },
        select: {
          id: true,
          providerId: true,
          buyerEmail: true,
          status: true,
          paymentStatus: true
        }
      });
    },
    createDeliveryAndMarkDelivered(data) {
      return prisma.$transaction(async (tx) => {
        const delivery = await tx.delivery.create({
          data: {
            serviceOrderId: data.serviceOrderId,
            providerId: data.providerId,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSizeBytes: data.fileSizeBytes,
            note: data.note
          },
          include: {
            serviceOrder: true,
            provider: true
          }
        });

        await tx.serviceOrder.update({
          where: { id: data.serviceOrderId },
          data: { status: ServiceOrderStatus.DELIVERED }
        });

        return delivery;
      });
    },
    findManyForOrder(orderId) {
      return prisma.delivery.findMany({
        where: { serviceOrderId: orderId },
        include: {
          serviceOrder: true,
          provider: true
        },
        orderBy: {
          submittedAt: "desc"
        }
      });
    },
    findDeliveryById(deliveryId) {
      return prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          serviceOrder: true,
          provider: true
        }
      });
    },
    acceptLatestDeliveryForOrder(data) {
      return prisma.$transaction(async (tx) => {
        const delivery = await tx.delivery.findFirst({
          where: {
            serviceOrderId: data.orderId
          },
          orderBy: {
            submittedAt: "desc"
          }
        });

        if (!delivery) {
          throw new Error("Delivery not found");
        }

        const acceptedDelivery = await tx.delivery.update({
          where: { id: delivery.id },
          data: { acceptedAt: data.acceptedAt },
          include: {
            serviceOrder: true,
            provider: true
          }
        });

        await tx.serviceOrder.update({
          where: { id: data.orderId },
          data: { status: ServiceOrderStatus.COMPLETED }
        });

        return acceptedDelivery;
      });
    }
  },
  storage: {
    save: saveDeliveryFile,
    read: readDeliveryFile,
    delete: deleteDeliveryFile
  }
};

function normalizeRequiredId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  return normalized;
}

function assertOrderCanReceiveDelivery(order: OrderSummary, providerId: string) {
  if (order.providerId !== providerId) {
    throw new Error("Service order does not belong to this provider");
  }

  if (order.status !== ServiceOrderStatus.IN_PROGRESS) {
    throw new Error("Service order must be in progress before delivery upload");
  }

  if (order.paymentStatus !== PaymentStatus.PAID) {
    throw new Error("Service order must be paid before delivery upload");
  }
}

function assertBuyerOwnsOrder(order: OrderSummary, buyerEmail: string) {
  if (order.buyerEmail.toLowerCase() !== buyerEmail.toLowerCase()) {
    throw new Error("Buyer access is required");
  }
}

export async function createDeliveryForOrder(input: CreateDeliveryInput, deps: DeliveryServiceDeps = defaultDeps) {
  const orderId = normalizeRequiredId(input.orderId, "Order ID");
  const providerId = normalizeRequiredId(input.providerId, "Provider ID");
  const fileName = normalizeRequiredId(input.fileName, "Delivery file name");
  const note = input.note === undefined || input.note === null ? null : deliveryNoteSchema.parse(input.note);

  if (input.buffer.byteLength === 0) {
    throw new Error("Delivery file is required");
  }

  const order = await deps.store.findOrderById(orderId);
  if (!order) {
    throw new Error("Service order not found");
  }

  assertOrderCanReceiveDelivery(order, providerId);

  const stored = await deps.storage.save(input.buffer, fileName);

  try {
    return await deps.store.createDeliveryAndMarkDelivered({
      serviceOrderId: orderId,
      providerId,
      fileUrl: stored.url,
      fileName: stored.fileName,
      fileSizeBytes: stored.sizeBytes,
      note
    });
  } catch (error) {
    try {
      await deps.storage.delete(stored.fileName);
    } catch {
      // Best-effort cleanup. Preserve the original database failure.
    }

    throw error;
  }
}

export async function listDeliveriesForOrder(orderId: string, deps: DeliveryServiceDeps = defaultDeps) {
  return deps.store.findManyForOrder(normalizeRequiredId(orderId, "Order ID"));
}

export async function getDeliveryForDownload(
  input: {
    orderId: string;
    deliveryId: string;
    requester: DeliveryDownloadRequester;
  },
  deps: DeliveryServiceDeps = defaultDeps
) {
  const orderId = normalizeRequiredId(input.orderId, "Order ID");
  const deliveryId = normalizeRequiredId(input.deliveryId, "Delivery ID");
  const delivery = await deps.store.findDeliveryById(deliveryId);

  if (!delivery || delivery.serviceOrderId !== orderId) {
    throw new Error("Delivery not found");
  }

  const requesterEmail = input.requester.email.toLowerCase();
  const buyerEmail = delivery.serviceOrder.buyerEmail.toLowerCase();
  const hasAccess =
    input.requester.role === UserRole.ADMIN ||
    input.requester.userId === delivery.providerId ||
    requesterEmail === buyerEmail;

  if (!hasAccess) {
    throw new Error("Delivery access is required");
  }

  const buffer = await deps.storage.read(delivery.fileName);

  return {
    delivery,
    buffer
  };
}

export async function acceptLatestDelivery(input: AcceptDeliveryInput, deps: DeliveryServiceDeps = defaultDeps) {
  const orderId = normalizeRequiredId(input.orderId, "Order ID");
  const buyerEmail = z.string().trim().min(1).email().parse(input.buyerEmail).toLowerCase();

  const order = await deps.store.findOrderById(orderId);
  if (!order) {
    throw new Error("Service order not found");
  }

  assertBuyerOwnsOrder(order, buyerEmail);

  if (order.status !== ServiceOrderStatus.DELIVERED) {
    throw new Error("Service order must be delivered before completion");
  }

  return deps.store.acceptLatestDeliveryForOrder({
    orderId,
    acceptedAt: new Date()
  });
}
