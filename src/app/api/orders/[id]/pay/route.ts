import { createPaymentSessionForOrder } from "@/server/payments/adapter";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = await createPaymentSessionForOrder(id);
    return Response.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create payment session";
    const status = message === "Service order not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
