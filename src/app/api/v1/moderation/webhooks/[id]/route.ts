import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { deleteWebhook } from "@/lib/moderation/webhook-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const { id } = await params;

  try {
    await deleteWebhook(id, auth.apiKey.id);
    return Response.json({ data: { deleted: true } }, { status: 200 });
  } catch {
    return Response.json({ errors: ["Webhook not found"] }, { status: 404 });
  }
}
