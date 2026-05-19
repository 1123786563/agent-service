# Notification System — API Reference

All notification endpoints require authentication via the existing session mechanism (`getCurrentUser()`). Unauthenticated requests return `401 Unauthorized`.

Base path: `/api/notifications`

---

## List Notifications

```
GET /api/notifications
```

Returns paginated notifications for the authenticated user, ordered by `createdAt` descending.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | `string` | — | Pagination cursor (notification ID). Returns items created before this ID. |
| `limit` | `integer` | `20` | Items per page (1–100). |
| `read` | `"true" \| "false" \| "all"` | `"all"` | Filter by read status. |
| `type` | `NotificationType` | — | Filter by notification type. |

### Response — 200

```json
{
  "data": [
    {
      "id": "clx...",
      "userId": "clx...",
      "type": "ORDER_STATUS_CHANGED",
      "title": "订单状态更新",
      "body": "您的订单已发货",
      "link": "/orders/clx...",
      "readAt": null,
      "createdAt": "2026-05-19T12:00:00.000Z"
    }
  ],
  "pagination": {
    "nextCursor": "clx...",
    "hasMore": true
  }
}
```

### Error Responses

| Status | Body |
|--------|------|
| `400` | `{ "error": "Invalid query parameters", "details": { ... } }` |
| `401` | `{ "error": "Unauthorized" }` |

### Example — Get unread order notifications, page 2

```bash
curl -b cookie.jar \
  "/api/notifications?read=false&type=ORDER_STATUS_CHANGED&cursor=clx_prev_last_id&limit=20"
```

---

## Mark Notification as Read

```
PATCH /api/notifications/{id}/read
```

Marks a single notification as read. If already read, returns the notification unchanged.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Notification ID |

### Response — 200

```json
{
  "data": {
    "id": "clx...",
    "userId": "clx...",
    "type": "ORDER_STATUS_CHANGED",
    "title": "订单状态更新",
    "body": "您的订单已发货",
    "link": "/orders/clx...",
    "readAt": "2026-05-19T13:00:00.000Z",
    "createdAt": "2026-05-19T12:00:00.000Z"
  }
}
```

### Error Responses

| Status | Body |
|--------|------|
| `401` | `{ "error": "Unauthorized" }` |
| `404` | `{ "error": "Notification not found" }` |

---

## Mark All as Read

```
POST /api/notifications/mark-all-read
```

Bulk-marks all unread notifications for the authenticated user as read. No request body required.

### Response — 200

```json
{
  "data": {
    "updatedCount": 5
  }
}
```

### Error Responses

| Status | Body |
|--------|------|
| `401` | `{ "error": "Unauthorized" }` |

---

## Get Unread Count

```
GET /api/notifications/unread-count
```

Returns the number of unread notifications for the authenticated user.

### Response — 200

```json
{
  "data": {
    "unreadCount": 3
  }
}
```

### Error Responses

| Status | Body |
|--------|------|
| `401` | `{ "error": "Unauthorized" }` |

---

## Get Notification Preferences

```
GET /api/notifications/preferences
```

Returns the authenticated user's notification preferences for all notification types. Types without an explicit preference default to `emailEnabled: true, pushEnabled: true`.

### Response — 200

```json
{
  "data": [
    {
      "notificationType": "ORDER_STATUS_CHANGED",
      "emailEnabled": true,
      "pushEnabled": true
    },
    {
      "notificationType": "DELIVERY_SUBMITTED",
      "emailEnabled": false,
      "pushEnabled": true
    },
    {
      "notificationType": "PAYMENT_RECEIVED",
      "emailEnabled": true,
      "pushEnabled": true
    },
    {
      "notificationType": "DISPUTE_OPENED",
      "emailEnabled": true,
      "pushEnabled": true
    },
    {
      "notificationType": "REVIEW_RECEIVED",
      "emailEnabled": true,
      "pushEnabled": false
    },
    {
      "notificationType": "SYSTEM_ANNOUNCEMENT",
      "emailEnabled": true,
      "pushEnabled": true
    }
  ]
}
```

### Error Responses

| Status | Body |
|--------|------|
| `401` | `{ "error": "Unauthorized" }` |

---

## Update Notification Preferences

```
PUT /api/notifications/preferences
```

Batch-upserts notification preferences for the authenticated user. Only the types included in the request are updated; omitted types retain their current setting.

### Request Body

```json
{
  "preferences": [
    {
      "notificationType": "ORDER_STATUS_CHANGED",
      "emailEnabled": false,
      "pushEnabled": true
    },
    {
      "notificationType": "DELIVERY_SUBMITTED",
      "emailEnabled": true
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `preferences` | `array` | Yes | List of preference updates |
| `preferences[].notificationType` | `NotificationType` | Yes | The notification type to configure |
| `preferences[].emailEnabled` | `boolean` | No | Whether to send email digests for this type |
| `preferences[].pushEnabled` | `boolean` | No | Whether to send real-time push for this type |

### Response — 200

Returns the upserted preference records:

```json
{
  "data": [
    {
      "id": "clx...",
      "userId": "clx...",
      "notificationType": "ORDER_STATUS_CHANGED",
      "emailEnabled": false,
      "pushEnabled": true
    },
    {
      "id": "clx...",
      "userId": "clx...",
      "notificationType": "DELIVERY_SUBMITTED",
      "emailEnabled": true,
      "pushEnabled": true
    }
  ]
}
```

### Error Responses

| Status | Body |
|--------|------|
| `400` | `{ "error": "Invalid request body", "details": { ... } }` |
| `401` | `{ "error": "Unauthorized" }` |

---

## WebSocket Endpoint

```
GET /api/notifications/ws
```

This is a documentation/health-check endpoint. Next.js App Router does not natively support WebSocket upgrades. To enable real-time push, integrate with a custom Node.js server.

### Response — 200 (health check)

```json
{
  "message": "WebSocket endpoint — upgrade via custom server required",
  "onlineUsers": 3
}
```

### Server Integration

See the [Developer Guide](./developer-guide.md) for instructions on wiring up WebSocket with a custom server.

---

## Notification Types

The following `NotificationType` enum values are defined:

| Value | Description |
|-------|-------------|
| `ORDER_STATUS_CHANGED` | Order status transition (e.g. paid, shipped, completed) |
| `DELIVERY_SUBMITTED` | Service provider submitted a delivery |
| `PAYMENT_RECEIVED` | Payment confirmed for an order |
| `DISPUTE_OPENED` | A dispute was opened on an order |
| `REVIEW_RECEIVED` | A new review was posted |
| `SYSTEM_ANNOUNCEMENT` | Platform-wide or targeted system announcement |

---

## Email Digest

The `sendDigestEmails()` function (in `src/server/notifications/email-digest.ts`) is designed to be called from a cron job or API route. It:

1. Queries all users with unread notifications older than 24 hours.
2. Filters notifications by each user's email preference per type.
3. Sends a summary email via Resend.
4. Returns `{ sentCount, totalUsers }`.

Required environment variables:
- `RESEND_API_KEY` — Resend API key
- `EMAIL_FROM` — Sender address (defaults to `onboarding@resend.dev`)

---

## Data Model

### Notification

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (cuid) | Primary key |
| `userId` | `string` | Owner (FK → User) |
| `type` | `NotificationType` | Notification category |
| `title` | `string` | Short summary |
| `body` | `string` | Full message |
| `link` | `string?` | Deep link to the related resource |
| `readAt` | `DateTime?` | When the user read it (null = unread) |
| `createdAt` | `DateTime` | Creation timestamp |

### NotificationPreference

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (cuid) | Primary key |
| `userId` | `string` | Owner (FK → User) |
| `notificationType` | `NotificationType` | The type this preference applies to |
| `emailEnabled` | `boolean` | Whether email digests are sent (default: true) |
| `pushEnabled` | `boolean` | Whether real-time push is sent (default: true) |

Unique constraint: `(userId, notificationType)`
