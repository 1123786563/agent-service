import { getCurrentUser } from "@/server/auth/session";
import { acceptLatestDelivery } from "@/server/deliveries/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.redirect(new URL("/login", request.url), 303);
  }

  const { id } = await params;

  try {
    await acceptLatestDelivery({
      orderId: id,
      buyerEmail: user.email
    });

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
