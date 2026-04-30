import { createPaymentSessionForOrder } from "@/server/payments/adapter";
import { getCurrentUser } from "@/server/auth/session";
import { getServiceOrderById } from "@/server/orders/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"), 303);
  }

  const { id } = await params;

  try {
    const order = await getServiceOrderById(id);
    if (!order) {
      return Response.json({
        errors: ["Service order not found"]
      }, {
        status: 404
      });
    }

    if (order.buyerEmail.toLowerCase() !== user.email.toLowerCase()) {
      return Response.json({
        errors: ["Buyer access is required"]
      }, {
        status: 403
      });
    }

    const session = await createPaymentSessionForOrder(id);
    return Response.redirect(session.checkoutUrl, 303);
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
