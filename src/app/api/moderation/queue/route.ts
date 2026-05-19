import { NextResponse } from "next/server";
import { generateQueueItems } from "@/server/moderation/mock-data";

const QUEUE = generateQueueItems(50);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severity = searchParams.get("severity");
  const status = searchParams.get("status");
  const language = searchParams.get("language");
  const contentType = searchParams.get("contentType");
  const limit = Number(searchParams.get("limit") ?? 20);
  const offset = Number(searchParams.get("offset") ?? 0);

  let filtered = [...QUEUE];
  if (severity) filtered = filtered.filter((item) => item.severity === severity);
  if (status) filtered = filtered.filter((item) => item.status === status);
  if (language) filtered = filtered.filter((item) => item.language === language);
  if (contentType) filtered = filtered.filter((item) => item.contentType === contentType);

  filtered.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity]
      || new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
  });

  return NextResponse.json({
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    hasMore: offset + limit < filtered.length,
  });
}
