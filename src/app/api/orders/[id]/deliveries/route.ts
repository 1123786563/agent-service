import { WhitelistStatus } from "@prisma/client";
import { getCurrentUser, requireCreator } from "@/server/auth/session";
import { createDeliveryForOrder } from "@/server/deliveries/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.redirect(new URL("/login", request.url), 303);
  }

  if (currentUser.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return Response.json({
      errors: ["Creator whitelist is required"]
    }, {
      status: 403
    });
  }

  const creator = await requireCreator();
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file");
  const note = String(formData.get("note") ?? "").trim();

  if (!(file instanceof File)) {
    return Response.json({
      errors: ["Missing delivery file"]
    }, {
      status: 400
    });
  }

  try {
    await createDeliveryForOrder({
      orderId: id,
      providerId: creator.id,
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      note
    });

    return Response.redirect(new URL("/creator/orders", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload delivery";
    const status = message === "Service order not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
