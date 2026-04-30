import { applyPaymentEvent } from "@/server/payments/adapter";
import { createDevPaymentFailedEvent, createDevPaymentSucceededEvent } from "@/server/payments/dev-adapter";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId") ?? "";
    const paymentReference = url.searchParams.get("paymentReference");
    const outcome = (url.searchParams.get("outcome") ?? "succeeded").trim().toLowerCase();
    const event = outcome === "failed"
      ? createDevPaymentFailedEvent({
          orderId,
          paymentReference
        })
      : createDevPaymentSucceededEvent({
          orderId,
          paymentReference
        });
    const order = await applyPaymentEvent(event);

    return Response.json({
      ok: true,
      type: event.type,
      orderId: event.orderId,
      orderStatus: order?.status ?? null,
      paymentStatus: order?.paymentStatus ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete dev payment";

    return Response.json({
      errors: [message]
    }, {
      status: 400
    });
  }
}
