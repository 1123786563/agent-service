import { getCurrentUser } from "@/server/auth/session";
import { createDispute } from "@/server/disputes/service";
import { getServiceOrderById } from "@/server/orders/service";

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

    const userEmail = user.email.toLowerCase();
    const hasAccess =
      user.role === "ADMIN" ||
      order.providerId === user.id ||
      order.buyerEmail.toLowerCase() === userEmail;

    if (!hasAccess) {
      return Response.json({
        errors: ["Order access is required"]
      }, {
        status: 403
      });
    }

    await createDispute({
      orderId: id,
      openedByUserId: user.id,
      reason: "User requested dispute from order screen"
    });

    return Response.redirect(new URL(user.role === "CREATOR" ? "/creator/orders" : "/account/orders", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not dispute order";
    const status = message === "Service order not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
