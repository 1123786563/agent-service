import { getCurrentUser } from "@/server/auth/session";
import { cancelServiceOrder, getServiceOrderById } from "@/server/orders/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.redirect(new URL("/login", request.url), 303);
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

    await cancelServiceOrder({
      orderId: id
    });

    return Response.redirect(new URL("/account/orders", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel order";
    const status = message === "Service order not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
