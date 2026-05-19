// WebSocket endpoint for real-time notifications.
//
// Next.js App Router route handlers don't natively support WebSocket upgrades.
// To enable live push, integrate with a custom Node.js server using the ws-manager module:
//
//   import { addConnection, removeConnection } from "@/server/notifications/ws-manager";
//   import { WebSocketServer } from "ws";
//
//   const wss = new WebSocketServer({ server });
//   wss.on("connection", async (ws, req) => {
//     const user = await authenticateUserFromRequest(req);
//     if (!user) { ws.close(4001, "Unauthorized"); return; }
//     addConnection(user.id, ws);
//     ws.on("close", () => removeConnection(user.id, ws));
//   });
//
// The sendNotificationToUser helper in ws-manager pushes to all connected clients for a user.

import { getOnlineUserCount } from "@/server/notifications/ws-manager";

export async function GET() {
  return Response.json({
    message: "WebSocket endpoint — upgrade via custom server required",
    onlineUsers: getOnlineUserCount()
  });
}
