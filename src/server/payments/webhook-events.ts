import { PaymentStatus } from "@prisma/client";

export type NormalizedPaymentEvent = {
  type: "payment.succeeded" | "payment.failed" | "payment.cancelled";
  provider: string;
  providerEventId: string;
  orderId: string;
  paymentReference?: string | null;
  providerPaymentId?: string | null;
  providerCheckoutSessionId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  failureReason?: string | null;
  idempotencyKey?: string | null;
  rawPayload: unknown;
};

export function paymentStatusFromEventType(type: NormalizedPaymentEvent["type"]) {
  switch (type) {
    case "payment.succeeded":
      return PaymentStatus.PAID;
    case "payment.failed":
      return PaymentStatus.FAILED;
    case "payment.cancelled":
      return PaymentStatus.CANCELLED;
  }
}
