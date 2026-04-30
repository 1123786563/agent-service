import { getCurrentUser } from "@/server/auth/session";
import { getDeliveryForDownload } from "@/server/deliveries/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; deliveryId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.redirect(new URL("/login", request.url), 303);
  }

  const { id, deliveryId } = await params;

  try {
    const result = await getDeliveryForDownload({
      orderId: id,
      deliveryId,
      requester: {
        userId: user.id,
        email: user.email,
        role: user.role
      }
    });

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${result.delivery.fileName}"`,
        "Content-Length": String(result.buffer.byteLength)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not download delivery";
    const status = message === "Delivery not found" ? 404 : 403;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
