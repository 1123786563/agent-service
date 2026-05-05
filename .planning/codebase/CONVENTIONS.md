# Codebase Conventions

## Project Overview

Hermes Agent Marketplace is a Next.js 15 SaaS application for publishing, discovering, and downloading AI agent packages. The UI is primarily in Chinese (zh-CN). The backend uses Prisma with PostgreSQL. The app follows a layered architecture: API routes and server actions at the edge, a pure-logic service layer, and a data layer via Prisma.

---

## TypeScript Patterns

### Type vs Interface

The codebase uses both `type` and `interface` with a clear distinction:

- **`type`** is used for data shapes, DTOs, input/output types, and union types.
  ```ts
  // src/server/payments/adapter.ts
  export type PaymentCheckoutSession = {
    provider: string;
    checkoutUrl: string;
    paymentReference: string;
  };

  export type CreateCheckoutSessionInput = {
    orderId: string;
    amountMinor: number;
    currency: string;
    paymentReference?: string | null;
  };
  ```

- **`interface`** is used for protocol/strategy contracts that classes implement.
  ```ts
  // src/server/payments/adapter.ts
  export interface PaymentProvider {
    provider: string;
    createCheckoutSession(input: CreateCheckoutSessionInput): Promise<PaymentCheckoutSession>;
    parseWebhook(request: Request): Promise<NormalizedProviderEvent>;
    refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  }

  // src/server/storage/provider.ts
  export interface StorageProvider {
    kind: StoredObject["storageProvider"];
    putObject(input: PutObjectInput): Promise<StoredObject>;
    getObjectStream(input: { objectKey: string }): Promise<Readable>;
    deleteObject(input: { objectKey: string }): Promise<void>;
    buildObjectKey(input: { scope: StorageScope; fileName: string }): string;
  }
  ```

### Naming Conventions

- **Types/Interfaces**: PascalCase (`PaymentCheckoutSession`, `StorageProvider`).
- **Input types**: Suffixed with `Input` (`CreateConsultationInput`, `ResolveDisputeInput`).
- **Result types**: Suffixed with `Result` (`CreateAgentPackageResult`, `RefundPaymentResult`).
- **Exported functions**: camelCase (`createConsultation`, `markServiceOrderPaid`).
- **File names**: kebab-case (`consultation-service.test.ts`, `stripe-adapter.ts`).
- **Constants**: UPPER_SNAKE_CASE (`MAX_ZIP_BYTES`, `SESSION_COOKIE`).
- **Prisma model names**: PascalCase singular (`AgentPackage`, `ServiceOrder`, `SettlementLine`).
- **Enum values**: UPPER_SNAKE_CASE (`ServiceOrderStatus.PENDING_PAYMENT`, `PaymentStatus.PARTIALLY_REFUNDED`).

### Null Handling

Strict TypeScript is enabled (`"strict": true`). Nullable fields use `string | null` or `string | null | undefined`. The `??` operator is preferred over `||` for fallback defaults. Input normalization uses `.trim()` consistently:

```ts
const orderId = input.orderId.trim();
if (!orderId) {
  throw new Error("Order ID is required");
}
```

---

## React Component Patterns

### Server Components (Default)

Most page components and display components are **server components** -- no `"use client"` directive. They directly call service functions and pass data to child components.

```tsx
// src/app/agents/[slug]/page.tsx -- Server Component
export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agentPackage = await getPublishedAgentPackageBySlug(slug);
  if (!agentPackage) { notFound(); }
  return <AgentDetail agentPackage={agentPackage} />;
}
```

Key files: `src/app/agents/page.tsx`, `src/app/agents/[slug]/page.tsx`, `src/app/creator/orders/page.tsx`, `src/app/account/orders/page.tsx`, `src/app/admin/page.tsx`.

### Client Components (`"use client"`)

Only used when interactivity requires it (event handlers, `useState`, `useRouter`, `useTransition`). The directive is at the top of the file.

Known client components:
- `src/components/cancel-order-button.tsx` -- uses `useRouter`, `useTransition`, `fetch`.
- `src/components/consultation-form.tsx` -- uses `useState`, form submission with `fetch`.
- `src/components/upload-agent-form.tsx` -- **not** a client component (plain HTML form).
- `src/components/upload-delivery-form.tsx` -- **not** a client component (plain HTML form).

### Component Props

Props are typed inline with object types, not separate interfaces:

```tsx
export function AgentCard({ agentPackage }: { agentPackage: AgentPackage & { skills: Skill[]; ... } }) { ... }
export function CancelOrderButton({ orderId }: { orderId: string }) { ... }
```

Prisma types are imported and extended with intersection types for relations:

```tsx
type AgentCardProps = {
  agentPackage: AgentPackage & {
    skills: Skill[];
    workflows?: Array<{ description: string }>;
    consultations?: Array<{ orders?: Array<{ status?: string }> }>;
  };
};
```

### Rendering Data in Server Components

Server components directly query the database through service functions:

```tsx
// src/app/agents/page.tsx
export default async function AgentsPage({ searchParams }) {
  const packages = await listPublishedAgentPackages({ query, category, sort });
  return <div>{packages.map(p => <AgentCard key={p.id} agentPackage={p} />)}</div>;
}
```

### Dynamic Rendering

Pages that query data use `export const dynamic = "force-dynamic"` to opt out of static rendering:

```tsx
export const dynamic = "force-dynamic";
```

---

## Server Action Patterns

Server actions live in `src/app/*/actions.ts` files, marked with `"use server"`.

### File Locations

- `src/app/creator/actions.ts`
- `src/app/admin/actions.ts`

### Anatomy

1. `"use server"` directive at file top.
2. Imports from `@/server/...` service modules and Prisma enums.
3. Exported async functions accepting `FormData`.
4. Extract values from `FormData` using `String(formData.get(key) ?? "").trim()`.
5. Validate with checks or Zod schemas.
6. Call service layer functions.
7. Call `revalidatePath()` for all affected routes.

```ts
// src/app/admin/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";

export async function archiveAgentPackage(formData: FormData) {
  await requireAdmin();
  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) { throw new Error("Package ID is required"); }
  await prisma.agentPackage.update({ where: { id: packageId }, data: { status: AgentPackageStatus.ARCHIVED } });
  revalidatePath("/admin");
  revalidatePath("/agents");
}
```

### Error Handling in Actions

Server actions throw errors directly (no `try/catch`). Next.js displays these as error boundaries. Errors are plain `Error` instances with descriptive messages.

---

## API Route Handler Patterns

API routes live in `src/app/api/` following the Next.js App Router convention (`route.ts` files).

### File Structure

```
src/app/api/
  auth/
    request-link/route.ts      -- POST
    consume/route.ts            -- GET
  creator/
    agents/route.ts             -- POST
  consultations/route.ts        -- POST
  orders/[id]/
    pay/route.ts                -- POST
    deliveries/route.ts         -- POST
    complete/route.ts           -- POST
    cancel/route.ts             -- POST
    dispute/route.ts            -- POST
  payments/
    webhook/route.ts            -- POST
    dev/complete/route.ts       -- POST
  agents/[slug]/
    download/route.ts           -- GET
  orders/[id]/deliveries/[deliveryId]/
    download/route.ts           -- GET
```

### Exported HTTP Methods

Each route exports named async functions matching HTTP methods: `GET`, `POST`, etc.

```ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { ... }
```

Note: In Next.js 15, `params` is a `Promise` and must be awaited.

### Request Handling Pattern

1. **Auth check**: Call `getCurrentUser()`, `requireCreator()`, or `requireAdmin()`.
2. **Redirect unauthenticated**: `Response.redirect(new URL("/login", request.url), 303)`.
3. **Parse input**: `request.json()` for JSON, `request.formData()` for form data.
4. **Validate**: Manual checks or rely on service layer Zod validation.
5. **Call service**: Delegate to `@/server/...` service functions.
6. **Success**: Redirect with `Response.redirect(url, 303)` or return JSON with status.
7. **Error**: Return `Response.json({ errors: [message] }, { status })`.

```ts
// Standard error response pattern
catch (error) {
  const message = error instanceof Error ? error.message : "Could not ...";
  const status = message === "Service order not found" ? 404 : 400;
  return Response.json({ errors: [message] }, { status });
}
```

### Success Response Patterns

- JSON APIs return `Response.json({ ...data }, { status: 201 })`.
- Form-submitting routes redirect: `Response.redirect(new URL("/creator/orders", request.url), 303)`.

---

## Service Layer Patterns

Services live in `src/server/*/service.ts` (or equivalent). They contain pure business logic with no HTTP concerns.

### File Organization

```
src/server/
  agents/
    package-service.ts     -- Agent package CRUD, listing, completeness
    product-service.ts     -- Favorites, reviews, recommendations
    metadata-schema.ts     -- Zod schema for agent.json
    zip-validator.ts       -- ZIP validation logic
  auth/
    session.ts             -- Session management
    magic-link.ts          -- Magic link auth flow
  audit/
    service.ts             -- Audit logging
  consultations/
    service.ts             -- Consultation CRUD and transitions
  orders/
    service.ts             -- Order lifecycle
  deliveries/
    service.ts             -- Delivery management
  disputes/
    service.ts             -- Dispute creation and resolution
  payments/
    adapter.ts             -- Payment provider abstraction
    dev-adapter.ts         -- Dev/localhost payment provider
    stripe-adapter.ts      -- Stripe payment provider
    webhook-events.ts      -- Normalized webhook event types
    ledger.ts              -- Payment ledger (idempotent event recording)
  refunds/
    service.ts             -- Refund processing
  settlements/
    service.ts             -- Settlement lines and batches
  storage/
    factory.ts             -- Storage provider factory
    provider.ts            -- StorageProvider interface
    local-provider.ts      -- Local filesystem storage
    s3-provider.ts         -- S3-compatible storage
    local-storage.ts       -- Agent-specific storage helpers
    local-delivery-storage.ts -- Delivery-specific storage helpers
    download-authorization.ts -- Download access checks
    download-tickets.ts    -- HMAC-signed download tickets
  mail/
    dev-mailer.ts          -- Dev-only email (console logging)
  db.ts                   -- Prisma client singleton
```

### Dependency Injection Pattern

Services use a **deps pattern** for testability. Each service function accepts an optional `deps` parameter with typed store/storage interfaces. Default deps bind to Prisma at module load.

```ts
// src/server/orders/service.ts
type OrderServiceDeps = {
  store: OrderStore;
};

const defaultDeps: OrderServiceDeps = {
  store: {
    findConsultationById(id) { return prisma.consultation.findUnique({ ... }); },
    createOrderForConsultation(data) { return prisma.$transaction(async (tx) => { ... }); },
    // ...
  }
};

export async function createServiceOrder(
  input: CreateServiceOrderInput,
  deps: OrderServiceDeps = defaultDeps
) {
  // Use deps.store instead of prisma directly
}
```

This is used consistently across:
- `src/server/orders/service.ts` -- `OrderServiceDeps`
- `src/server/consultations/service.ts` -- `ConsultationServiceDeps`
- `src/server/deliveries/service.ts` -- `DeliveryServiceDeps`
- `src/server/agents/package-service.ts` -- `PackageServiceDeps`
- `src/server/payments/ledger.ts` -- `PaymentLedgerStore`
- `src/server/storage/download-tickets.ts` -- `DownloadTicketUseStore`

### Validation with Zod

Zod is used extensively for input validation. Schemas are defined as module-level constants:

```ts
const consultationEmailSchema = z.string().trim().min(1).email().transform((value) => value.toLowerCase());
const consultationRequirementSchema = z.string().trim().min(1).max(5000);
```

Usage pattern: parse at the boundary, throw on failure (Zod errors propagate naturally or are caught):

```ts
const buyerEmail = consultationEmailSchema.parse(input.buyerEmail);
```

### Result Types for Success/Failure

The package-service uses a discriminated union result type:

```ts
export type CreateAgentPackageResult =
  | { ok: true; package: AgentPackageWithRelations; storage: StoredZipFile; risks: string[] }
  | { ok: false; errors: string[]; risks: string[] };
```

### Idempotency

The payment ledger records `providerEventId` as unique, preventing duplicate webhook processing:

```ts
// src/server/payments/ledger.ts
const existing = await store.findUnique({ where: { providerEventId: event.providerEventId } });
if (existing) {
  return { duplicate: true as const, id: existing.id };
}
```

---

## Error Handling Patterns

### Service Layer

Services throw plain `Error` instances with descriptive messages. No custom error classes except `AuthFlowError` in `src/server/auth/magic-link.ts`.

```ts
if (!consultation) { throw new Error("Consultation not found"); }
if (consultation.providerId !== providerId) { throw new Error("Consultation does not belong to this provider"); }
```

### API Route Layer

API routes catch errors and map to HTTP status codes:

```ts
catch (error) {
  const message = error instanceof Error ? error.message : "Could not create payment session";
  const status = message === "Service order not found" ? 404 : 400;
  return Response.json({ errors: [message] }, { status });
}
```

Error response shape is always `{ errors: string[] }`.

### Cleanup on Failure

Services clean up resources (e.g., delete uploaded files) when database operations fail:

```ts
try {
  return await deps.store.createDeliveryAndMarkDelivered({ ... });
} catch (error) {
  try { await deps.storage.delete(stored.fileName); } catch { /* Best-effort cleanup */ }
  throw error;
}
```

---

## Import Organization

Imports follow this order:

1. Node.js built-ins (`crypto`, `path`, `fs`, `stream`)
2. Third-party packages (`zod`, `stripe`, `jszip`, `@prisma/client`)
3. Next.js modules (`next/cache`, `next/navigation`)
4. Internal modules using `@/` alias (`@/server/db`, `@/server/auth/session`)

```ts
import crypto from "node:crypto";
import { PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { prisma } from "@/server/db";
```

The `@/` path alias maps to `./src/` (configured in `tsconfig.json` and `vitest.config.ts`).

---

## State Management Patterns

There is no global state management library. The app uses:

1. **Server components with direct DB queries** for data fetching.
2. **`useState`** in client components for local form state.
3. **`useTransition`** for pending UI during server mutations.
4. **`revalidatePath()`** in server actions to refresh server component data.
5. **URL search params** for filters (e.g., `?q=&category=&sort=`).

---

## CSS/Styling Approach

### No Tailwind

The project uses **plain CSS** in a single globals file: `src/app/globals.css`. No Tailwind, CSS Modules, or CSS-in-JS.

### CSS Custom Properties

Design tokens are defined as CSS custom properties in `:root`:

```css
:root {
  --bg: #f8fafc;
  --panel: #ffffff;
  --text: #111827;
  --muted: #64748b;
  --line: #dbe3ef;
  --accent: #0f766e;
  --accent-weak: #ccfbf1;
}
```

### BEM-ish Class Names

Components use semantic, flat class names (not BEM strictly but descriptive):

- `.site-header`, `.brand`, `.page`, `.hero`, `.eyebrow`, `.lede`
- `.actions`, `.button`, `.button.secondary`
- `.panel`, `.form`, `.grid`, `.list`
- `.status-pill`, `.agent-card`, `.detail`, `.detail-hero`
- `.inline-status`, `.inline-fields`, `.error-list`

### Layout Patterns

CSS Grid is used extensively for layout:

```css
.filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr) minmax(180px, 1fr) auto;
  gap: 16px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
```

### Responsive

A single `@media (max-width: 720px)` breakpoint adjusts grid layouts to single columns.

---

## Prisma Usage Patterns

### Client Singleton

`src/server/db.ts` exports a singleton `prisma` instance using the global-hoisting pattern for development hot-reloading:

```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ ... });
if (process.env.NODE_ENV !== "production") { globalForPrisma.prisma = prisma; }
```

### Schema Conventions

- IDs: `@id @default(cuid())` (cuid-based).
- Timestamps: `@default(now())` for `createdAt`, `@updatedAt` for `updatedAt`.
- Soft deletes: `deletedAt DateTime?` on `AgentPackage` and `Delivery`.
- Enums defined at the top of the schema file.
- Relations use named relation strings for self-referential patterns (`"BuyerConsultations"`, `"ProviderConsultations"`).
- `@@index` attributes on frequently queried field combinations.
- `@@unique` for composite unique constraints (`@@unique([agentPackageId, userId])`).

### Query Patterns

- Use `include` for eager-loading relations (not `select` in most cases).
- Use `$transaction` for multi-step mutations requiring atomicity.
- Use `upsert` for idempotent user creation.
- Use `updateMany` with `where` conditions for bulk updates.

---

## Adapter/Strategy Pattern Usage

### Payment Providers

`src/server/payments/adapter.ts` defines the `PaymentProvider` interface. Concrete implementations:

- `src/server/payments/dev-adapter.ts` -- `devPaymentAdapter` (object literal implementing the interface).
- `src/server/payments/stripe-adapter.ts` -- `StripePaymentProvider` (class implementing the interface).

Selection via `getPaymentAdapter()` reads `PAYMENT_PROVIDER` env var:

```ts
export function getPaymentAdapter(provider = getPaymentProvider()): PaymentProvider {
  if (provider === devPaymentAdapter.provider) return devPaymentAdapter;
  if (provider === StripePaymentProvider.providerName) return new StripePaymentProvider();
  throw new Error(`Unsupported payment provider: ${provider}`);
}
```

Webhook events are normalized to `NormalizedPaymentEvent` or `NormalizedRefundEvent` types via `webhook-events.ts`.

### Storage Providers

`src/server/storage/provider.ts` defines the `StorageProvider` interface. Concrete implementations:

- `src/server/storage/local-provider.ts` -- `LocalStorageProvider` (class).
- `src/server/storage/s3-provider.ts` -- `S3CompatibleStorageProvider` (class).

Selection via factory in `src/server/storage/factory.ts` reads `STORAGE_PROVIDER` env var.

Both providers support two scopes: `"agents"` and `"deliveries"`, with separate upload directories and public URL paths.

### Injected Clients

Both Stripe and S3 adapters accept an injected client for testing:

```ts
// StripePaymentProvider constructor accepts optional StripeClient
constructor(config: StripePaymentProviderConfig = {}, client?: StripeClient) { ... }

// S3CompatibleStorageProvider accepts optional client
constructor(input: S3CompatibleStorageProviderInput = {}) {
  this.client = input.client ?? new S3Client({ ... });
}
```

---

## File Naming Reference

| Pattern | Example | Description |
|---------|---------|-------------|
| `route.ts` | `src/app/api/consultations/route.ts` | API route handler |
| `actions.ts` | `src/app/admin/actions.ts` | Server actions |
| `page.tsx` | `src/app/agents/page.tsx` | Next.js page component |
| `service.ts` | `src/server/orders/service.ts` | Business logic service |
| `adapter.ts` | `src/server/payments/adapter.ts` | Strategy interface + factory |
| `*-adapter.ts` | `src/server/payments/stripe-adapter.ts` | Concrete strategy |
| `*-service.ts` | `src/server/agents/package-service.ts` | Domain service |
| `*-schema.ts` | `src/server/agents/metadata-schema.ts` | Zod validation schema |
| `*-validator.ts` | `src/server/agents/zip-validator.ts` | Validation logic |
| `*-pill.tsx` | `src/components/package-status-pill.tsx` | Status display component |
| `*-form.tsx` | `src/components/consultation-form.tsx` | Form component |
| `*-button.tsx` | `src/components/cancel-order-button.tsx` | Action button component |
| `*-card.tsx` | `src/components/agent-card.tsx` | Card display component |
| `*-detail.tsx` | `src/components/agent-detail.tsx` | Detail view component |
