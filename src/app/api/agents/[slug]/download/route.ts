import { notFound } from "next/navigation";
import {
  incrementPublishedAgentPackageDownloadCount
} from "@/server/agents/package-service";
import { recordAuditLog } from "@/server/audit/service";
import { authorizeAgentZipDownload } from "@/server/storage/download-authorization";
import { createDownloadTicket, verifyAndConsumeDownloadTicket } from "@/server/storage/download-tickets";
import { readStoredZip } from "@/server/storage/local-storage";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let authorization;
  try {
    authorization = await authorizeAgentZipDownload(slug);
  } catch {
    notFound();
  }

  if (authorization.pricingType === "PAID") {
    const url = new URL(request.url);
    const paid = url.searchParams.get("paid");
    if (paid !== "1") {
      return Response.json(
        { error: "Payment required", priceCents: authorization.priceCents },
        { status: 402 }
      );
    }
  }

  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket") ?? createDownloadTicket({
    resourceType: authorization.resourceType,
    resourceId: authorization.resourceId,
    objectKey: authorization.objectKey,
    actorScope: authorization.actorScope,
    audience: "agent-download",
    resourceVersion: authorization.resourceVersion
  });
  await verifyAndConsumeDownloadTicket(ticket, { audience: "agent-download" });

  await incrementPublishedAgentPackageDownloadCount(slug);
  const buffer = await readStoredZip(authorization.fileName);
  await recordAuditLog({
    actorRole: "anonymous",
    action: "asset.download",
    targetType: "AgentPackage",
    targetId: authorization.resourceId,
    afterSnapshot: {
      slug: authorization.slug,
      objectKey: authorization.objectKey
    },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent")
  });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${authorization.slug}.zip"`,
      "Content-Length": String(buffer.byteLength)
    }
  });
}
