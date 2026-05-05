# 测试设置与模式

## 测试框架

项目使用两个测试框架：

- **Vitest** 用于单元/集成测试（服务端逻辑、路由、组件）。
- **Playwright** 用于端到端（E2E）浏览器测试。

---

## 配置

### Vitest（`vitest.config.ts`）

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

关键设置：
- `environment: "node"` — 测试在 Node.js 中运行（非 jsdom/浏览器）。
- `globals: true` — `describe`、`it`、`expect` 全局可用，无需导入。
- `include` — `tests/**/*.test.ts` 和 `tests/**/*.test.tsx` 中的测试。
- 路径别名 `@/` 映射到 `./src/`，匹配 `tsconfig.json`。

### Playwright（`playwright.config.ts`）

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
    reuseExistingServer: true,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? "admin@example.com"
    }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
```

关键设置：
- 测试仅在 `tests/e2e/` 中。
- `fullyParallel: false` — E2E 测试顺序运行以避免数据竞争。
- 启动 `npm run dev` 作为 Web 服务器，重复使用时已运行的。
- 覆盖 `DATABASE_URL` 为 `localhost:55432` 的测试数据库。
- 仅 Chromium（无 Firefox/WebKit）。

### ESLint（`eslint.config.mjs`）

扩展 `next/core-web-vitals` 和 `next/typescript`。无测试特定 ESLint 规则。

---

## 测试文件位置与组织

```
tests/
  server/                              -- 单元/集成测试（Vitest）
    harness.test.ts                    -- 冒烟测试（1+1=2）
    metadata-schema.test.ts            -- 智能体元数据 Zod 模式
    zip-validator.test.ts              -- ZIP 验证逻辑
    magic-link.test.ts                 -- 魔法链接认证流程
    session.test.ts                    -- 会话管理
    login-page.test.tsx                -- 登录页面组件渲染
    consultation-service.test.ts       -- 咨询服务
    consultation-route.test.ts         -- 咨询 API 路由
    creator-consultations-page.test.tsx -- 创作者咨询页面
    creator-actions.test.ts            -- 创作者服务端动作
    creator-upload-route.test.ts       -- 智能体上传 API 路由
    creator-page.test.tsx              -- 创作者后台页面
    creator-orders-page.test.tsx       -- 创作者订单页面
    order-service.test.ts              -- 订单生命周期服务
    payment-ledger.test.ts             -- 支付账本幂等性
    payment-route.test.ts              -- 支付 API 路由
    delivery-service.test.ts           -- 交付服务
    delivery-route.test.ts            -- 交付 API 路由
    delivery-download-route.test.ts    -- 交付下载路由
    complete-order-route.test.ts       -- 订单完成路由
    cancel-order-route.test.ts         -- 订单取消路由
    dispute-service.test.ts            -- 争议服务
    dispute-order-route.test.ts        -- 争议 API 路由
    admin-actions.test.ts              -- 管理员服务端动作
    admin-page.test.tsx                -- 管理员后台页面
    admin-analytics-page.test.tsx      -- 管理员分析页面
    account-orders-page.test.tsx       -- 买家订单页面
    agent-download-route.test.ts       -- 智能体 ZIP 下载路由
    agent-detail-page.test.tsx         -- 智能体详情页面渲染
    agents-page.test.tsx               -- 智能体列表页面
    creator-public-page.test.tsx       -- 公开创作者资料页面
    local-storage.test.ts              -- 本地存储提供商
    local-delivery-storage.test.ts     -- 本地交付存储
    audit-service.test.ts              -- 审计日志服务
    download-authorization.test.ts     -- 下载访问检查
    download-ticket.test.ts            -- HMAC 票证验证
    storage-factory.test.ts            -- 存储提供商工厂
    s3-provider.test.ts                -- S3 兼容提供商
    package-service.test.ts            -- 智能体包服务
    stripe-adapter.test.ts            -- Stripe 支付适配器
    refund-service.test.ts             -- 退款处理
    settlement-service.test.ts         -- 结算批次服务
    product-service.test.ts            -- 产品收藏/评价
  e2e/                                 -- 端到端测试（Playwright）
    marketplace.spec.ts                -- 主页导航
    consultation.spec.ts               -- 咨询表单提交
    order-lifecycle.spec.ts            -- 取消和争议流程
    delivery.spec.ts                   -- 交付上传和下载
    settlement.spec.ts                 -- 结算批次生命周期
    storage-rollout.spec.ts            -- S3 存储提供商推广

src/test/
  fixtures.ts                          -- 测试 fixtures（ZIP 构建器）
```

### 命名约定

- 单元测试：`<module-name>.test.ts` 或 `<module-name>.test.tsx`
- E2E 测试：`<feature>.spec.ts`
- 所有测试文件在 `tests/` 下（非与源代码同位置）。

---

## 单元测试模式

### 测试结构

测试使用 Vitest 的 `describe`/`it` 块。导入是显式的：

```ts
import { describe, expect, it, vi } from "vitest";
```

（注：`globals: true` 使这些全局可用，但测试按约定显式导入。）

### 使用依赖注入测试服务函数

主要单元测试模式利用每个服务内置的 deps 注入。测试创建模拟存储对象并作为 `deps` 参数传递：

```ts
// tests/server/consultation-service.test.ts
it("为已发布包创建咨询", async () => {
  const store = {
    findPublishedAgentPackageBySlug: vi.fn().mockResolvedValue({
      id: "pkg-1",
      ownerId: "creator-1"
    }),
    create: vi.fn().mockResolvedValue({
      id: "consultation-1",
      buyerEmail: "buyer@example.com",
      requirement: "需要定制部署"
    }),
    findManyForProvider: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  };

  const consultation = await createConsultation({
    agentSlug: "research-assistant",
    buyerEmail: "buyer@example.com",
    requirement: "  需要定制部署  "
  }, { store });

  expect(store.findPublishedAgentPackageBySlug).toHaveBeenCalledWith("research-assistant");
  expect(store.create).toHaveBeenCalledWith({
    data: {
      agentPackageId: "pkg-1",
      providerId: "creator-1",
      buyerEmail: "buyer@example.com",
      buyerUserId: null,
      requirement: "需要定制部署",
      status: ConsultationStatus.NEW
    }
  });
});
```

关键点：
- 用 `vi.fn()` 模拟每个方法的 `store` 对象。
- 未使用的存储方法仍包含为 `vi.fn()` 以满足类型。
- 将模拟存储作为 `{ store }` 传递，匹配 `deps` 参数形状。
- 断言调用参数和返回值。

### 测试服务端动作

服务端动作测试使用 `vi.mock()` 在模块级别模拟所有外部依赖：

```ts
// tests/server/creator-actions.test.ts
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/server/auth/session", () => ({
  requireCreator: vi.fn()
}));

vi.mock("@/server/consultations/service", () => ({
  getConsultationById: vi.fn(),
  updateConsultation: vi.fn()
}));

vi.mock("@/server/orders/service", () => ({
  createServiceOrder: vi.fn()
}));

// 在 vi.mock 调用后导入模拟模块
import { revalidatePath } from "next/cache";
import { createConsultationOrderAction } from "@/app/creator/actions";
import { requireCreator } from "@/server/auth/session";
```

模式：
1. 用 `vi.mock()` 模拟所有外部模块。
2. 在模拟声明后导入模拟函数。
3. 使用 `beforeEach(() => vi.clearAllMocks())` 进行测试隔离。
4. 用 `vi.mocked(fn).mockResolvedValue(...)` 配置模拟返回值。
5. 创建 `FormData` 对象以模拟表单提交。
6. 断言模拟调用和 `revalidatePath` 调用。

### 测试 API 路由

API 路由测试模拟服务函数并创建 `Request` 对象：

```ts
// tests/server/consultation-route.test.ts
vi.mock("@/server/consultations/service", () => ({
  createConsultation: vi.fn()
}));

import { POST } from "@/app/api/consultations/route";
import { createConsultation } from "@/server/consultations/service";

it("为已发布智能体包创建咨询", async () => {
  vi.mocked(createConsultation).mockResolvedValue({ ... } as never);

  const response = await POST(new Request("http://localhost/api/consultations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentSlug: "research-assistant", ... })
  }));

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ ... });
});
```

模式：
1. 模拟服务模块。
2. 在模拟后导入路由处理程序（`POST`、`GET` 等）。
3. 用完整 URL 和 body 创建 `Request` 对象。
4. 断言 HTTP 状态码和响应体。

### 使用 Prisma 模拟测试（高级）

一些测试使用 `vi.hoisted()` 直接模拟 Prisma：

```ts
// tests/server/dispute-service.test.ts
const prismaMock = vi.hoisted(() => ({
  serviceOrder: { findUnique: vi.fn() },
  dispute: { findFirst: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: prismaMock
}));

// 在测试中：
prismaMock.$transaction.mockImplementation(async (callback) =>
  callback({
    dispute: { create: vi.fn().mockResolvedValue({ ... }) },
    serviceOrder: { update: vi.fn().mockResolvedValue({}) }
  })
);
```

这用于不使用 deps 模式的服务（例如 `disputes/service.ts`、`settlements/service.ts`、`refunds/service.ts`）而是直接使用 Prisma 的情况。

### 测试适配器/策略类

适配器测试通过构造函数注入模拟客户端：

```ts
// tests/server/stripe-adapter.test.ts
function createMockStripeClient() {
  return {
    checkout: { sessions: { create: vi.fn() } },
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() }
  };
}

const provider = new StripePaymentProvider({
  secretKey: "sk_test_123",
  appUrl: "https://market.example.com"
}, client as never);
```

`as never` 转换绕过模拟客户端上的 TypeScript 严格类型检查。

---

## E2E 测试模式

### 测试结构

E2E 测试是完整的集成测试：
1. 直接用 Prisma 向数据库播种数据。
2. 通过插入会话令牌创建认证会话。
3. 使用 Playwright 与运行的 Next.js 应用交互。
4. UI 交互后验证数据库状态。
5. 在 `finally` 块中清理测试数据。

### 数据库设置

每个 E2E 测试文件创建自己的 Prisma 客户端：

```ts
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});
```

### 会话创建辅助函数

共享辅助函数创建认证浏览器会话：

```ts
const sessionCookie = "hermes_market_session";
const baseUrl = "http://localhost:3000";

function createSessionTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createTestSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createSessionTokenHash(token),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  return token;
}
```

### 认证浏览器上下文

测试创建带会话 Cookie 的隔离浏览器上下文：

```ts
const buyerToken = await createTestSession(buyer.id);
const buyerContext = await browser.newContext();
await buyerContext.addCookies([{
  name: sessionCookie,
  value: buyerToken,
  url: baseUrl,
  httpOnly: true,
  sameSite: "Lax"
}]);
const buyerPage = await buyerContext.newPage();
```

### 数据播种和清理

测试用唯一标识符（UUID 后缀）播种数据并在 `finally` 中清理：

```ts
const suffix = crypto.randomUUID();
const creatorEmail = `creator-${suffix}@example.com`;
const slug = `cancel-agent-${suffix}`;

const creator = await prisma.user.create({ data: { email: creatorEmail, ... } });

try {
  // ... 测试逻辑 ...
} finally {
  // 按反向依赖顺序删除
  await prisma.serviceOrder.deleteMany({ where: { consultation: { agentPackage: { slug } } } });
  await prisma.consultation.deleteMany({ where: { agentPackage: { slug } } });
  await prisma.agentPackage.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { id: { in: [creator.id, buyer.id] } } });
}
```

### UI 交互断言

E2E 测试使用 Playwright 的基于角色的选择器，匹配中文 UI 文本：

```ts
await expect(page.getByRole("heading", { name: "发现、检查并下载可导入 Hermes-agent 的智能体包" })).toBeVisible();
await page.getByRole("button", { name: "取消订单" }).click();
await expect(buyerPage.getByText("已取消")).toBeVisible();
```

---

## 测试 Fixtures 和工厂

### `src/test/fixtures.ts`

包含一个 fixture：`createAgentZip()`，在内存中构建有效智能体 ZIP 用于上传测试。

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
    skills: [{ name: "web-research", path: "skills/web-research/SKILL.md", description: "检索、筛选和整理资料" }],
    workflows: [{ name: "default", path: "workflows/main.json", description: "从用户问题到研究报告的默认流程" }],
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
  for (const [path, content] of Object.entries(overrides)) { zip.file(path, content); }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
```

### 测试内辅助函数

一些测试文件内联定义自己的辅助函数：

```ts
// tests/server/delivery-service.test.ts
function createDeps(overrides: { order?: unknown; delivery?: unknown; ... } = {}) {
  const store = { ... };
  const storage = { ... };
  return { store, storage, deps: { store, storage } };
}
```

```ts
// tests/server/stripe-adapter.test.ts
function createMockStripeClient() {
  return {
    checkout: { sessions: { create: vi.fn() } },
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() }
  };
}
```

---

## 模拟模式

### `vi.mock()` 用于模块模拟

主要模拟方法。用于路由和动作测试：

```ts
