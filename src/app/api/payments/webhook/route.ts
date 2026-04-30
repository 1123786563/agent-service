import { applyPaymentEvent, getPaymentAdapter, getPaymentProvider } from "@/server/payments/adapter";

export async function POST(request: Request) {
  try {
    const adapter = getPaymentAdapter(getPaymentProvider());
    const event = await adapter.parseWebhookRequest(request);
    const order = await applyPaymentEvent(event);

    return Response.json({
      ok: true,
      type: event.type,
      orderId: event.orderId,
      orderStatus: order?.status ?? null,
      paymentStatus: order?.paymentStatus ?? null
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
