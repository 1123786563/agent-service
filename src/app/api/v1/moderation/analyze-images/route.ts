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

  const files = formData.getAll("images");
  if (!files.length || !(files[0] instanceof File)) {
    return Response.json({ errors: ["Missing 'images' files field"] }, { status: 400 });
  }

  const results = [];
  const overallStart = Date.now();

  for (const file of files) {
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    results.push(analyzeImageUpload(buffer, file.name, file.type));
  }

  const totalProcessingTimeMs = Date.now() - overallStart;

  const batchResult = {
    results,
    totalProcessingTimeMs,
    safeCount: results.filter((r) => r.safetyCategory === "safe").length,
    suspiciousCount: results.filter((r) => r.safetyCategory === "suspicious").length,
    unsafeCount: results.filter((r) => r.safetyCategory === "unsafe").length,
  };

  await logApiUsage({
    apiKeyId: auth.apiKey.id,
    endpoint: "/api/v1/moderation/analyze-images",
    method: "POST",
    statusCode: 200,
    responseMs: Date.now() - start,
  }).catch(() => {});

  return Response.json({ data: batchResult }, { status: 200 });
}
