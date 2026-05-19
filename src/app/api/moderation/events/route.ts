import { getCurrentUser } from "@/server/auth/session";
import { subscribeToModerationEvents, getRecentEvents, formatSSE } from "@/lib/moderation/event-stream";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const url = new URL(request.url);
  const accept = request.headers.get("accept") ?? "";

  // Return recent events as JSON when not requesting SSE
  if (!accept.includes("text/event-stream")) {
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
    const events = getRecentEvents(limit);
    return Response.json({ data: events }, { status: 200 });
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: {"message":"Connected to moderation event stream"}\n\n`));

      // Send recent events
      const recent = getRecentEvents(20);
      for (const event of recent) {
        controller.enqueue(encoder.encode(formatSSE(event)));
      }

      // Subscribe to new events
      const unsubscribe = subscribeToModerationEvents((event) => {
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          unsubscribe();
        }
      });

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 30000);

      // Clean up on close
      const cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };

      // Use request signal for cleanup in Next.js
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
