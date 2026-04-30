# Phase 1 Operator Guide

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, and `UPLOAD_DIR`.
3. Run `npm install`.
4. Run `npm run prisma:migrate -- --name init_marketplace`.
5. Run `npm run prisma:seed`.
6. Run `npm run dev`.

## Login Flow

In development, login links are written to `.data/dev-email-outbox.jsonl`.

1. Visit `/login`.
2. Submit an email address.
3. Open the latest JSON line in `.data/dev-email-outbox.jsonl`.
4. Visit the `loginUrl` value.

## Creator Upload Flow

1. Admin logs in.
2. Admin visits `/admin/whitelist`.
3. Admin adds a creator email.
4. Creator logs in.
5. Creator visits `/creator/agents/new`.
6. Creator uploads a ZIP containing `agent.json`, `README.md`, skill files, and workflow files.
7. The app publishes the package and redirects to `/agents/[slug]`.

## Public Download Flow

1. Visit `/agents`.
2. Open a published package.
3. Review summary, skills, workflows, install notes, and risk flags.
4. Click `下载 ZIP`.

## Phase 1 Production Notes

- Keep `UPLOAD_DIR` on persistent storage.
- Use a strong `SESSION_SECRET`.
- Put the app behind HTTPS before production traffic.
- Review packages with script risk flags before promoting creators beyond the initial whitelist.
