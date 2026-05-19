import { getCurrentUser } from "@/server/auth/session";
import { getPipelineHealth, getServiceHealth } from "@/lib/moderation/health-check";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const url = new URL(request.url);
  const service = url.searchParams.get("service");

  try {
    if (service) {
      const health = await getServiceHealth(service);
      if (!health) {
        return Response.json({
          errors: [`Unknown service: ${service}. Available: database, text_moderation, queue_system, aggregation_pipeline, alert_system`],
        }, { status: 400 });
      }
      const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
      return Response.json({ data: health }, { status: statusCode });
    }

    const pipelineHealth = await getPipelineHealth();
    const statusCode = pipelineHealth.overall === "healthy" ? 200
      : pipelineHealth.overall === "degraded" ? 200
      : 503;

    return Response.json({ data: pipelineHealth }, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return Response.json({ errors: [message] }, { status: 503 });
  }
}
