import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("connected", { userId: user.id });

      // Poll for new notifications every 5 seconds
      let lastCheck = new Date();
      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const newNotifications = await prisma.notification.findMany({
            where: {
              userId: user.id,
              createdAt: { gt: lastCheck },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          });

          if (newNotifications.length > 0) {
            lastCheck = new Date();
            for (const n of newNotifications) {
              send("notification", {
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                actionUrl: n.actionUrl,
                createdAt: n.createdAt.toISOString(),
              });
            }
          }

          // Heartbeat to keep connection alive
          send("heartbeat", { ts: Date.now() });
        } catch {
          // Ignore DB errors on poll — will retry next interval
        }
      }, 5000);

      // Clean up on close
      const cleanup = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // AbortSignal for cleanup
      const abortHandler = () => cleanup();
      // Request keeps alive until client disconnects — setInterval runs until closed
      // Use a 5-minute max lifetime to prevent resource leaks
      setTimeout(cleanup, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
