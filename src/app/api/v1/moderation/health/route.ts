import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { checkHealth, checkServiceHealth } from "@/lib/moderation/health-check";

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const url = new URL(request.url);
  const service = url.searchParams.get("service");

  if (service) {
    const result = await checkServiceHealth(service);
    return Response.json({ data: result }, { status: 200 });
  }

  const pipeline = await checkHealth();
  return Response.json({ data: pipeline }, { status: 200 });
}
