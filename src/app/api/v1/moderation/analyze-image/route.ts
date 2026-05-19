import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { logApiUsage } from "@/lib/moderation/usage-tracking";
import { analyzeImageUpload } from "@/lib/moderation/image-analyzer";

export async function POST(request: Request) {
  const start = Date.now();
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ errors: ["Request must be multipart/form-data"] }, { status: 400 });
  }

  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return Response.json({ errors: ["Missing 'image' file field"] }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = analyzeImageUpload(buffer, file.name, file.type);

  await logApiUsage({
    apiKeyId: auth.apiKey.id,
    endpoint: "/api/v1/moderation/analyze-image",
    method: "POST",
    statusCode: 200,
    responseMs: Date.now() - start,
  }).catch(() => {});

  return Response.json({ data: result }, { status: 200 });
}
