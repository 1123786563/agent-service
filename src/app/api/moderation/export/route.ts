import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

const exportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  period: z.coerce.number().min(1).max(365).default(30),
  contentType: z.enum(["TEXT", "IMAGE", "all"]).default("all"),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "all"]).default("all"),
  status: z.enum(["PENDING", "ASSIGNED", "IN_REVIEW", "RESOLVED", "ESCALATED", "all"]).default("all"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = exportQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const { format, period, contentType, severity, status } = parsed.data;
  const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

  const where = {
    createdAt: { gte: startDate },
    ...(contentType !== "all" && { contentType }),
    ...(severity !== "all" && { priority: severity }),
    ...(status !== "all" && { status }),
  };

  try {
    const items = await prisma.contentQueueItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    if (format === "json") {
      return Response.json({
        data: items,
        meta: {
          exportedAt: new Date().toISOString(),
          period,
          filters: { contentType, severity, status },
          totalRecords: items.length,
        },
      }, { status: 200 });
    }

    // CSV export
    const headers = [
      "id", "contentType", "priority", "status", "toxicityScore",
      "language", "categories", "assignedToId", "resolution",
      "createdAt", "resolvedAt", "escalatedAt",
    ];

    const csvRows = [
      headers.join(","),
      ...items.map((item) =>
        headers.map((h) => {
          const val = item[h as keyof typeof item];
          if (val === null || val === undefined) return "";
          if (Array.isArray(val)) return `"${val.join(";")}"`;
          if (val instanceof Date) return val.toISOString();
          if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        }).join(",")
      ),
    ];

    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="moderation-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
