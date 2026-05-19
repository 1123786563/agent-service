import { generateOpenApiSpec } from "@/lib/moderation/openapi-spec";

export async function GET() {
  const spec = generateOpenApiSpec();
  return Response.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
