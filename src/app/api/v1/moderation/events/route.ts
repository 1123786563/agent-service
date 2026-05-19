import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { subscribeToModerationEvents, getRecentEvents, formatSSE } from "@/lib/moderation/event-stream";

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/event-stream")) {
    const events = getRecentEvents(50);
    return Response.json({ data: events }, { status: 200 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const recent = getRecentEvents(20);
      for (const event of recent) {
        controller.enqueue(encoder.encode(formatSSE(event)));
      }

      const unsubscribe = subscribeToModerationEvents((event) => {
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          unsubscribe();
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
