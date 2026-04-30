import { applyPaymentEvent } from "@/server/payments/adapter";
import { createDevPaymentSucceededEvent } from "@/server/payments/dev-adapter";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const event = createDevPaymentSucceededEvent({
      orderId: url.searchParams.get("orderId") ?? "",
      paymentReference: url.searchParams.get("paymentReference")
    });
    const order = await applyPaymentEvent(event);

    return Response.json({
      ok: true,
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
