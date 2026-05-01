# Trading and Asset Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next infrastructure layer for the Hermes-agent marketplace: controlled asset downloads, real payment provider support, refund/dispute records, and settlement batch accounting.

**Architecture:** Keep the current Prisma-backed, server-rendered app shape and add narrow abstractions around storage, download authorization, payments, refunds, and settlements. Implement this as four sequential phases so each checkpoint is testable and can ship without blocking the next one.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Zod, Vitest, Playwright, local filesystem storage, S3-compatible storage adapter skeleton, dev payment adapter plus one real provider adapter.

---

## Scope Boundary

This plan implements the full program described in [2026-05-01-trading-and-asset-infrastructure-design.md](/Users/yongjunwu/trea/saas-idea/docs/superpowers/specs/2026-05-01-trading-and-asset-infrastructure-design.md).

This plan includes:

- Phase 5A controlled ZIP and delivery downloads with signed tickets
- Phase 5B payment ledger and real provider integration shape
- Phase 5C dispute and refund persistence with admin resolution flows
- Phase 5D settlement lines, settlement batches, and creator/admin settlement visibility

This plan does not include:

- Multiple live payment providers in production at the same time
- Automated arbitration rules
- Automatic payout to bank accounts or wallets
- Tax, invoicing, or full accounting ledger

## Implementation Strategy

The current codebase already has working local storage, a dev payment adapter, delivery uploads, dispute toggles, and settlement tracking fields. The lowest-risk path is to preserve those user flows while replacing the internals in layers:

1. Put files behind storage and download-ticket abstractions without changing marketplace behavior.
2. Add payment ledger and real-provider-ready event handling while keeping the dev adapter as the local baseline.
3. Split disputes and refunds into explicit entities so admin actions stop overloading `ServiceOrder`.
4. Replace the current settlement flags with real settlement lines and batches, then keep the legacy fields only as compatibility projections.

## File Structure

Expected file map for this program:

```text
prisma/
├── schema.prisma                                                # modify
└── migrations/...                                               # new migrations for 5A-5D

src/
├── app/
│   ├── admin/actions.ts                                         # modify
│   ├── admin/page.tsx                                           # modify
│   ├── admin/analytics/page.tsx                                 # modify
│   ├── creator/page.tsx                                         # modify
│   ├── creator/orders/page.tsx                                  # modify
│   ├── api/agents/[slug]/download/route.ts                      # modify
│   ├── api/orders/[id]/deliveries/[deliveryId]/download/route.ts# modify
│   ├── api/orders/[id]/pay/route.ts                             # modify
│   ├── api/payments/webhook/route.ts                            # modify
│   └── admin/actions.ts                                         # settlement batch actions stay here
├── components/
│   ├── order-status-pill.tsx                                    # modify
│   ├── dispute-order-button.tsx                                 # modify
│   └── settlement-status-pill.tsx                               # new
└── server/
    ├── agents/package-service.ts                                # modify
    ├── deliveries/service.ts                                    # modify
    ├── orders/service.ts                                        # modify
    ├── consultations/service.ts                                 # modify
    ├── auth/session.ts                                          # modify
    ├── audit/service.ts                                         # new
    ├── disputes/service.ts                                      # new
    ├── refunds/service.ts                                       # new
    ├── settlements/service.ts                                   # new
    ├── storage/
    │   ├── provider.ts                                          # new
    │   ├── local-provider.ts                                    # new
    │   ├── s3-provider.ts                                       # new skeleton
    │   ├── download-tickets.ts                                  # new
    │   ├── download-authorization.ts                            # new
    │   ├── local-storage.ts                                     # modify or slim into compatibility wrapper
    │   └── local-delivery-storage.ts                            # modify or slim into compatibility wrapper
    └── payments/
        ├── adapter.ts                                           # modify
        ├── dev-adapter.ts                                       # modify
        ├── ledger.ts                                            # new
        ├── stripe-adapter.ts                                    # new or provider-specific equivalent
        └── webhook-events.ts                                    # new

tests/
├── server/
│   ├── local-storage.test.ts                                    # modify
│   ├── local-delivery-storage.test.ts                           # modify
│   ├── agent-download-route.test.ts                             # modify
│   ├── delivery-download-route.test.ts                          # modify
│   ├── payment-route.test.ts                                    # modify
│   ├── order-service.test.ts                                    # modify
│   ├── admin-actions.test.ts                                    # modify
│   ├── download-ticket.test.ts                                  # new
│   ├── download-authorization.test.ts                           # new
│   ├── audit-service.test.ts                                    # new
│   ├── payment-ledger.test.ts                                   # new
│   ├── dispute-service.test.ts                                  # new
│   ├── refund-service.test.ts                                   # new
│   └── settlement-service.test.ts                               # new
└── e2e/
    ├── delivery.spec.ts                                         # modify
    ├── order-lifecycle.spec.ts                                  # modify
    └── settlement.spec.ts                                       # new
```

## Data Model Targets

### Phase 5A additions

- Add file metadata fields to `AgentPackage` and `Delivery`:
  - `objectKey`
  - `storageProvider`
  - `bucket`
  - `mimeType`
  - `contentDisposition`
  - `checksum`
  - `deletedAt`
- Add `AuditLog` for ticket issuance and private downloads

### Phase 5B additions

- Extend `PaymentStatus` with `CANCELLED`, later `REFUNDED` and `PARTIALLY_REFUNDED`
- Add `PaymentLedger` with provider ids, event ids, raw-event digest, idempotency key, and amount-in-minor-units fields

### Phase 5C additions

- Add `Dispute`
- Add `DisputeEvidence`
- Add `Refund`
- Add `workStartedAt` to `ServiceOrder`

### Phase 5D additions

- Add `SettlementLine`
- Add `SettlementBatch`
- Keep `ServiceOrder.settledAt` and `settlementReference` as compatibility fields until the UI fully reads from settlement tables

## Task Breakdown

### Task 1: Phase 5A Schema and Storage Metadata Backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase5a_asset_metadata/`
- Modify: `src/server/agents/package-service.ts`
- Modify: `src/server/deliveries/service.ts`
- Test: `tests/server/local-storage.test.ts`
- Test: `tests/server/local-delivery-storage.test.ts`

- [ ] **Step 1: Write failing schema-oriented tests for file metadata expectations**

```ts
it("stores checksum and object metadata for uploaded agent zips", async () => {
  const stored = await saveAgentZipLikeUpload(sampleZip);
  expect(stored.objectKey).toMatch(/^agents\//);
  expect(stored.storageProvider).toBe("local");
  expect(stored.checksum).toMatch(/^[a-f0-9]{64}$/);
});

it("stores checksum and object metadata for delivery uploads", async () => {
  const stored = await saveDeliveryLikeUpload(sampleFile);
  expect(stored.objectKey).toMatch(/^deliveries\//);
  expect(stored.storageProvider).toBe("local");
});
```

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `npm run test -- tests/server/local-storage.test.ts tests/server/local-delivery-storage.test.ts`
Expected: FAIL because storage helpers do not return object metadata yet.

- [ ] **Step 3: Extend Prisma models and migration for asset metadata and audit log**

```prisma
enum StorageProviderKind {
  LOCAL
  S3_COMPATIBLE
}

model AuditLog {
  id            String   @id @default(cuid())
  actorId       String?
  actorRole     String
  action        String
  targetType    String
  targetId      String
  beforeSnapshot Json?
  afterSnapshot  Json?
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime @default(now())
}
```

```prisma
model AgentPackage {
  // existing fields...
  objectKey          String?
  storageProvider    StorageProviderKind? @default(LOCAL)
  bucket             String?
  mimeType           String?
  contentDisposition String?
  checksum           String?
  deletedAt          DateTime?
}
```

- [ ] **Step 4: Backfill existing package and delivery rows in the migration**

```sql
UPDATE "AgentPackage"
SET "objectKey" = regexp_replace("zipFileUrl", '^/api/uploads/', 'agents/'),
    "storageProvider" = 'LOCAL',
    "mimeType" = 'application/zip'
WHERE "objectKey" IS NULL;
```

```sql
UPDATE "Delivery"
SET "objectKey" = regexp_replace("fileUrl", '^/api/deliveries/', 'deliveries/'),
    "storageProvider" = 'LOCAL'
WHERE "objectKey" IS NULL;
```

- [ ] **Step 5: Update current upload persistence to fill the new fields**

```ts
type StoredObject = {
  objectKey: string;
  storageProvider: "local";
  bucket: string | null;
  fileName: string;
  mimeType: string;
  contentDisposition: string;
  byteSize: number;
  checksum: string;
};
```

- [ ] **Step 6: Run migration, generate client, and re-run storage tests**

Run: `npm run prisma:generate`
Run: `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public' npx prisma migrate dev --name phase5a_asset_metadata`
Run: `npm run test -- tests/server/local-storage.test.ts tests/server/local-delivery-storage.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/agents/package-service.ts src/server/deliveries/service.ts tests/server/local-storage.test.ts tests/server/local-delivery-storage.test.ts
git commit -m "feat: add asset metadata and audit schema"
```

### Task 2: Storage Provider Abstraction and Local Provider Compatibility

**Files:**
- Create: `src/server/storage/provider.ts`
- Create: `src/server/storage/local-provider.ts`
- Create: `src/server/storage/s3-provider.ts`
- Modify: `src/server/storage/local-storage.ts`
- Modify: `src/server/storage/local-delivery-storage.ts`
- Test: `tests/server/local-storage.test.ts`
- Test: `tests/server/local-delivery-storage.test.ts`

- [ ] **Step 1: Write failing tests for provider-backed storage helpers**

```ts
it("reads a stored zip through the storage provider interface", async () => {
  const stream = await storageProvider.getObjectStream({ objectKey: "agents/demo.zip" });
  expect(stream).toBeDefined();
});

it("builds deterministic object keys for local agent packages", () => {
  expect(buildAgentObjectKey("Demo Agent.zip")).toMatch(/^agents\//);
});
```

- [ ] **Step 2: Run tests to confirm missing provider interface**

Run: `npm run test -- tests/server/local-storage.test.ts tests/server/local-delivery-storage.test.ts`
Expected: FAIL because `storageProvider` and builder helpers do not exist.

- [ ] **Step 3: Add the provider contract and local implementation**

```ts
export interface StorageProvider {
  kind: "local" | "s3-compatible";
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObjectStream(input: { objectKey: string }): Promise<NodeJS.ReadableStream>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  buildObjectKey(input: { scope: "agents" | "deliveries"; fileName: string }): string;
}
```

- [ ] **Step 4: Keep current local helpers as thin compatibility wrappers**

```ts
export async function readStoredZip(objectKey: string) {
  return getStorageProvider().getObjectStream({ objectKey });
}
```

- [ ] **Step 5: Add an S3-compatible adapter skeleton without wiring it live**

```ts
export class S3CompatibleStorageProvider implements StorageProvider {
  kind = "s3-compatible" as const;
  async putObject() {
    throw new Error("S3-compatible storage is not configured");
  }
}
```

- [ ] **Step 6: Re-run storage tests**

Run: `npm run test -- tests/server/local-storage.test.ts tests/server/local-delivery-storage.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/storage/provider.ts src/server/storage/local-provider.ts src/server/storage/s3-provider.ts src/server/storage/local-storage.ts src/server/storage/local-delivery-storage.ts tests/server/local-storage.test.ts tests/server/local-delivery-storage.test.ts
git commit -m "feat: add storage provider abstraction"
```

### Task 3: Download Tickets, Authorization, and Private Download Audit

**Files:**
- Create: `src/server/storage/download-tickets.ts`
- Create: `src/server/storage/download-authorization.ts`
- Create: `src/server/audit/service.ts`
- Modify: `src/app/api/agents/[slug]/download/route.ts`
- Modify: `src/app/api/orders/[id]/deliveries/[deliveryId]/download/route.ts`
- Modify: `src/server/auth/session.ts`
- Test: `tests/server/download-ticket.test.ts`
- Test: `tests/server/download-authorization.test.ts`
- Test: `tests/server/agent-download-route.test.ts`
- Test: `tests/server/delivery-download-route.test.ts`
- Test: `tests/server/audit-service.test.ts`

- [ ] **Step 1: Write failing tests for ticket expiry, audience, tamper detection, and authorization**

```ts
it("rejects an expired delivery ticket", async () => {
  const ticket = signDownloadTicket({ resourceType: "delivery_asset", expiresAt: pastDate });
  await expect(verifyDownloadTicket(ticket, { audience: "delivery-download" })).rejects.toThrow("expired");
});

it("rejects using an agent ticket on a delivery route", async () => {
  const ticket = signDownloadTicket({ resourceType: "agent_zip", audience: "agent-download" });
  await expect(verifyDownloadTicket(ticket, { audience: "delivery-download" })).rejects.toThrow("audience");
});
```

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `npm run test -- tests/server/download-ticket.test.ts tests/server/download-authorization.test.ts tests/server/agent-download-route.test.ts tests/server/delivery-download-route.test.ts`
Expected: FAIL because ticket and authorization services do not exist.

- [ ] **Step 3: Add the ticket service with HMAC signing and `keyId` support**

```ts
export type DownloadTicketPayload = {
  resourceType: "agent_zip" | "delivery_asset";
  resourceId: string;
  objectKey: string;
  actorScope: "anonymous" | "buyer" | "provider" | "admin";
  actorId?: string | null;
  sessionId?: string | null;
  audience: "agent-download" | "delivery-download";
  resourceVersion: string;
  jti: string;
  keyId: string;
  expiresAt: string;
};
```

- [ ] **Step 4: Add authorization checks for package and delivery resource state**

```ts
export async function authorizeAgentZipDownload(input: { slug: string; sessionId?: string | null }) {
  // published package for anonymous users, owner/admin for drafts, archived blocked
}
```

```ts
export async function authorizeDeliveryDownload(input: { orderId: string; deliveryId: string; userId: string }) {
  // buyer/provider/admin only, cancelled orders blocked, disputed orders allowed
}
```

- [ ] **Step 5: Update both download routes to issue tickets, verify tickets, and emit audit records**

```ts
const authorization = await authorizeAgentZipDownload(...);
const ticket = await createDownloadTicket(authorization);
const verified = await verifyDownloadTicket(url.searchParams.get("ticket"), { audience: "agent-download" });
await recordAuditLog({ action: "asset.download", targetType: "AgentPackage", targetId: authorization.resourceId });
```

- [ ] **Step 6: Re-run route and ticket tests**

Run: `npm run test -- tests/server/download-ticket.test.ts tests/server/download-authorization.test.ts tests/server/agent-download-route.test.ts tests/server/delivery-download-route.test.ts tests/server/audit-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/storage/download-tickets.ts src/server/storage/download-authorization.ts src/server/audit/service.ts src/server/auth/session.ts src/app/api/agents/[slug]/download/route.ts src/app/api/orders/[id]/deliveries/[deliveryId]/download/route.ts tests/server/download-ticket.test.ts tests/server/download-authorization.test.ts tests/server/agent-download-route.test.ts tests/server/delivery-download-route.test.ts tests/server/audit-service.test.ts
git commit -m "feat: secure asset downloads with signed tickets"
```

### Task 4: Phase 5B Payment Schema and Ledger Groundwork

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase5b_payment_ledger/`
- Create: `src/server/payments/ledger.ts`
- Test: `tests/server/payment-ledger.test.ts`
- Test: `tests/server/order-service.test.ts`

- [ ] **Step 1: Write failing tests for provider event id uniqueness and cancelled payment state**

```ts
it("deduplicates repeated provider webhook events", async () => {
  await recordPaymentEvent(sampleEvent);
  await expect(recordPaymentEvent(sampleEvent)).resolves.toMatchObject({ duplicate: true });
});

it("keeps cancelled checkout orders in pending payment", async () => {
  const order = await applyPaymentEvent({ type: "payment.cancelled", orderId: "order-1" });
  expect(order.status).toBe(ServiceOrderStatus.PENDING_PAYMENT);
  expect(order.paymentStatus).toBe(PaymentStatus.CANCELLED);
});
```

- [ ] **Step 2: Run targeted tests**

Run: `npm run test -- tests/server/payment-ledger.test.ts tests/server/order-service.test.ts tests/server/payment-route.test.ts`
Expected: FAIL because `PaymentLedger` and `PaymentStatus.CANCELLED` do not exist.

- [ ] **Step 3: Extend Prisma for payment ledger and payment status**

```prisma
enum PaymentStatus {
  UNPAID
  PENDING
  PAID
  FAILED
  CANCELLED
  REFUNDED
  PARTIALLY_REFUNDED
}

model PaymentLedger {
  id                        String   @id @default(cuid())
  orderId                    String
  provider                   String
  providerPaymentId          String?
  providerCheckoutSessionId  String?
  providerEventId            String   @unique
  idempotencyKey             String?
  amountMinor                Int
  currency                   String
  paymentStatus              PaymentStatus
  failureReason              String?
  rawEventDigest             String
  rawEventStoredAt           DateTime?
  lastWebhookReceivedAt      DateTime @default(now())
}
```

- [ ] **Step 4: Add ledger recording helpers and order projection rules**

```ts
export async function recordPaymentEvent(event: NormalizedPaymentEvent) {
  // insert-or-ignore by providerEventId, return duplicate marker if already seen
}
```

- [ ] **Step 5: Re-run ledger and order tests**

Run: `npm run prisma:generate`
Run: `npm run test -- tests/server/payment-ledger.test.ts tests/server/order-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/payments/ledger.ts tests/server/payment-ledger.test.ts tests/server/order-service.test.ts
git commit -m "feat: add payment ledger groundwork"
```

### Task 5: Payment Adapter Refactor and Real Provider Skeleton

**Files:**
- Modify: `src/server/payments/adapter.ts`
- Modify: `src/server/payments/dev-adapter.ts`
- Create: `src/server/payments/webhook-events.ts`
- Create: `src/server/payments/stripe-adapter.ts`
- Modify: `src/app/api/orders/[id]/pay/route.ts`
- Modify: `src/app/api/payments/webhook/route.ts`
- Test: `tests/server/payment-route.test.ts`

- [ ] **Step 1: Write failing tests for normalized webhook processing and amount validation**

```ts
it("rejects a webhook whose amount does not match the order amount", async () => {
  const response = await paymentWebhookRoute(stripeLikeRequest({ amountMinor: 100, orderAmountMinor: 200 }));
  expect(response.status).toBe(400);
});

it("accepts repeated provider events without updating the order twice", async () => {
  await paymentWebhookRoute(stripeLikeRequest({ providerEventId: "evt_1" }));
  const second = await paymentWebhookRoute(stripeLikeRequest({ providerEventId: "evt_1" }));
  expect(second.status).toBe(200);
});
```

- [ ] **Step 2: Run payment route tests**

Run: `npm run test -- tests/server/payment-route.test.ts`
Expected: FAIL because the route does not normalize provider events or use the ledger yet.

- [ ] **Step 3: Refactor the adapter contract around checkout sessions and normalized events**

```ts
export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;
  parseWebhook(request: Request): Promise<NormalizedPaymentEvent>;
  refundPayment?(input: RefundRequestInput): Promise<RefundResult>;
}
```

- [ ] **Step 4: Keep the dev adapter working and add a disabled-by-default real provider adapter**

```ts
export class StripePaymentProvider implements PaymentProvider {
  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    throw new Error("Stripe provider is not configured");
  }
}
```

- [ ] **Step 5: Wire webhook route through ledger, event normalization, and audit log**

```ts
const event = await provider.parseWebhook(request);
const ledgerResult = await recordPaymentEvent(event);
if (!ledgerResult.duplicate) {
  await applyPaymentProjection(event);
}
await recordAuditLog({ action: "payment.webhook.processed", targetType: "ServiceOrder", targetId: event.orderId });
```

- [ ] **Step 6: Re-run payment route tests**

Run: `npm run test -- tests/server/payment-route.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/payments/adapter.ts src/server/payments/dev-adapter.ts src/server/payments/webhook-events.ts src/server/payments/stripe-adapter.ts src/app/api/orders/[id]/pay/route.ts src/app/api/payments/webhook/route.ts tests/server/payment-route.test.ts
git commit -m "feat: refactor payments for real provider integration"
```

### Task 6: Phase 5C Dispute, Evidence, Refund, and Work Start Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase5c_disputes_refunds/`
- Test: `tests/server/dispute-service.test.ts`
- Test: `tests/server/refund-service.test.ts`

- [ ] **Step 1: Write failing tests for dispute evidence, refund persistence, and work-start gating**

```ts
it("creates a dispute with evidence records", async () => {
  const dispute = await createDispute({ orderId: "order-1", evidence: [{ note: "broken output" }] });
  expect(dispute.evidence).toHaveLength(1);
});

it("allows automatic refund only when workStartedAt is null", async () => {
  await expect(requestAutomaticRefund({ orderId: "started-order" })).rejects.toThrow("already started");
});
```

- [ ] **Step 2: Run dispute/refund tests**

Run: `npm run test -- tests/server/dispute-service.test.ts tests/server/refund-service.test.ts`
Expected: FAIL because the tables and service modules do not exist.

- [ ] **Step 3: Extend Prisma for disputes, evidence, refunds, and `workStartedAt`**

```prisma
model Dispute {
  id             String   @id @default(cuid())
  orderId         String
  openedByUserId  String?
  reason          String
  status          String
  resolutionType  String?
  responseDueAt   DateTime?
  resolvedAt      DateTime?
  evidence        DisputeEvidence[]
}
```

```prisma
model Refund {
  id                String   @id @default(cuid())
  orderId           String
  disputeId         String?
  provider          String
  paymentReference  String
  amountMinor       Int
  currency          String
  status            String
  providerEventId   String?
}
```

- [ ] **Step 4: Generate migration and client**

Run: `npm run prisma:generate`
Run: `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public' npx prisma migrate dev --name phase5c_disputes_refunds`
Expected: migration applies cleanly.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/server/dispute-service.test.ts tests/server/refund-service.test.ts
git commit -m "feat: add dispute and refund schema"
```

### Task 7: Dispute and Refund Services, Admin Resolution, and Audit

**Files:**
- Create: `src/server/disputes/service.ts`
- Create: `src/server/refunds/service.ts`
- Modify: `src/server/orders/service.ts`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/api/orders/[id]/dispute/route.ts`
- Test: `tests/server/dispute-service.test.ts`
- Test: `tests/server/refund-service.test.ts`
- Test: `tests/server/admin-actions.test.ts`
- Test: `tests/server/order-service.test.ts`

- [ ] **Step 1: Write failing tests for refund outcomes and dispute resolution transitions**

```ts
it("resolves a dispute into a partial refund without corrupting order state", async () => {
  const result = await resolveDispute({ disputeId: "dispute-1", resolutionType: "REFUND_PARTIAL", amountMinor: 500 });
  expect(result.refund?.status).toBe("PENDING");
  expect(result.order.status).toBe(ServiceOrderStatus.DISPUTED);
});

it("returns a disputed order to delivered when admin chooses return-to-delivered", async () => {
  const order = await resolveDispute({ disputeId: "dispute-1", resolutionType: "RETURN_TO_DELIVERED" });
  expect(order.status).toBe(ServiceOrderStatus.DELIVERED);
});
```

- [ ] **Step 2: Run targeted tests**

Run: `npm run test -- tests/server/dispute-service.test.ts tests/server/refund-service.test.ts tests/server/admin-actions.test.ts tests/server/order-service.test.ts`
Expected: FAIL because service implementations and admin actions are incomplete.

- [ ] **Step 3: Implement dispute service, evidence handling, and automatic refund guardrails**

```ts
export async function requestAutomaticRefund(input: { orderId: string; actorId: string }) {
  if (order.workStartedAt) throw new Error("Service order has already started");
  if (order.status !== ServiceOrderStatus.IN_PROGRESS && order.status !== ServiceOrderStatus.PENDING_PAYMENT) {
    throw new Error("Service order cannot be automatically refunded");
  }
}
```

- [ ] **Step 4: Implement admin resolution actions and audit log entries**

```ts
await recordAuditLog({
  actorId: session.user.id,
  actorRole: session.user.role,
  action: "dispute.resolve",
  targetType: "Dispute",
  targetId: dispute.id
});
```

- [ ] **Step 5: Re-run dispute, refund, and admin tests**

Run: `npm run test -- tests/server/dispute-service.test.ts tests/server/refund-service.test.ts tests/server/admin-actions.test.ts tests/server/order-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/disputes/service.ts src/server/refunds/service.ts src/server/orders/service.ts src/app/admin/actions.ts src/app/admin/page.tsx src/app/api/orders/[id]/dispute/route.ts tests/server/dispute-service.test.ts tests/server/refund-service.test.ts tests/server/admin-actions.test.ts tests/server/order-service.test.ts
git commit -m "feat: add dispute and refund workflows"
```

### Task 8: Phase 5D Settlement Schema and Compatibility Projection

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase5d_settlement_batches/`
- Test: `tests/server/settlement-service.test.ts`

- [ ] **Step 1: Write failing tests for settlement eligibility and batch locking**

```ts
it("creates a pending settlement line only for completed paid undisputed orders", async () => {
  const line = await buildSettlementLine({ orderId: "order-1" });
  expect(line.status).toBe("PENDING");
});

it("locks settlement lines once a batch is submitted", async () => {
  const batch = await submitSettlementBatch({ providerId: "creator-1", lineIds: ["line-1"] });
  expect(batch.status).toBe("SUBMITTED");
  expect(batch.lineSnapshot).toBeDefined();
});
```

- [ ] **Step 2: Run settlement tests**

Run: `npm run test -- tests/server/settlement-service.test.ts`
Expected: FAIL because settlement tables and service do not exist.

- [ ] **Step 3: Extend Prisma for settlement lines and batches**

```prisma
model SettlementLine {
  id                     String   @id @default(cuid())
  orderId                String   @unique
  providerId             String
  grossAmountMinor       Int
  platformFeeAmountMinor Int
  netAmountMinor         Int
  refundDeductionAmount  Int      @default(0)
  adjustmentAmount       Int      @default(0)
  status                 String
  eligibleAt             DateTime
  holdUntil              DateTime?
  lockedAt               DateTime?
  settledAt              DateTime?
}
```

- [ ] **Step 4: Add a compatibility projection rule**

```ts
// when a settlement line is marked settled:
await prisma.serviceOrder.update({
  where: { id: line.orderId },
  data: {
    settledAt: batch.paidOutAt,
    settlementReference: batch.payoutReference
  }
});
```

- [ ] **Step 5: Run Prisma generate and settlement tests**

Run: `npm run prisma:generate`
Run: `npm run test -- tests/server/settlement-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/server/settlement-service.test.ts
git commit -m "feat: add settlement line and batch schema"
```

### Task 9: Settlement Services and Admin/Creator Settlement Views

**Files:**
- Create: `src/server/settlements/service.ts`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/creator/orders/page.tsx`
- Modify: `src/app/creator/page.tsx`
- Create: `src/components/settlement-status-pill.tsx`
- Test: `tests/server/settlement-service.test.ts`
- Test: `tests/server/admin-actions.test.ts`
- Test: `tests/server/admin-page.test.tsx`
- Test: `tests/server/admin-analytics-page.test.tsx`
- Test: `tests/server/creator-orders-page.test.tsx`
- Test: `tests/server/creator-page.test.tsx`

- [ ] **Step 1: Write failing UI and service tests for settlement batches**

```ts
it("shows pending settlement batches in admin", async () => {
  const html = await renderAdminPage();
  expect(html).toContain("Pending settlement batches");
});

it("shows unsettled revenue from settlement lines on the creator dashboard", async () => {
  const html = await renderCreatorDashboard();
  expect(html).toContain("Unsettled revenue");
});
```

- [ ] **Step 2: Run targeted tests**

Run: `npm run test -- tests/server/settlement-service.test.ts tests/server/admin-actions.test.ts tests/server/admin-page.test.tsx tests/server/admin-analytics-page.test.tsx tests/server/creator-orders-page.test.tsx tests/server/creator-page.test.tsx`
Expected: FAIL because admin and creator views still read legacy settlement flags directly.

- [ ] **Step 3: Implement settlement line refresh, batch submit, payout mark, and compatibility projection**

```ts
export async function submitSettlementBatch(input: { providerId: string; lineIds: string[]; payoutReference?: string | null }) {
  // validate all lines belong to one provider, lock them, store lineSnapshot, create batch
}
```

- [ ] **Step 4: Update admin and creator pages to read from settlement tables first**

```ts
const settlementSummary = await listCreatorSettlementSummary(session.user.id);
const pendingBatches = await listPendingSettlementBatches();
```

- [ ] **Step 5: Re-run settlement and page tests**

Run: `npm run test -- tests/server/settlement-service.test.ts tests/server/admin-actions.test.ts tests/server/admin-page.test.tsx tests/server/admin-analytics-page.test.tsx tests/server/creator-orders-page.test.tsx tests/server/creator-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/settlements/service.ts src/app/admin/actions.ts src/app/admin/page.tsx src/app/admin/analytics/page.tsx src/app/creator/orders/page.tsx src/app/creator/page.tsx src/components/settlement-status-pill.tsx tests/server/settlement-service.test.ts tests/server/admin-actions.test.ts tests/server/admin-page.test.tsx tests/server/admin-analytics-page.test.tsx tests/server/creator-orders-page.test.tsx tests/server/creator-page.test.tsx
git commit -m "feat: add settlement batch operations"
```

### Task 10: End-to-End Verification and Operator Docs

**Files:**
- Modify: `tests/e2e/delivery.spec.ts`
- Modify: `tests/e2e/order-lifecycle.spec.ts`
- Create: `tests/e2e/settlement.spec.ts`
- Modify: `docs/phase-4-operator-guide.md`
- Create: `docs/phase-5-operator-guide.md`

- [ ] **Step 1: Add failing smoke coverage for private downloads, payment cancellation, refund/dispute, and settlement submission**

```ts
test("buyer cannot download a delivery without a valid ticket", async ({ request }) => {
  const response = await request.get("/api/orders/order-1/deliveries/delivery-1/download");
  expect(response.status()).toBe(401);
});

test("admin can submit a settlement batch after a completed paid order", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Pending settlement batches")).toBeVisible();
});
```

- [ ] **Step 2: Run e2e tests and confirm failures**

Run: `npm run test:e2e`
Expected: FAIL in the new private download and settlement scenarios.

- [ ] **Step 3: Update operator docs for new flows and configuration**

```text
- DOWNLOAD_TICKET_SECRET
- DOWNLOAD_TICKET_ACTIVE_KEY_ID
- PAYMENT_WEBHOOK_SECRET
- S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
- dispute resolution flow
- settlement batch submission flow
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm run test`
Run: `npm run build`
Run: `npm run test:e2e`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/delivery.spec.ts tests/e2e/order-lifecycle.spec.ts tests/e2e/settlement.spec.ts docs/phase-4-operator-guide.md docs/phase-5-operator-guide.md
git commit -m "test: cover infrastructure phase flows"
```

## Execution Order

Implementation checkpoints must stay in this order:

1. `Task 1` to `Task 3` complete Phase 5A.
2. `Task 4` to `Task 5` complete Phase 5B.
3. `Task 6` to `Task 7` complete Phase 5C.
4. `Task 8` to `Task 10` complete Phase 5D and full-program verification.

Do not start Phase 5B before the private download model is merged and verified. Do not start Phase 5D before refunds and disputes have explicit persistence.

## Self-Review

Spec coverage check:

- Controlled asset downloads are covered by Tasks 1 to 3.
- Real payment provider shape, payment ledger, and webhook normalization are covered by Tasks 4 and 5.
- Refunds, disputes, evidence, and automatic refund guardrails are covered by Tasks 6 and 7.
- Settlement lines, batches, compatibility projection, and UI read paths are covered by Tasks 8 and 9.
- Operator docs and full-suite verification are covered by Task 10.

Placeholder scan:

- No placeholder markers remain.
- Each task names exact files, test targets, commands, and commit messages.

Type consistency check:

- Storage terms use `objectKey`, `storageProvider`, `checksum`, and `contentDisposition` consistently.
- Payment terms use `PaymentLedger`, `providerEventId`, `amountMinor`, and `PaymentStatus.CANCELLED` consistently.
- Refund and settlement terms use `workStartedAt`, `SettlementLine`, and `SettlementBatch` consistently.
