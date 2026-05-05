import { applyPaymentEvent, getPaymentAdapter, getPaymentProvider } from "@/server/payments/adapter";
import type { NormalizedProviderEvent, NormalizedRefundEvent } from "@/server/payments/webhook-events";
import { applyRefundEvent } from "@/server/refunds/service";

function isRefundEvent(event: NormalizedProviderEvent): event is NormalizedRefundEvent {
  return event.type === "refund.succeeded" || event.type === "refund.failed";
}

export async function POST(request: Request) {
  try {
    const adapter = getPaymentAdapter(getPaymentProvider());
    const event = await adapter.parseWebhook(request);
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
