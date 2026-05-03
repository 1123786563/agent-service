# S3-Compatible Storage Rollout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the current local-file default with a production-ready S3-compatible storage path for agent ZIPs and delivery assets, while preserving existing downloads, metadata integrity, and rollback safety.

**Architecture:** Keep the current `StorageProvider` abstraction and signed download model. Add a real S3-compatible provider implementation, a provider selector, and a migration utility that can copy existing local assets into object storage without breaking existing `objectKey` references.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Vitest, Playwright, local filesystem storage, S3-compatible object storage API.

---

## Scope Boundary

This phase includes:

- Real `S3CompatibleStorageProvider` implementation
- Runtime provider selection via environment variables
- Upload, download, and delete support against S3-compatible object storage
- Migration tooling to copy existing local ZIPs and delivery files into object storage
- Verification and operator docs for storage cutover

This phase does not include:

- CDN integration
- multipart upload optimization for very large files
- client-side direct upload to object storage
- lifecycle retention rules on the bucket
- true multi-provider failover

## Implementation Strategy

The current code already stores `objectKey`, `checksum`, `bucket`, `mimeType`, and `storageProvider`. The lowest-risk rollout is:

1. Implement the real S3-compatible provider behind the existing interface.
2. Add explicit runtime selection so development keeps using local storage by default.
3. Preserve `objectKey` format (`agents/...`, `deliveries/...`) so signed download and authorization code do not change.
4. Add a one-way migration script that copies local files to object storage and updates metadata rows in the database.
5. Verify both new uploads and legacy downloads after cutover.

## File Structure

Expected file map for this phase:

```text
src/
├── server/
│   └── storage/
│       ├── provider.ts                 # modify
│       ├── local-provider.ts           # modify
│       ├── s3-provider.ts              # implement
│       ├── factory.ts                  # new runtime selector
│       ├── local-storage.ts            # modify if it still assumes local-only reads
│       └── local-delivery-storage.ts   # modify if it still assumes local-only reads
├── scripts/
│   └── migrate-assets-to-object-storage.ts  # new
└── app/
    └── api/... download routes         # verify compatibility, minimal edits only

tests/
├── server/
│   ├── s3-provider.test.ts
│   ├── storage-factory.test.ts
│   ├── package-service.test.ts
│   └── delivery-service.test.ts
└── e2e/
    └── storage-rollout.spec.ts         # optional smoke for configured environments

docs/
└── phase-6-operator-guide.md
```

## Environment Targets

Add and document:

- `STORAGE_PROVIDER=local|s3-compatible`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE=true|false`
- `S3_PUBLIC_BASE_URL` (optional)

## Task Breakdown

### Task 1: Provider Selection and Configuration Guardrails

**Files:**
- Create: `src/server/storage/factory.ts`
- Modify: `src/server/storage/provider.ts`
- Test: `tests/server/storage-factory.test.ts`

- [x] **Step 1: Write failing tests for provider selection**

```ts
it("returns local storage when STORAGE_PROVIDER is unset", () => {
  expect(getStorageProvider().kind).toBe("local");
});

it("returns s3-compatible storage when configured", () => {
  process.env.STORAGE_PROVIDER = "s3-compatible";
  expect(getStorageProvider().kind).toBe("s3-compatible");
});
```

- [x] **Step 2: Run targeted tests**

Run: `npm run test -- tests/server/storage-factory.test.ts`
Expected: FAIL because there is no runtime selector yet.

- [x] **Step 3: Implement provider factory and config validation**

Requirements:

- default to local when `STORAGE_PROVIDER` is missing
- reject unsupported values
- fail fast when `s3-compatible` is selected but required env vars are missing

- [x] **Step 4: Re-run factory tests**

Run: `npm run test -- tests/server/storage-factory.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/server/storage/factory.ts src/server/storage/provider.ts tests/server/storage-factory.test.ts
git commit -m "feat: add storage provider selection"
```

### Task 2: Real S3-Compatible Provider Implementation

**Files:**
- Modify: `src/server/storage/s3-provider.ts`
- Test: `tests/server/s3-provider.test.ts`

- [x] **Step 1: Write failing tests for put/get/delete behavior**

```ts
it("uploads objects with the expected key and metadata", async () => {
  const stored = await provider.putObject({
    scope: "agents",
    buffer: Buffer.from("zip"),
    originalFileName: "demo.zip"
  });

  expect(stored.objectKey).toMatch(/^agents\//);
  expect(stored.bucket).toBe("bucket-1");
  expect(stored.storageProvider).toBe("s3-compatible");
});
```

- [x] **Step 2: Run S3 provider tests**

Run: `npm run test -- tests/server/s3-provider.test.ts`
Expected: FAIL because the provider is still a stub.

- [x] **Step 3: Implement S3-compatible put/get/delete**

Requirements:

- use one small internal request helper or SDK wrapper
- preserve current checksum generation
- preserve current `objectKey` conventions
- return a stable `contentDisposition`
- read objects back as `Readable`

- [x] **Step 4: Re-run provider tests**

Run: `npm run test -- tests/server/s3-provider.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/server/storage/s3-provider.ts tests/server/s3-provider.test.ts
git commit -m "feat: implement s3-compatible storage provider"
```

### Task 3: Wire Upload and Download Paths Through the Selected Provider

**Files:**
- Modify: `src/server/storage/local-storage.ts`
- Modify: `src/server/storage/local-delivery-storage.ts`
- Modify: `src/server/agents/package-service.ts`
- Modify: `src/server/deliveries/service.ts`
- Test: `tests/server/package-service.test.ts`
- Test: `tests/server/delivery-service.test.ts`

- [x] **Step 1: Write failing integration-style tests for selected provider usage**

```ts
it("persists uploaded package metadata from the active provider", async () => {
  vi.mocked(getStorageProvider).mockReturnValue(mockS3Provider);
  // create upload
  expect(created.storageProvider).toBe("S3_COMPATIBLE");
});
```

- [x] **Step 2: Run targeted service tests**

Run: `npm run test -- tests/server/package-service.test.ts tests/server/delivery-service.test.ts`
Expected: FAIL because persistence still assumes local storage in parts of the path.

- [x] **Step 3: Refactor service code to use the provider factory everywhere**

Requirements:

- new uploads must follow the selected provider
- download routes must still work using stored `objectKey`
- no route should assume local file paths directly

- [x] **Step 4: Re-run service tests**

Run: `npm run test -- tests/server/package-service.test.ts tests/server/delivery-service.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/server/storage/local-storage.ts src/server/storage/local-delivery-storage.ts src/server/agents/package-service.ts src/server/deliveries/service.ts tests/server/package-service.test.ts tests/server/delivery-service.test.ts
git commit -m "feat: route asset persistence through selected storage provider"
```

### Task 4: Local-to-Object-Storage Migration Utility

**Files:**
- Create: `scripts/migrate-assets-to-object-storage.ts`
- Modify: `docs/phase-6-operator-guide.md`
- Test: `tests/server/local-storage.test.ts` or a new migration utility test if practical

- [x] **Step 1: Design migration invariants**

Migration rules:

- only rows with `storageProvider = LOCAL` are eligible
- preserve existing `objectKey`
- update `storageProvider`, `bucket`, and URL metadata after successful copy
- never delete local source files during the first rollout pass

- [x] **Step 2: Implement the migration script**

Requirements:

- support `--scope=agents|deliveries|all`
- support dry-run mode
- log copied row counts and skipped rows
- continue on single-row failure and emit a summary

- [x] **Step 3: Run a dry-run locally**

Run example:

```bash
npx tsx scripts/migrate-assets-to-object-storage.ts --scope=all --dry-run
```

Expected: script enumerates eligible assets without mutating storage.

- [x] **Step 4: Document the cutover sequence**

Include:

1. configure S3-compatible env vars
2. dry-run migration
3. execute migration
4. switch `STORAGE_PROVIDER=s3-compatible`
5. verify ZIP and delivery downloads

- [x] **Step 5: Commit**

```bash
git add scripts/migrate-assets-to-object-storage.ts docs/phase-6-operator-guide.md
git commit -m "feat: add asset migration utility for object storage cutover"
```

### Task 5: Verification and Rollout Coverage

**Files:**
- Create: `docs/phase-6-operator-guide.md`
- Test: `tests/e2e/storage-rollout.spec.ts` or targeted smoke additions
- Modify: `playwright.config.ts` only if new env setup is required

- [x] **Step 1: Add smoke coverage for provider-backed downloads**

Coverage goals:

- published ZIP still downloads under the selected provider
- buyer delivery download still enforces auth
- creator upload still succeeds with selected provider metadata

- [x] **Step 2: Run targeted e2e or integration verification**

Run:

```bash
npm run test -- tests/server/storage-factory.test.ts tests/server/s3-provider.test.ts tests/server/package-service.test.ts tests/server/delivery-service.test.ts
npm run lint
npm run build
```

If an S3-compatible test environment is available, also run:

```bash
npm run test:e2e
```

- [x] **Step 3: Finalize operator guide**

Document:

- required env vars
- bucket naming expectations
- dry-run vs live migration
- rollback to local storage

- [x] **Step 4: Commit**

```bash
git add docs/phase-6-operator-guide.md tests/e2e/storage-rollout.spec.ts playwright.config.ts
git commit -m "test: add storage rollout verification"
```

## Verification Checklist

Before marking this phase complete:

- `STORAGE_PROVIDER=local` still works unchanged
- `STORAGE_PROVIDER=s3-compatible` passes provider and service tests
- signed ZIP downloads still work
- signed delivery downloads still require authorization
- local-to-object-storage migration preserves `objectKey`
- `npm run lint`, `npm run build`, and the targeted test suite all pass

## Definition of Done

This phase is complete when:

1. new uploads can persist to S3-compatible object storage,
2. existing local assets can be copied without URL or `objectKey` drift,
3. ZIP and delivery downloads still work through the signed ticket layer, and
4. operators have a documented cutover and rollback procedure.
