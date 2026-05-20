import { WhitelistStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, requireCreator } from "@/server/auth/session";
import { createAgentPackageFromZip } from "@/server/agents/package-service";
import { rateLimiter, RATE_LIMIT_UPLOAD } from "@/server/rate-limit";

const MAX_AGENT_FILE_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return Response.json({
      errors: ["Creator whitelist is required"]
    }, {
      status: 403
    });
  }

  const user = await requireCreator();

  const uploadLimit = await rateLimiter.check(`upload:${user.id}`, RATE_LIMIT_UPLOAD);
  if (!uploadLimit.allowed) {
    return Response.json({
      errors: ["Rate limited"]
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(uploadLimit.retryAfterMs / 1000)) }
    });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({
      errors: ["Missing ZIP file"]
    }, {
      status: 400
    });
  }

  if (file.size > MAX_AGENT_FILE_BYTES) {
    return Response.json({
      errors: [`File exceeds maximum size of ${MAX_AGENT_FILE_BYTES / (1024 * 1024)}MB`]
    }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await createAgentPackageFromZip({
    ownerId: user.id,
    fileName: file.name,
    buffer
  });

  if (!result.ok) {
    return Response.json({
      errors: result.errors,
      risks: result.risks
    }, {
      status: 400
    });
  }

  redirect(`/agents/${result.package.slug}`);
}
