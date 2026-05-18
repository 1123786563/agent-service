import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { dashboardQuerySchema, dashboardResponseSchema } from "@/server/dashboard/schemas";
import { getProjectDashboard } from "@/server/dashboard/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const { projectId } = await params;

  const url = new URL(request.url);
  const parsed = dashboardQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      { errors: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const data = await getProjectDashboard(projectId, parsed.data.range);
    const validated = dashboardResponseSchema.parse(data);

    return Response.json(validated, {
      headers: {
        "Cache-Control": "max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message === "Project not found" ? 404 : 500;

    return Response.json({ errors: [message] }, { status });
  }
}
