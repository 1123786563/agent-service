import crypto from "node:crypto";
import { PaymentStatus } from "@prisma/client";
import { prisma as db } from "@/server/db";

type PaymentLedgerStore = {
  findUnique(args: {
    where: {
      providerEventId: string;
    };
  }): Promise<{ id: string } | null>;
  create(args: {
    data: {
      orderId: string;
      provider: string;
      providerPaymentId?: string | null;
      providerCheckoutSessionId?: string | null;
      providerEventId: string;
      amountMinor: number;
      currency: string;
      paymentStatus: PaymentStatus;
      failureReason?: string | null;
      idempotencyKey?: string | null;
      lastWebhookEventId?: string | null;
      lastWebhookReceivedAt?: Date;
      rawEventDigest: string;
      rawEventStoredAt?: Date | null;
    };
  }): Promise<{ id: string; providerEventId: string }>;
};

export type PaymentLedgerEvent = {
  orderId: string;
  provider: string;
  providerEventId: string;
  amountMinor: number;
  currency: string;
  paymentStatus: PaymentStatus;
  providerPaymentId?: string | null;
  providerCheckoutSessionId?: string | null;
  failureReason?: string | null;
  idempotencyKey?: string | null;
  rawPayload: unknown;
};

const defaultStore: PaymentLedgerStore = {
  findUnique(args) {
    return db.paymentLedger.findUnique(args);
  },
  create(args) {
    return db.paymentLedger.create(args);
  }
};

function digestPayload(rawPayload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
}

export async function recordPaymentEvent(
  event: PaymentLedgerEvent,
  store: PaymentLedgerStore = defaultStore
) {
  const existing = await store.findUnique({
    where: {
      providerEventId: event.providerEventId
    }
  });

  if (existing) {
    return {
      duplicate: true as const,
      id: existing.id
    };
  }

  const created = await store.create({
    data: {
      orderId: event.orderId,
      provider: event.provider,
      providerPaymentId: event.providerPaymentId ?? null,
      providerCheckoutSessionId: event.providerCheckoutSessionId ?? null,
      providerEventId: event.providerEventId,
      amountMinor: event.amountMinor,
      currency: event.currency,
      paymentStatus: event.paymentStatus,
      failureReason: event.failureReason ?? null,
      idempotencyKey: event.idempotencyKey ?? null,
      lastWebhookEventId: event.providerEventId,
      lastWebhookReceivedAt: new Date(),
      rawEventDigest: digestPayload(event.rawPayload),
      rawEventStoredAt: new Date()
    }
  });

  return {
    duplicate: false as const,
    id: created.id
  };
}
