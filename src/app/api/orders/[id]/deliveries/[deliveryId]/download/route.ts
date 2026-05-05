import { recordAuditLog } from "@/server/audit/service";
import { getCurrentSession } from "@/server/auth/session";
import { getDeliveryForDownload } from "@/server/deliveries/service";
import { authorizeDeliveryAssetDownload } from "@/server/storage/download-authorization";
import { createDownloadTicket, verifyAndConsumeDownloadTicket } from "@/server/storage/download-tickets";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; deliveryId: string }> }
) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return Response.redirect(new URL("/login", request.url), 303);
  }
  const user = session.user;

  const { id, deliveryId } = await params;

  try {
    const authorization = await authorizeDeliveryAssetDownload({
      orderId: id,
      deliveryId,
      requester: {
        userId: user.id,
        email: user.email,
        role: user.role
      }
    });
    const url = new URL(request.url);
    const ticket = url.searchParams.get("ticket") ?? createDownloadTicket({
      resourceType: authorization.resourceType,
      resourceId: authorization.resourceId,
      objectKey: authorization.objectKey,
      actorScope: authorization.actorScope,
      actorId: user.id,
      sessionId: session.id,
      audience: "delivery-download",
      resourceVersion: authorization.resourceVersion
    }, {
      singleUse: true
    });
    await verifyAndConsumeDownloadTicket(ticket, {
      audience: "delivery-download",
      actorId: user.id
    });
    const result = await getDeliveryForDownload({
      orderId: id,
      deliveryId,
      requester: {
        userId: user.id,
        email: user.email,
        role: user.role
      }
    });
    await recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "asset.download",
      targetType: "Delivery",
      targetId: authorization.resourceId,
      afterSnapshot: {
        orderId: id,
        objectKey: authorization.objectKey
      },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent")
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
