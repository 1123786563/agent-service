# Hermes-agent Marketplace Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Hermes-agent marketplace loop: whitelist creators can upload validated agent ZIP packages, public users can browse detail pages and download published ZIP files.

**Architecture:** Use a single Next.js App Router application with server-side domain modules for auth, ZIP validation, package persistence, and storage. Keep service-consulting, payment, delivery, ratings, recommendations, and Hermes one-click import out of this plan; those belong to later phase plans.

**Tech Stack:** Next.js, TypeScript, Prisma, Postgres, Zod, JSZip, Vitest, Playwright, local filesystem storage for development with a storage interface that can later be backed by S3-compatible object storage.

---

## Scope Boundary

This plan implements only Phase 1 from the design spec:

- Public marketplace shell.
- Email magic-link login.
- Creator whitelist.
- Creator ZIP upload.
- `agent.json` metadata validation.
- ZIP structure and risk validation.
- Agent detail page generation.
- Published ZIP download.
- Minimal admin controls for whitelist and archiving.

This plan does not implement:

- Service consultation.
- Service orders.
- Payments.
- Delivery uploads.
- Reviews.
- Recommendation ranking.
- One-click Hermes import.
- CLI install command.

## File Structure

Create the application structure below.

```text
.
├── .env.example
├── .gitignore
├── package.json
├── next.config.mjs
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── agents/page.tsx
│   │   ├── agents/[slug]/page.tsx
│   │   ├── creator/page.tsx
│   │   ├── creator/agents/new/page.tsx
│   │   ├── admin/page.tsx
│   │   ├── admin/whitelist/page.tsx
│   │   ├── api/auth/request-link/route.ts
│   │   ├── api/auth/consume/route.ts
│   │   ├── api/creator/agents/route.ts
│   │   └── api/agents/[slug]/download/route.ts
│   ├── components/
│   │   ├── agent-card.tsx
│   │   ├── agent-detail.tsx
│   │   ├── package-status-pill.tsx
│   │   └── upload-agent-form.tsx
│   ├── server/
│   │   ├── auth/
│   │   │   ├── magic-link.ts
│   │   │   └── session.ts
│   │   ├── agents/
│   │   │   ├── metadata-schema.ts
│   │   │   ├── package-service.ts
│   │   │   └── zip-validator.ts
│   │   ├── db.ts
│   │   ├── mail/dev-mailer.ts
│   │   └── storage/local-storage.ts
│   └── test/
│       └── fixtures.ts
└── tests/
    ├── server/
    │   ├── metadata-schema.test.ts
    │   ├── zip-validator.test.ts
    │   └── session.test.ts
    └── e2e/
        └── marketplace.spec.ts
```

Each server module has a single responsibility:

- `metadata-schema.ts`: parse and validate `agent.json`.
- `zip-validator.ts`: inspect ZIP contents without executing code.
- `package-service.ts`: persist validated agent packages and derived skills/workflows.
- `session.ts`: issue and read signed session cookies.
- `magic-link.ts`: create and consume login tokens.
- `local-storage.ts`: store ZIP files under `.data/uploads` in development.

---

### Task 1: Bootstrap Next.js App and Test Harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Initialize Git metadata**

Run:

```bash
test -d .git || git init
```

Expected: `.git/` exists after the command.

- [ ] **Step 2: Create the package manifest**

Create `package.json`:

```json
{
  "name": "hermes-agent-marketplace",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "jszip": "^3.10.1",
    "nanoid": "^5.0.7",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.8.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.13.0",
    "eslint-config-next": "^15.0.0",
    "jsdom": "^25.0.1",
    "prisma": "^5.22.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: `node_modules/` and `package-lock.json` are created.

- [ ] **Step 4: Add core config files**

Create `.gitignore`:

```gitignore
node_modules
.next
.env
.data
coverage
test-results
playwright-report
```

Create `.env.example`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hermes_agent_marketplace"
APP_URL="http://localhost:3000"
SESSION_SECRET="replace-with-a-32-byte-secret"
UPLOAD_DIR=".data/uploads"
DEV_EMAIL_OUTBOX=".data/dev-email-outbox.jsonl"
ADMIN_EMAILS="admin@example.com"
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
```

- [ ] **Step 5: Create the first app shell**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Agent Marketplace",
  description: "Download validated Hermes-agent packages and inspect their skills and workflows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">Hermes Agents</Link>
          <nav>
            <Link href="/agents">智能体</Link>
            <Link href="/creator">创作者</Link>
            <Link href="/admin">管理</Link>
          </nav>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <section className="hero">
      <p className="eyebrow">Hermes-agent marketplace</p>
      <h1>发现、检查并下载可导入 Hermes-agent 的智能体包</h1>
      <p className="lede">
        第一版聚焦白名单创作者发布 ZIP、平台校验 metadata、用户查看详情并下载。
      </p>
      <div className="actions">
        <Link className="button" href="/agents">浏览智能体</Link>
        <Link className="button secondary" href="/creator">上传智能体</Link>
      </div>
    </section>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color-scheme: light;
  --bg: #f8fafc;
  --panel: #ffffff;
  --text: #111827;
  --muted: #64748b;
  --line: #dbe3ef;
  --accent: #0f766e;
  --accent-weak: #ccfbf1;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.92);
}

.brand {
  font-weight: 800;
}

nav {
  display: flex;
  gap: 18px;
  color: var(--muted);
}

.page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 36px 24px 72px;
}

.hero {
  max-width: 760px;
  padding: 72px 0;
}

.eyebrow {
  color: var(--accent);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.78rem;
  letter-spacing: 0;
}

h1 {
  font-size: clamp(2.25rem, 5vw, 4rem);
  line-height: 1.05;
  letter-spacing: 0;
  margin: 12px 0 18px;
}

.lede {
  color: var(--muted);
  font-size: 1.08rem;
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  font-weight: 700;
}

.button.secondary {
  background: var(--panel);
  color: var(--accent);
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 20px;
}
```

- [ ] **Step 6: Verify the shell builds**

Run:

```bash
npm run build
```

Expected: `Compiled successfully` appears and the command exits with status 0.

- [ ] **Step 7: Commit the scaffold**

Run:

```bash
git add package.json package-lock.json .gitignore .env.example tsconfig.json next.config.mjs vitest.config.ts playwright.config.ts src/app
git commit -m "chore: scaffold marketplace app"
```

Expected: commit succeeds with message `chore: scaffold marketplace app`.

---

### Task 2: Add Database Schema and Prisma Client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/server/db.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  CREATOR
  ADMIN
}

enum WhitelistStatus {
  NONE
  INVITED
  ACTIVE
}

enum AgentPackageStatus {
  DRAFT
  VALIDATING
  PUBLISHED
  REJECTED
  ARCHIVED
}

model User {
  id              String          @id @default(cuid())
  email           String          @unique
  role            UserRole        @default(USER)
  whitelistStatus WhitelistStatus @default(NONE)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  packages        AgentPackage[]
  sessions        Session[]
  magicLinkTokens MagicLinkToken[]
}

model MagicLinkToken {
  id         String   @id @default(cuid())
  email      String
  tokenHash  String   @unique
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())

  userId     String?
  user       User?    @relation(fields: [userId], references: [id])

  @@index([email])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AgentPackage {
  id               String             @id @default(cuid())
  ownerId          String
  name             String
  slug             String             @unique
  version          String
  summary          String
  categories       String[]
  metadataJson     Json
  zipFileUrl       String
  zipFileName      String
  zipSizeBytes     Int
  coverUrl         String?
  status           AgentPackageStatus @default(DRAFT)
  validationResult Json
  publishedAt      DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  owner            User               @relation(fields: [ownerId], references: [id])
  skills           Skill[]
  workflows        Workflow[]
}

model Skill {
  id             String       @id @default(cuid())
  agentPackageId String
  name           String
  path           String
  description    String

  agentPackage   AgentPackage @relation(fields: [agentPackageId], references: [id], onDelete: Cascade)
}

model Workflow {
  id             String       @id @default(cuid())
  agentPackageId String
  name           String
  path           String
  description    String

  agentPackage   AgentPackage @relation(fields: [agentPackageId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Add Prisma client singleton**

Create `src/server/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Add seed script for admin and creator whitelist**

Create `prisma/seed.ts`:

```ts
import { UserRole, WhitelistStatus } from "@prisma/client";
import { prisma } from "../src/server/db";

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        role: UserRole.ADMIN,
        whitelistStatus: WhitelistStatus.ACTIVE
      },
      update: {
        role: UserRole.ADMIN,
        whitelistStatus: WhitelistStatus.ACTIVE
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
npm run prisma:generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 5: Run the migration**

Run:

```bash
npm run prisma:migrate -- --name init_marketplace
```

Expected: migration is created under `prisma/migrations/` and applied to the configured Postgres database.

- [ ] **Step 6: Commit database schema**

Run:

```bash
git add prisma src/server/db.ts package.json package-lock.json
git commit -m "feat: add marketplace database schema"
```

Expected: commit succeeds with message `feat: add marketplace database schema`.

---

### Task 3: Implement Agent Metadata Schema

**Files:**
- Create: `src/server/agents/metadata-schema.ts`
- Create: `tests/server/metadata-schema.test.ts`

- [ ] **Step 1: Write failing metadata tests**

Create `tests/server/metadata-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAgentMetadata } from "@/server/agents/metadata-schema";

const validMetadata = {
  id: "research-assistant",
  name: "Research Assistant",
  version: "1.0.0",
  summary: "帮助用户完成资料调研、摘要和报告初稿。",
  categories: ["research", "writing"],
  skills: [
    {
      name: "web-research",
      path: "skills/web-research/SKILL.md",
      description: "检索、筛选和整理资料"
    }
  ],
  workflows: [
    {
      name: "default",
      path: "workflows/main.json",
      description: "从用户问题到研究报告的默认流程"
    }
  ],
  hermes: {
    minVersion: "0.1.0",
    importType: "zip"
  },
  permissions: ["network.optional", "filesystem.read"],
  env: [
    {
      name: "OPENAI_API_KEY",
      required: true,
      description: "用于调用模型"
    }
  ],
  author: {
    name: "作者名",
    website: "https://example.com"
  },
  service: {
    available: true,
    types: ["customization", "deployment", "training"]
  }
};

describe("parseAgentMetadata", () => {
  it("accepts complete agent metadata", () => {
    const parsed = parseAgentMetadata(validMetadata);

    expect(parsed.name).toBe("Research Assistant");
    expect(parsed.skills[0].path).toBe("skills/web-research/SKILL.md");
  });

  it("rejects unsafe file paths", () => {
    expect(() =>
      parseAgentMetadata({
        ...validMetadata,
        skills: [{ name: "bad", path: "../secret.txt", description: "bad path" }]
      })
    ).toThrow("Invalid agent metadata");
  });

  it("rejects a non-zip import type", () => {
    expect(() =>
      parseAgentMetadata({
        ...validMetadata,
        hermes: { minVersion: "0.1.0", importType: "git" }
      })
    ).toThrow("Invalid agent metadata");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run test -- tests/server/metadata-schema.test.ts
```

Expected: FAIL because `@/server/agents/metadata-schema` does not exist.

- [ ] **Step 3: Implement metadata parsing**

Create `src/server/agents/metadata-schema.ts`:

```ts
import { z } from "zod";

const safeRelativePath = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/"), "Path must be relative")
  .refine((value) => !value.includes(".."), "Path cannot include parent traversal")
  .refine((value) => !value.includes("\\"), "Path must use forward slashes");

const skillSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500)
});

const workflowSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500)
});

const envSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Environment variable names must be uppercase snake case"),
  required: z.boolean(),
  description: z.string().min(1).max(300)
});

export const agentMetadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  summary: z.string().min(10).max(300),
  categories: z.array(z.string().min(1).max(40)).min(1).max(8),
  skills: z.array(skillSchema).min(1).max(30),
  workflows: z.array(workflowSchema).min(1).max(20),
  hermes: z.object({
    minVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    importType: z.literal("zip")
  }),
  permissions: z.array(z.string().min(1).max(80)).default([]),
  env: z.array(envSchema).default([]),
  author: z.object({
    name: z.string().min(1).max(120),
    website: z.string().url().optional()
  }),
  service: z
    .object({
      available: z.boolean(),
      types: z.array(z.enum(["customization", "deployment", "training", "integration"])).default([])
    })
    .default({ available: false, types: [] })
});

export type AgentMetadata = z.infer<typeof agentMetadataSchema>;

export function parseAgentMetadata(input: unknown): AgentMetadata {
  const result = agentMetadataSchema.safeParse(input);

  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid agent metadata: ${message}`);
  }

  return result.data;
}
```

- [ ] **Step 4: Verify metadata tests pass**

Run:

```bash
npm run test -- tests/server/metadata-schema.test.ts
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit metadata schema**

Run:

```bash
git add src/server/agents/metadata-schema.ts tests/server/metadata-schema.test.ts
git commit -m "feat: validate agent metadata"
```

Expected: commit succeeds with message `feat: validate agent metadata`.

---

### Task 4: Implement ZIP Validation

**Files:**
- Create: `src/server/agents/zip-validator.ts`
- Create: `src/test/fixtures.ts`
- Create: `tests/server/zip-validator.test.ts`

- [ ] **Step 1: Write failing ZIP validation tests**

Create `src/test/fixtures.ts`:

```ts
import JSZip from "jszip";

export async function createAgentZip(overrides: Record<string, string> = {}) {
  const zip = new JSZip();

  const metadata = {
    id: "research-assistant",
    name: "Research Assistant",
    version: "1.0.0",
    summary: "帮助用户完成资料调研、摘要和报告初稿。",
    categories: ["research", "writing"],
    skills: [
      {
        name: "web-research",
        path: "skills/web-research/SKILL.md",
        description: "检索、筛选和整理资料"
      }
    ],
    workflows: [
      {
        name: "default",
        path: "workflows/main.json",
        description: "从用户问题到研究报告的默认流程"
      }
    ],
    hermes: { minVersion: "0.1.0", importType: "zip" },
    permissions: ["network.optional"],
    env: [{ name: "OPENAI_API_KEY", required: true, description: "用于调用模型" }],
    author: { name: "作者名", website: "https://example.com" },
    service: { available: true, types: ["customization"] }
  };

  zip.file("agent.json", JSON.stringify(metadata, null, 2));
  zip.file("README.md", "# Research Assistant\n\n导入 Hermes-agent 后运行默认工作流。");
  zip.file("skills/web-research/SKILL.md", "# Web Research\n\n检索并整理资料。");
  zip.file("workflows/main.json", JSON.stringify({ steps: ["web-research"] }));

  for (const [path, content] of Object.entries(overrides)) {
    zip.file(path, content);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
```

Create `tests/server/zip-validator.test.ts`:

```ts
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createAgentZip } from "@/test/fixtures";
import { validateAgentZip } from "@/server/agents/zip-validator";

describe("validateAgentZip", () => {
  it("accepts a valid agent package", async () => {
    const result = await validateAgentZip(await createAgentZip());

    expect(result.ok).toBe(true);
    expect(result.metadata?.id).toBe("research-assistant");
    expect(result.risks).toContain("network.permission");
  });

  it("rejects a package missing README.md", async () => {
    const zip = new JSZip();
    zip.file("agent.json", JSON.stringify({}));

    const result = await validateAgentZip(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: README.md");
  });

  it("rejects metadata paths that do not exist in the archive", async () => {
    const zip = new JSZip();
    zip.file(
      "agent.json",
      JSON.stringify({
        id: "broken-agent",
        name: "Broken Agent",
        version: "1.0.0",
        summary: "这个包引用了不存在的 skill 文件。",
        categories: ["broken"],
        skills: [{ name: "missing", path: "skills/missing/SKILL.md", description: "missing" }],
        workflows: [{ name: "default", path: "workflows/main.json", description: "default" }],
        hermes: { minVersion: "0.1.0", importType: "zip" },
        permissions: [],
        env: [],
        author: { name: "作者" },
        service: { available: false, types: [] }
      })
    );
    zip.file("README.md", "# Broken Agent");
    zip.file("workflows/main.json", "{}");

    const result = await validateAgentZip(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Referenced skill file not found: skills/missing/SKILL.md");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run test -- tests/server/zip-validator.test.ts
```

Expected: FAIL because `@/server/agents/zip-validator` does not exist.

- [ ] **Step 3: Implement ZIP validation**

Create `src/server/agents/zip-validator.ts`:

```ts
import JSZip from "jszip";
import { AgentMetadata, parseAgentMetadata } from "./metadata-schema";

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_FILE_COUNT = 250;
const REQUIRED_FILES = ["agent.json", "README.md"];
const DANGEROUS_EXTENSIONS = [".exe", ".dmg", ".pkg", ".bat", ".cmd", ".ps1"];
const SCRIPT_EXTENSIONS = [".sh", ".js", ".ts", ".py", ".rb"];

export type ZipValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  metadata?: AgentMetadata;
};

export async function validateAgentZip(buffer: Buffer): Promise<ZipValidationResult> {
  const errors: string[] = [];
  const risks: string[] = [];

  if (buffer.byteLength > MAX_ZIP_BYTES) {
    errors.push(`ZIP exceeds ${MAX_ZIP_BYTES} bytes`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      ok: false,
      errors: ["Uploaded file is not a readable ZIP archive"],
      risks,
      fileNames: []
    };
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  if (fileNames.length > MAX_FILE_COUNT) {
    errors.push(`ZIP contains more than ${MAX_FILE_COUNT} files`);
  }

  for (const fileName of fileNames) {
    if (fileName.startsWith("/") || fileName.includes("..") || fileName.includes("\\")) {
      errors.push(`Unsafe path in ZIP: ${fileName}`);
    }

    const lowerName = fileName.toLowerCase();
    if (DANGEROUS_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      errors.push(`Dangerous file type in ZIP: ${fileName}`);
    }

    if (SCRIPT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      risks.push(`script.file:${fileName}`);
    }
  }

  for (const requiredFile of REQUIRED_FILES) {
    if (!zip.file(requiredFile)) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  const agentJsonFile = zip.file("agent.json");
  if (!agentJsonFile) {
    return { ok: false, errors, risks, fileNames };
  }

  let metadata: AgentMetadata | undefined;
  try {
    const rawMetadata = await agentJsonFile.async("string");
    metadata = parseAgentMetadata(JSON.parse(rawMetadata));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown metadata error";
    errors.push(message);
  }

  if (metadata) {
    for (const skill of metadata.skills) {
      if (!zip.file(skill.path)) {
        errors.push(`Referenced skill file not found: ${skill.path}`);
      }
    }

    for (const workflow of metadata.workflows) {
      if (!zip.file(workflow.path)) {
        errors.push(`Referenced workflow file not found: ${workflow.path}`);
      }
    }

    for (const permission of metadata.permissions) {
      if (permission.includes("network")) {
        risks.push("network.permission");
      }
      if (permission.includes("filesystem.write")) {
        risks.push("filesystem.write.permission");
      }
    }

    if (metadata.env.length >= 3) {
      risks.push("multiple.env.vars");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    risks: Array.from(new Set(risks)),
    fileNames,
    metadata
  };
}
```

- [ ] **Step 4: Verify ZIP validation tests pass**

Run:

```bash
npm run test -- tests/server/zip-validator.test.ts tests/server/metadata-schema.test.ts
```

Expected: PASS with all metadata and ZIP validation tests.

- [ ] **Step 5: Commit ZIP validation**

Run:

```bash
git add src/server/agents/zip-validator.ts src/test/fixtures.ts tests/server/zip-validator.test.ts
git commit -m "feat: validate uploaded agent zip packages"
```

Expected: commit succeeds with message `feat: validate uploaded agent zip packages`.

---

### Task 5: Implement Magic-Link Auth and Whitelist Checks

**Files:**
- Create: `src/server/auth/session.ts`
- Create: `src/server/auth/magic-link.ts`
- Create: `src/server/mail/dev-mailer.ts`
- Create: `tests/server/session.test.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/api/auth/request-link/route.ts`
- Create: `src/app/api/auth/consume/route.ts`

- [ ] **Step 1: Write session utility tests**

Create `tests/server/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionTokenHash, isAdminEmail } from "@/server/auth/session";

describe("session utilities", () => {
  it("hashes session tokens without returning the raw token", () => {
    const hash = createSessionTokenHash("secret-token");

    expect(hash).not.toBe("secret-token");
    expect(hash).toHaveLength(64);
  });

  it("detects admin emails from a comma-separated env value", () => {
    expect(isAdminEmail("admin@example.com", "admin@example.com,ops@example.com")).toBe(true);
    expect(isAdminEmail("user@example.com", "admin@example.com,ops@example.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run test -- tests/server/session.test.ts
```

Expected: FAIL because `@/server/auth/session` does not exist.

- [ ] **Step 3: Implement session helpers**

Create `src/server/auth/session.ts`:

```ts
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { UserRole, WhitelistStatus } from "@prisma/client";
import { prisma } from "@/server/db";

const SESSION_COOKIE = "hermes_market_session";
const SESSION_DAYS = 30;

export function createSessionTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function isAdminEmail(email: string, adminEmails = process.env.ADMIN_EMAILS ?? "") {
  return adminEmails
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function createSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: createSessionTokenHash(token),
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: createSessionTokenHash(token) },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
}

export async function requireCreator() {
  const user = await getCurrentUser();
  if (!user || user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    throw new Error("Creator whitelist is required");
  }

  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.ADMIN) {
    throw new Error("Admin access is required");
  }

  return user;
}
```

- [ ] **Step 4: Implement magic-link token generation and dev mailer**

Create `src/server/mail/dev-mailer.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export async function sendDevLoginEmail(email: string, loginUrl: string) {
  const outbox = process.env.DEV_EMAIL_OUTBOX ?? ".data/dev-email-outbox.jsonl";
  await fs.mkdir(path.dirname(outbox), { recursive: true });
  await fs.appendFile(
    outbox,
    JSON.stringify({ type: "login", email, loginUrl, sentAt: new Date().toISOString() }) + "\n",
    "utf8"
  );
}
```

Create `src/server/auth/magic-link.ts`:

```ts
import { UserRole, WhitelistStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { createOpaqueToken, createSession, createSessionTokenHash, isAdminEmail } from "./session";
import { sendDevLoginEmail } from "@/server/mail/dev-mailer";

const MAGIC_LINK_MINUTES = 15;

export async function requestMagicLink(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_MINUTES * 60 * 1000);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role: isAdminEmail(email) ? UserRole.ADMIN : UserRole.USER,
      whitelistStatus: isAdminEmail(email) ? WhitelistStatus.ACTIVE : WhitelistStatus.NONE
    },
    update: {}
  });

  await prisma.magicLinkToken.create({
    data: {
      email,
      userId: user.id,
      tokenHash: createSessionTokenHash(token),
      expiresAt
    }
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const loginUrl = `${appUrl}/api/auth/consume?token=${encodeURIComponent(token)}`;
  await sendDevLoginEmail(email, loginUrl);
}

export async function consumeMagicLink(rawToken: string) {
  const tokenHash = createSessionTokenHash(rawToken);
  const magicLinkToken = await prisma.magicLinkToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!magicLinkToken || magicLinkToken.consumedAt || magicLinkToken.expiresAt < new Date()) {
    throw new Error("Login link is invalid or expired");
  }

  await prisma.magicLinkToken.update({
    where: { id: magicLinkToken.id },
    data: { consumedAt: new Date() }
  });

  await createSession(magicLinkToken.user.id);
}
```

- [ ] **Step 5: Add login page and auth routes**

Create `src/app/login/page.tsx`:

```tsx
export default function LoginPage() {
  return (
    <section className="panel">
      <h1>登录</h1>
      <p className="lede">输入邮箱获取魔法链接。开发者上传权限由白名单控制。</p>
      <form method="post" action="/api/auth/request-link" className="form">
        <label>
          邮箱
          <input name="email" type="email" required />
        </label>
        <button className="button" type="submit">发送登录链接</button>
      </form>
    </section>
  );
}
```

Create `src/app/api/auth/request-link/route.ts`:

```ts
import { redirect } from "next/navigation";
import { requestMagicLink } from "@/server/auth/magic-link";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  await requestMagicLink(email);
  redirect("/login?sent=1");
}
```

Create `src/app/api/auth/consume/route.ts`:

```ts
import { redirect } from "next/navigation";
import { consumeMagicLink } from "@/server/auth/magic-link";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    redirect("/login?error=missing-token");
  }

  await consumeMagicLink(token);
  redirect("/creator");
}
```

- [ ] **Step 6: Run auth tests**

Run:

```bash
npm run test -- tests/server/session.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 7: Commit auth**

Run:

```bash
git add src/server/auth src/server/mail src/app/login src/app/api/auth tests/server/session.test.ts
git commit -m "feat: add magic link authentication"
```

Expected: commit succeeds with message `feat: add magic link authentication`.

---

### Task 6: Implement Storage and Agent Package Service

**Files:**
- Create: `src/server/storage/local-storage.ts`
- Create: `src/server/agents/package-service.ts`

- [ ] **Step 1: Implement local storage**

Create `src/server/storage/local-storage.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export type StoredFile = {
  url: string;
  fileName: string;
  sizeBytes: number;
};

export async function saveUploadedZip(buffer: Buffer, originalName: string): Promise<StoredFile> {
  const uploadDir = process.env.UPLOAD_DIR ?? ".data/uploads";
  await fs.mkdir(uploadDir, { recursive: true });

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const fileName = `${nanoid(10)}-${safeName.endsWith(".zip") ? safeName : `${safeName}.zip`}`;
  const absolutePath = path.join(uploadDir, fileName);
  await fs.writeFile(absolutePath, buffer);

  return {
    url: `/api/uploads/${fileName}`,
    fileName,
    sizeBytes: buffer.byteLength
  };
}

export async function readStoredZip(fileName: string) {
  const uploadDir = process.env.UPLOAD_DIR ?? ".data/uploads";
  return fs.readFile(path.join(uploadDir, fileName));
}
```

- [ ] **Step 2: Implement package persistence service**

Create `src/server/agents/package-service.ts`:

```ts
import { AgentPackageStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { validateAgentZip } from "./zip-validator";
import { saveUploadedZip } from "@/server/storage/local-storage";

function slugFromMetadata(id: string, version: string) {
  return `${id}-${version.replaceAll(".", "-")}`;
}

export async function createAgentPackageFromZip(input: {
  ownerId: string;
  fileName: string;
  buffer: Buffer;
}) {
  const validation = await validateAgentZip(input.buffer);

  if (!validation.ok || !validation.metadata) {
    return {
      ok: false as const,
      errors: validation.errors,
      risks: validation.risks
    };
  }

  const storedFile = await saveUploadedZip(input.buffer, input.fileName);
  const metadata = validation.metadata;
  const slug = slugFromMetadata(metadata.id, metadata.version);

  const agentPackage = await prisma.agentPackage.create({
    data: {
      ownerId: input.ownerId,
      name: metadata.name,
      slug,
      version: metadata.version,
      summary: metadata.summary,
      categories: metadata.categories,
      metadataJson: metadata,
      zipFileUrl: storedFile.url,
      zipFileName: storedFile.fileName,
      zipSizeBytes: storedFile.sizeBytes,
      status: AgentPackageStatus.PUBLISHED,
      validationResult: {
        errors: validation.errors,
        risks: validation.risks,
        fileNames: validation.fileNames
      },
      publishedAt: new Date(),
      skills: {
        create: metadata.skills.map((skill) => ({
          name: skill.name,
          path: skill.path,
          description: skill.description
        }))
      },
      workflows: {
        create: metadata.workflows.map((workflow) => ({
          name: workflow.name,
          path: workflow.path,
          description: workflow.description
        }))
      }
    },
    include: {
      skills: true,
      workflows: true
    }
  });

  return {
    ok: true as const,
    package: agentPackage,
    risks: validation.risks
  };
}

export async function listPublishedAgentPackages() {
  return prisma.agentPackage.findMany({
    where: { status: AgentPackageStatus.PUBLISHED },
    include: { skills: true, workflows: true, owner: true },
    orderBy: { publishedAt: "desc" }
  });
}

export async function getPublishedAgentPackageBySlug(slug: string) {
  return prisma.agentPackage.findFirst({
    where: { slug, status: AgentPackageStatus.PUBLISHED },
    include: { skills: true, workflows: true, owner: true }
  });
}
```

- [ ] **Step 3: Run type check through build**

Run:

```bash
npm run build
```

Expected: build exits with status 0.

- [ ] **Step 4: Commit storage and package service**

Run:

```bash
git add src/server/storage/local-storage.ts src/server/agents/package-service.ts
git commit -m "feat: persist validated agent packages"
```

Expected: commit succeeds with message `feat: persist validated agent packages`.

---

### Task 7: Add Creator Dashboard and ZIP Upload Route

**Files:**
- Create: `src/components/upload-agent-form.tsx`
- Create: `src/components/package-status-pill.tsx`
- Create: `src/app/creator/page.tsx`
- Create: `src/app/creator/agents/new/page.tsx`
- Create: `src/app/api/creator/agents/route.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Create reusable creator UI components**

Create `src/components/package-status-pill.tsx`:

```tsx
import type { AgentPackageStatus } from "@prisma/client";

const labels: Record<AgentPackageStatus, string> = {
  DRAFT: "草稿",
  VALIDATING: "校验中",
  PUBLISHED: "已发布",
  REJECTED: "已拒绝",
  ARCHIVED: "已归档"
};

export function PackageStatusPill({ status }: { status: AgentPackageStatus }) {
  return <span className="status-pill">{labels[status]}</span>;
}
```

Create `src/components/upload-agent-form.tsx`:

```tsx
export function UploadAgentForm() {
  return (
    <form method="post" action="/api/creator/agents" encType="multipart/form-data" className="form">
      <label>
        智能体 ZIP
        <input name="file" type="file" accept=".zip,application/zip" required />
      </label>
      <button className="button" type="submit">上传并发布</button>
    </form>
  );
}
```

- [ ] **Step 2: Add creator pages**

Create `src/app/creator/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { WhitelistStatus } from "@prisma/client";
import { PackageStatusPill } from "@/components/package-status-pill";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function CreatorPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return (
      <section className="panel">
        <h1>创作者工作台</h1>
        <p className="lede">你的邮箱尚未进入白名单，暂时不能上传智能体 ZIP。</p>
      </section>
    );
  }

  const packages = await prisma.agentPackage.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>创作者工作台</h1>
          <p className="lede">上传 ZIP 后，平台会校验 agent.json、skill 路径和工作流引用。</p>
        </div>
        <Link className="button" href="/creator/agents/new">上传智能体</Link>
      </div>

      <div className="grid">
        {packages.map((agentPackage) => (
          <article className="panel" key={agentPackage.id}>
            <PackageStatusPill status={agentPackage.status} />
            <h2>{agentPackage.name}</h2>
            <p>{agentPackage.summary}</p>
            <Link href={`/agents/${agentPackage.slug}`}>查看详情</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Create `src/app/creator/agents/new/page.tsx`:

```tsx
import { UploadAgentForm } from "@/components/upload-agent-form";

export default function NewAgentPage() {
  return (
    <section className="panel">
      <h1>上传智能体 ZIP</h1>
      <p className="lede">ZIP 必须包含 agent.json 和 README.md，并引用真实存在的 skill 与 workflow 文件。</p>
      <UploadAgentForm />
    </section>
  );
}
```

- [ ] **Step 3: Add creator upload route**

Create `src/app/api/creator/agents/route.ts`:

```ts
import { redirect } from "next/navigation";
import { requireCreator } from "@/server/auth/session";
import { createAgentPackageFromZip } from "@/server/agents/package-service";

export async function POST(request: Request) {
  const user = await requireCreator();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ errors: ["Missing ZIP file"] }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await createAgentPackageFromZip({
    ownerId: user.id,
    fileName: file.name,
    buffer
  });

  if (!result.ok) {
    return Response.json({ errors: result.errors, risks: result.risks }, { status: 400 });
  }

  redirect(`/agents/${result.package.slug}`);
}
```

- [ ] **Step 4: Add form and grid CSS**

Append to `src/app/globals.css`:

```css
.form {
  display: grid;
  gap: 16px;
  max-width: 520px;
}

.form label {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-weight: 700;
}

.form input {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 800;
}
```

- [ ] **Step 5: Build and manually verify whitelist guard**

Run:

```bash
npm run build
```

Expected: build exits with status 0. Visiting `/creator` without a session redirects to `/login`.

- [ ] **Step 6: Commit creator upload flow**

Run:

```bash
git add src/components src/app/creator src/app/api/creator src/app/globals.css
git commit -m "feat: add creator zip upload flow"
```

Expected: commit succeeds with message `feat: add creator zip upload flow`.

---

### Task 8: Add Public Marketplace Pages and Download Route

**Files:**
- Create: `src/components/agent-card.tsx`
- Create: `src/components/agent-detail.tsx`
- Create: `src/app/agents/page.tsx`
- Create: `src/app/agents/[slug]/page.tsx`
- Create: `src/app/api/agents/[slug]/download/route.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add marketplace components**

Create `src/components/agent-card.tsx`:

```tsx
import Link from "next/link";
import type { AgentPackage, Skill } from "@prisma/client";

type AgentCardProps = {
  agentPackage: AgentPackage & { skills: Skill[] };
};

export function AgentCard({ agentPackage }: AgentCardProps) {
  return (
    <article className="panel agent-card">
      <p className="eyebrow">{agentPackage.categories.join(" / ")}</p>
      <h2>{agentPackage.name}</h2>
      <p>{agentPackage.summary}</p>
      <p className="muted">{agentPackage.skills.length} skills · v{agentPackage.version}</p>
      <Link className="button secondary" href={`/agents/${agentPackage.slug}`}>查看详情</Link>
    </article>
  );
}
```

Create `src/components/agent-detail.tsx`:

```tsx
import type { AgentPackage, Skill, Workflow, User } from "@prisma/client";

type AgentDetailProps = {
  agentPackage: AgentPackage & {
    skills: Skill[];
    workflows: Workflow[];
    owner: User;
  };
};

export function AgentDetail({ agentPackage }: AgentDetailProps) {
  const validation = agentPackage.validationResult as { risks?: string[] };

  return (
    <article className="detail">
      <section className="detail-hero panel">
        <div>
          <p className="eyebrow">Hermes-agent ZIP</p>
          <h1>{agentPackage.name}</h1>
          <p className="lede">{agentPackage.summary}</p>
          <p className="muted">作者：{agentPackage.owner.email} · 版本：{agentPackage.version}</p>
        </div>
        <a className="button" href={`/api/agents/${agentPackage.slug}/download`}>下载 ZIP</a>
      </section>

      <section className="panel">
        <h2>Skill</h2>
        <div className="list">
          {agentPackage.skills.map((skill) => (
            <div key={skill.id}>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <code>{skill.path}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>执行流程</h2>
        <div className="list">
          {agentPackage.workflows.map((workflow) => (
            <div key={workflow.id}>
              <h3>{workflow.name}</h3>
              <p>{workflow.description}</p>
              <code>{workflow.path}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>安装和风险提示</h2>
        <ol>
          <li>下载 ZIP。</li>
          <li>在导入 Hermes-agent 前检查 README、权限和环境变量。</li>
          <li>确认配置后导入 Hermes-agent。</li>
        </ol>
        <p className="muted">风险标记：{validation.risks?.length ? validation.risks.join(", ") : "未发现基础风险标记"}</p>
      </section>
    </article>
  );
}
```

- [ ] **Step 2: Add public list and detail pages**

Create `src/app/agents/page.tsx`:

```tsx
import { AgentCard } from "@/components/agent-card";
import { listPublishedAgentPackages } from "@/server/agents/package-service";

export default async function AgentsPage() {
  const packages = await listPublishedAgentPackages();

  return (
    <section>
      <h1>智能体市场</h1>
      <p className="lede">浏览已通过结构校验的 Hermes-agent ZIP 包。</p>
      <div className="grid">
        {packages.map((agentPackage) => (
          <AgentCard key={agentPackage.id} agentPackage={agentPackage} />
        ))}
      </div>
    </section>
  );
}
```

Create `src/app/agents/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AgentDetail } from "@/components/agent-detail";
import { getPublishedAgentPackageBySlug } from "@/server/agents/package-service";

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agentPackage = await getPublishedAgentPackageBySlug(slug);

  if (!agentPackage) {
    notFound();
  }

  return <AgentDetail agentPackage={agentPackage} />;
}
```

- [ ] **Step 3: Add download route**

Create `src/app/api/agents/[slug]/download/route.ts`:

```ts
import { notFound } from "next/navigation";
import { getPublishedAgentPackageBySlug } from "@/server/agents/package-service";
import { readStoredZip } from "@/server/storage/local-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agentPackage = await getPublishedAgentPackageBySlug(slug);

  if (!agentPackage) {
    notFound();
  }

  const buffer = await readStoredZip(agentPackage.zipFileName);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${agentPackage.slug}.zip"`,
      "Content-Length": String(buffer.byteLength)
    }
  });
}
```

- [ ] **Step 4: Add marketplace CSS**

Append to `src/app/globals.css`:

```css
.agent-card {
  display: grid;
  gap: 10px;
}

.muted {
  color: var(--muted);
}

.detail {
  display: grid;
  gap: 18px;
}

.detail-hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: center;
}

.list {
  display: grid;
  gap: 14px;
}

code {
  display: inline-flex;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 3px 6px;
  border-radius: 4px;
  background: #eef2f7;
}

@media (max-width: 720px) {
  .detail-hero,
  .section-header {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Build and verify public pages compile**

Run:

```bash
npm run build
```

Expected: build exits with status 0.

- [ ] **Step 6: Commit public marketplace**

Run:

```bash
git add src/components/agent-card.tsx src/components/agent-detail.tsx src/app/agents src/app/api/agents src/app/globals.css
git commit -m "feat: add public marketplace pages"
```

Expected: commit succeeds with message `feat: add public marketplace pages`.

---

### Task 9: Add Minimal Admin Controls

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/whitelist/page.tsx`
- Create: `src/app/admin/actions.ts`

- [ ] **Step 1: Add admin server actions**

Create `src/app/admin/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { AgentPackageStatus, UserRole, WhitelistStatus } from "@prisma/client";
import { requireAdmin } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function activateCreatorWhitelist(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Email is required");
  }

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role: UserRole.CREATOR,
      whitelistStatus: WhitelistStatus.ACTIVE
    },
    update: {
      role: UserRole.CREATOR,
      whitelistStatus: WhitelistStatus.ACTIVE
    }
  });

  revalidatePath("/admin/whitelist");
}

export async function archiveAgentPackage(formData: FormData) {
  await requireAdmin();

  const packageId = String(formData.get("packageId") ?? "");
  await prisma.agentPackage.update({
    where: { id: packageId },
    data: { status: AgentPackageStatus.ARCHIVED }
  });

  revalidatePath("/admin");
  revalidatePath("/agents");
}
```

- [ ] **Step 2: Add admin overview page**

Create `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { archiveAgentPackage } from "./actions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/login");
  }

  const packages = await prisma.agentPackage.findMany({
    include: { owner: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>管理后台</h1>
          <p className="lede">管理白名单、查看 ZIP 风险结果、下架异常智能体。</p>
        </div>
        <Link className="button secondary" href="/admin/whitelist">白名单</Link>
      </div>
      <div className="list">
        {packages.map((agentPackage) => (
          <article className="panel" key={agentPackage.id}>
            <h2>{agentPackage.name}</h2>
            <p className="muted">{agentPackage.owner.email} · {agentPackage.status}</p>
            <pre>{JSON.stringify(agentPackage.validationResult, null, 2)}</pre>
            <form action={archiveAgentPackage}>
              <input type="hidden" name="packageId" value={agentPackage.id} />
              <button className="button secondary" type="submit">下架</button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Create `src/app/admin/whitelist/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { activateCreatorWhitelist } from "../actions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function WhitelistPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/login");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" }
  });

  return (
    <section>
      <h1>白名单管理</h1>
      <form action={activateCreatorWhitelist} className="form panel">
        <label>
          创作者邮箱
          <input name="email" type="email" required />
        </label>
        <button className="button" type="submit">加入白名单</button>
      </form>

      <div className="list">
        {users.map((listedUser) => (
          <article className="panel" key={listedUser.id}>
            <strong>{listedUser.email}</strong>
            <p className="muted">{listedUser.role} · {listedUser.whitelistStatus}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Build and verify admin pages compile**

Run:

```bash
npm run build
```

Expected: build exits with status 0.

- [ ] **Step 4: Commit admin controls**

Run:

```bash
git add src/app/admin
git commit -m "feat: add admin whitelist controls"
```

Expected: commit succeeds with message `feat: add admin whitelist controls`.

---

### Task 10: Add End-to-End Smoke Test and Operator Docs

**Files:**
- Create: `tests/e2e/marketplace.spec.ts`
- Create: `docs/phase-1-operator-guide.md`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright smoke test**

Create `tests/e2e/marketplace.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("homepage links to marketplace and creator login path", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /发现、检查并下载/ })).toBeVisible();

  await page.getByRole("link", { name: "浏览智能体" }).click();
  await expect(page).toHaveURL(/\/agents$/);

  await page.goto("/");
  await page.getByRole("link", { name: "上传智能体" }).click();
  await expect(page).toHaveURL(/\/creator$/);
});
```

- [ ] **Step 2: Add operator guide**

Create `docs/phase-1-operator-guide.md`:

```markdown
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
```

- [ ] **Step 3: Run unit tests**

Run:

```bash
npm run test
```

Expected: all Vitest tests pass.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: build exits with status 0.

- [ ] **Step 5: Run E2E smoke test**

Run:

```bash
npm run test:e2e
```

Expected: Playwright reports 1 passed test.

- [ ] **Step 6: Commit tests and docs**

Run:

```bash
git add tests/e2e docs/phase-1-operator-guide.md package.json package-lock.json playwright.config.ts
git commit -m "test: add phase one smoke coverage"
```

Expected: commit succeeds with message `test: add phase one smoke coverage`.

---

## Final Verification

Run the full local verification set:

```bash
npm run test
npm run build
npm run test:e2e
```

Expected:

- Vitest passes all unit tests.
- Next.js production build succeeds.
- Playwright homepage smoke test passes.

Manual acceptance checklist:

- Admin can log in through dev magic-link outbox.
- Admin can add a creator to whitelist.
- Non-whitelisted user sees the creator access message and cannot upload.
- Whitelisted creator can upload a valid ZIP.
- Invalid ZIP returns explicit JSON errors.
- Published agent appears on `/agents`.
- Agent detail page shows summary, skills, workflows, risk flags, and download button.
- Download route returns a ZIP with `Content-Type: application/zip`.
- Admin can archive an agent package and remove it from public listing.

## Spec Coverage Map

- Public market pages: Tasks 1 and 8.
- Light account system: Task 5.
- Whitelist publishing: Tasks 5, 7, and 9.
- ZIP structure and metadata validation: Tasks 3 and 4.
- Detail page generation: Tasks 6 and 8.
- Anonymous ZIP download: Task 8.
- Minimal admin controls: Task 9.
- Phase 1 operator verification: Task 10.

## Implementation Notes

- Phase 1 publishes valid ZIP uploads immediately for active whitelist creators. Admin review is handled through archive and risk review controls.
- The storage module uses local disk in development and keeps its interface small so a later S3 provider can replace it without changing upload and download routes.
- The magic-link mailer writes to a JSONL file in development. A production email provider can replace `sendDevLoginEmail` without changing auth routes.
