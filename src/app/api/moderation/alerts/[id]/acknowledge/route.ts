import { getCurrentUser } from "@/server/auth/session";
import { acknowledgeAlert } from "@/lib/moderation/alert-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const { id } = await params;

  try {
    const success = await acknowledgeAlert(id);
    if (!success) {
      return Response.json({ errors: ["Alert not found"] }, { status: 404 });
    }
    return Response.json({ data: { acknowledged: true } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to acknowledge alert";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
