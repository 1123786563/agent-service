import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { updateThreshold, deleteThreshold } from "@/lib/moderation/alert-service";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  metric: z.string().min(1).optional(),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq"]).optional(),
  threshold: z.number().optional(),
  windowMinutes: z.number().min(1).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  isEnabled: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const { id } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  try {
    const updated = await updateThreshold(id, parsed.data);
    if (!updated) {
      return Response.json({ errors: ["Threshold not found"] }, { status: 404 });
    }
    return Response.json({ data: updated }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update threshold";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteThreshold(id);
    if (!deleted) {
      return Response.json({ errors: ["Threshold not found"] }, { status: 404 });
    }
    return Response.json({ data: { deleted: true } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete threshold";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
