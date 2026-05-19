import { getCurrentUser } from "@/server/auth/session";
import { acceptLatestDelivery } from "@/server/deliveries/service";
import { getServiceOrderById } from "@/server/orders/service";
import { notifyOrderCompleted } from "@/server/notifications/events";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.redirect(new URL("/login", request.url), 303);
  }

  const { id } = await params;

  try {
    const order = await getServiceOrderById(id);

    await acceptLatestDelivery({
      orderId: id,
      buyerEmail: user.email
    });

    // Fire-and-forget notification
    if (order) {
      notifyOrderCompleted(order.providerId, order.buyerUserId, order.title, id).catch(() => {});
    }

    return Response.redirect(new URL("/account/orders", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete order";
    const status = message === "Service order not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
