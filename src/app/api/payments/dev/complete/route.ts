import { applyPaymentEvent } from "@/server/payments/adapter";
import { createDevPaymentFailedEvent, createDevPaymentSucceededEvent } from "@/server/payments/dev-adapter";
import { getServiceOrderById } from "@/server/orders/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId") ?? "";
    const paymentReference = url.searchParams.get("paymentReference");
    const outcome = (url.searchParams.get("outcome") ?? "succeeded").trim().toLowerCase();
    const order = await getServiceOrderById(orderId);
    if (!order) {
      throw new Error("Service order not found");
    }
    const event = outcome === "failed"
      ? createDevPaymentFailedEvent({
          orderId,
          paymentReference,
          amountMinor: order.priceCents,
          currency: order.currency
        })
      : createDevPaymentSucceededEvent({
          orderId,
          paymentReference,
          amountMinor: order.priceCents,
          currency: order.currency
        });
    const updatedOrder = await applyPaymentEvent(event);

    return Response.json({
      ok: true,
      type: event.type,
      orderId: event.orderId,
      orderStatus: updatedOrder?.status ?? null,
      paymentStatus: updatedOrder?.paymentStatus ?? null
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
