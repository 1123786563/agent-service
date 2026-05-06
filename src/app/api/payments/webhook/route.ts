import { applyPaymentEvent, getPaymentAdapter, getPaymentProvider } from "@/server/payments/adapter";
import type { NormalizedProviderEvent, NormalizedRefundEvent } from "@/server/payments/webhook-events";
import { applyRefundEvent } from "@/server/refunds/service";

function isRefundEvent(event: NormalizedProviderEvent): event is NormalizedRefundEvent {
  return event.type === "refund.succeeded" || event.type === "refund.failed";
}

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: Request) {
  try {
    const adapter = getPaymentAdapter(getPaymentProvider());
    const event = await adapter.parseWebhook(request);

    // Reject stale webhook events (> 5 minutes old)
    if ("timestamp" in event && typeof event.timestamp === "number" && event.timestamp > 0) {
      const eventAge = Date.now() - event.timestamp;
      if (eventAge > WEBHOOK_MAX_AGE_MS) {
        return Response.json({
          errors: ["Webhook event too old — rejected"]
        }, {
          status: 400
        });
      }
    }
    const result = isRefundEvent(event)
      ? await applyRefundEvent(event)
      : await applyPaymentEvent(event);

    return Response.json({
      ok: true,
      type: event.type,
      orderId: event.orderId,
      orderStatus: "order" in result ? result.order.status : result?.status ?? null,
      paymentStatus: "order" in result ? result.order.paymentStatus : result?.paymentStatus ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payment webhook";

    return Response.json({
      errors: [message]
    }, {
      status: 400
    });
  }
}
