# Phase 6 Operator Guide

## Goal

This phase moves asset persistence from local disk to an S3-compatible object store without breaking signed ZIP downloads or protected delivery downloads.

## Required Environment

Set these values before a live cutover:

- `STORAGE_PROVIDER=s3-compatible`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE=true|false`
- `S3_PUBLIC_BASE_URL` (optional)

Keep these existing values:

- `UPLOAD_DIR`
- `DELIVERY_UPLOAD_DIR`
- `DOWNLOAD_TICKET_SECRET`
- `DOWNLOAD_TICKET_ACTIVE_KEY_ID`
- `DOWNLOAD_TICKET_PREVIOUS_KEY_ID` (optional during rotation)
- `DOWNLOAD_TICKET_PREVIOUS_SECRET` (required when `DOWNLOAD_TICKET_PREVIOUS_KEY_ID` is set)

## Download Ticket Rotation

1. Set the new `DOWNLOAD_TICKET_ACTIVE_KEY_ID` and `DOWNLOAD_TICKET_SECRET`.
2. Move the old key id and secret to `DOWNLOAD_TICKET_PREVIOUS_KEY_ID` and `DOWNLOAD_TICKET_PREVIOUS_SECRET`.
3. Keep the previous key configured until all tickets signed before rotation have expired.
4. Remove the previous key values after the rotation window.

Delivery download tickets are single-use and are recorded in `DownloadTicketUse`. Public ZIP download tickets remain reusable within their short TTL because they protect public assets.

## Cutover Sequence

1. Keep production on `STORAGE_PROVIDER=local`.
2. Configure the S3-compatible credentials in the environment.
3. Run a dry-run:

```bash
npx tsx scripts/migrate-assets-to-object-storage.ts --scope=all --dry-run
```

4. Review the eligible asset counts for:
   - `agents`
   - `deliveries`

5. Run the live migration:

```bash
npx tsx scripts/migrate-assets-to-object-storage.ts --scope=all
```

6. Switch the runtime to:

```bash
STORAGE_PROVIDER=s3-compatible
```

7. Restart the application.

## Verification Checklist

After cutover, verify:

1. A newly uploaded agent ZIP persists with:
   - `storageProvider = S3_COMPATIBLE`
   - correct `bucket`
   - stable `objectKey`

2. A newly uploaded delivery persists with:
   - `storageProvider = S3_COMPATIBLE`
   - correct `bucket`
   - stable `objectKey`

3. Published ZIP downloads still work from the marketplace.
4. Delivery downloads still require an authenticated buyer, provider, or admin.
5. Creator upload still works for:
   - agent ZIPs
   - delivery files

If an environment is already running with:

- `STORAGE_PROVIDER=s3-compatible`
- valid S3-compatible credentials

you can also run the rollout smoke suite:

```bash
npm run test:e2e
```

`tests/e2e/storage-rollout.spec.ts` is environment-gated. It skips automatically when the runtime is not configured for S3-compatible storage.

## Rollback

If uploads or downloads fail after cutover:

1. Change:

```bash
STORAGE_PROVIDER=local
```

2. Restart the application.
3. Verify:
   - package ZIP downloads
   - delivery downloads
   - creator uploads

The migration script does not delete local source files, so rollback remains available during the first rollout.

## Current Limits

- The migration script copies existing objects but does not remove local files.
- The script continues on single-row failure and prints a summary; operators must inspect failures before declaring rollout complete.
- `S3_PUBLIC_BASE_URL` is optional. If omitted, stored file URLs are derived from the endpoint and bucket settings.
