# Notification System — Developer Guide

How to extend the notification system with new notification types.

---

## Architecture Overview

The notification system has four layers:

```
Prisma Schema (data model)
    ↓
REST API (CRUD + preferences)
    ↓
WebSocket Push (real-time delivery)
    ↓
Frontend (bell, dropdown, page, toasts)
```

Key files:

| Layer | File |
|-------|------|
| Schema | `prisma/schema.prisma` — `NotificationType` enum, `Notification` model, `NotificationPreference` model |
| API | `src/app/api/notifications/route.ts` (list), `[id]/read/route.ts` (mark read), `mark-all-read/route.ts`, `unread-count/route.ts`, `preferences/route.ts` |
| WebSocket | `src/server/notifications/ws-manager.ts` — connection manager, `sendNotificationToUser()` |
| Email digest | `src/server/notifications/email-digest.ts` — `sendDigestEmails()` |
| WS route | `src/app/api/notifications/ws/route.ts` — health check + integration docs |

---

## Adding a New Notification Type

### Step 1: Add the Enum Value

Edit `prisma/schema.prisma` and add the new value to the `NotificationType` enum:

```prisma
enum NotificationType {
  ORDER_STATUS_CHANGED
  DELIVERY_SUBMITTED
  PAYMENT_RECEIVED
  DISPUTE_OPENED
  REVIEW_RECEIVED
  SYSTEM_ANNOUNCEMENT
  YOUR_NEW_TYPE           // ← add here
}
```

Run the migration:

```bash
npx prisma migrate dev --name add_your_new_type
npx prisma generate
```

### Step 2: Create Notifications in Business Logic

Import Prisma and the WebSocket push helper wherever the event occurs:

```typescript
import { prisma } from "@/server/db";
import { sendNotificationToUser } from "@/server/notifications/ws-manager";

async function handleYourEvent(userId: string, eventData: { ... }) {
  // Create the notification in the database
  const notification = await prisma.notification.create({
    data: {
      userId,
      type: "YOUR_NEW_TYPE",
      title: "New event occurred",
      body: `Details about the event...`,
      link: `/resource/${eventData.id}`,
    },
  });

  // Push to connected WebSocket clients in real-time
  sendNotificationToUser(userId, {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    readAt: notification.readAt,
    createdAt: notification.createdAt.toISOString(),
  });
}
```

That's it for the backend — the new type will automatically:

- Appear in the `GET /api/notifications` list (no code change needed, it uses `z.nativeEnum(NotificationType)`)
- Show up in preferences (`GET /api/notifications/preferences` iterates all enum values)
- Be included in email digests if the user hasn't disabled email for this type
- Be selectable as a filter in the preferences API

### Step 3: Update the Frontend

1. If the frontend has a hardcoded list of notification type labels, add the new type. The shared client is in `src/lib/notifications.ts`.

2. If the type needs special rendering (icon, color, deep link), add it to the notification type mapping in the frontend components:

   - `src/components/notification-bell.tsx` — dropdown item rendering
   - `src/app/notifications/page.tsx` — full page listing
   - `src/components/notification-toast.tsx` — toast display

### Step 4: Seed Data (Optional)

Add sample entries in `prisma/seed.ts` for local development:

```typescript
await prisma.notification.create({
  data: {
    userId: firstUser.id,
    type: "YOUR_NEW_TYPE",
    title: "Sample notification",
    body: "This is a test notification for YOUR_NEW_TYPE",
    link: "/sample",
  },
});
```

---

## WebSocket Integration with a Custom Server

Next.js App Router route handlers don't support WebSocket upgrades natively. To enable real-time push, run a custom Node.js server alongside Next.js.

### Server Setup

```typescript
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { addConnection, removeConnection } from "./src/server/notifications/ws-manager";

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server, path: "/api/notifications/ws" });

  wss.on("connection", async (ws, req) => {
    // Authenticate — extract session cookie and validate
    const user = await authenticateUserFromRequest(req);
    if (!user) {
      ws.close(4001, "Unauthorized");
      return;
    }

    addConnection(user.id, ws);

    ws.on("close", () => {
      removeConnection(user.id, ws);
    });
  });

  server.listen(3000);
});
```

### Push Protocol

When `sendNotificationToUser(userId, notification)` is called, each connected WebSocket client for that user receives:

```json
{
  "event": "notification",
  "data": {
    "id": "clx...",
    "userId": "clx...",
    "type": "ORDER_STATUS_CHANGED",
    "title": "订单状态更新",
    "body": "您的订单已发货",
    "link": "/orders/clx...",
    "readAt": null,
    "createdAt": "2026-05-19T12:00:00.000Z"
  }
}
```

### Client-Side Connection

```typescript
const ws = new WebSocket(`ws://${window.location.host}/api/notifications/ws`);

ws.onmessage = (event) => {
  const { event: type, data } = JSON.parse(event.data);
  if (type === "notification") {
    // Show toast, update badge, etc.
  }
};

ws.onclose = () => {
  // Reconnect after a delay
  setTimeout(connect, 3000);
};
```

---

## Email Digest

`sendDigestEmails()` in `src/server/notifications/email-digest.ts` is designed to run on a schedule (e.g., daily cron). It:

1. Finds all users with unread notifications older than 24 hours.
2. Filters by each user's email preference per notification type.
3. Sends a plain-text summary via Resend.
4. Returns `{ sentCount, totalUsers }`.

### Scheduling

Call it from a cron route or external scheduler:

```typescript
// src/app/api/cron/digest/route.ts
import { sendDigestEmails } from "@/server/notifications/email-digest";

export async function POST(request: Request) {
  // Verify cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await sendDigestEmails();
  return Response.json(result);
}
```

---

## Checklist for New Notification Types

- [ ] Add enum value to `NotificationType` in `prisma/schema.prisma`
- [ ] Run `npx prisma migrate dev` and `npx prisma generate`
- [ ] Call `prisma.notification.create()` + `sendNotificationToUser()` at the event source
- [ ] Add frontend rendering for the new type (if custom display is needed)
- [ ] Add seed data in `prisma/seed.ts`
- [ ] Add the type label to any user-facing type maps or i18n files
