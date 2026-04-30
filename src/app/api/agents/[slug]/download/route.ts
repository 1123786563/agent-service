import { notFound } from "next/navigation";
import {
  getPublishedAgentPackageBySlug,
  incrementPublishedAgentPackageDownloadCount
} from "@/server/agents/package-service";
import { readStoredZip } from "@/server/storage/local-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agentPackage = await getPublishedAgentPackageBySlug(slug);

  if (!agentPackage) {
    notFound();
  }

  await incrementPublishedAgentPackageDownloadCount(slug);
  const buffer = await readStoredZip(agentPackage.zipFileName);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${agentPackage.slug}.zip"`,
      "Content-Length": String(buffer.byteLength)
    }
  });
}
