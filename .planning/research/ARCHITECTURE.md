# 架构研究：多提供商认证、CSRF、速率限制与数据完整性

## 范围

本文档回答：如何在 Next.js 15 中架构多提供商认证（魔法链接 + 密码 + OAuth）？CSRF 保护和速率限制如何适应中间件层？还涵盖数据完整性模式、文件验证和生产启动验证。

---

## 1. 当前状态摘要

### 认证

应用使用构建在三个文件上的自定义内置认证系统：

| 文件 | 角色 |
|------|------|
| `src/server/auth/session.ts` | 基于 Cookie 的会话（`hermes_market_session`）、SHA-256 哈希不透明令牌、30 天过期。导出 `getCurrentUser()`、`requireCreator()`、`requireAdmin()`。 |
| `src/server/auth/magic-link.ts` | 魔法链接流程：Zod 邮箱验证、带 15 分钟过期的 `MagicLinkToken`、原子 `consumeMagicLink()` 事务创建会话。 |
| `src/app/api/auth/request-link/route.ts` | 表单 POST 处理程序调用 `requestMagicLink()`。 |
| `src/app/api/auth/consume/route.ts` | GET 处理程序调用 `consumeMagicLink(token)` 并重定向到 `/creator`。 |

**关键约束：**
- 会话存储为 `Session` 行，以 `tokenHash`（不透明 Cookie 值的 SHA-256）为键。
- 尚不存在中间件——项目中没有 `middleware.ts` 文件。
- 所有认证检查都是按路由的（在每个 API 路由或服务端组件内调用 `getCurrentUser()` / `requireCreator()` / `requireAdmin()`）。
- `User` 模型有 `email`（唯一）、`role`（USER/CREATOR/ADMIN）、`whitelistStatus`，无 `passwordHash` 字段。

### 授权表面

17 个文件调用 `getCurrentUser`、`requireCreator` 或 `requireAdmin`。它们都是直接导入 `@/server/auth/session` 的 API 路由处理程序或服务端组件。

### CONCERNS.md 中识别的缺口

- 任何 `/api/*` POST 路由无 CSRF 保护。
- 任何端点无速率限制。
- 无密码登录或 OAuth。
- 无登出功能。
- 角色更改时无会话撤销。

---

## 2. 多提供商认证架构

### 2.1 设计原则：提供商无关会话创建

所有认证提供商应汇聚到相同的会话创建路径。现有的 `createSession(userId)` 函数在 `session.ts` 中已经做了需要的一切：创建 `Session` 行、哈希令牌、设置 Cookie。每个新提供商只需：

1. **验证凭证**（密码哈希、OAuth 回调或魔法链接令牌）。
2. **解析或创建 `User` 行**。
3. **调用 `createSession(user.id)`**。

无需更改会话格式。现有会话继续工作。Cookie 名称、哈希方案和 `getCurrentSession()` 逻辑保持不变。

### 2.2 模式更改

```prisma
model User {
  id              String          @id @default(cuid())
  email           String          @unique
  passwordHash    String?         // 新增：null 表示仅魔法链接用户
  role            UserRole        @default(USER)
  whitelistStatus WhitelistStatus @default(NONE)
  emailVerified   Boolean         @default(false)  // 新增
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // ... 现有关系 ...

  oAuthAccounts   OAuthAccount[]  // 新增
}

model OAuthAccount {              // 新增模型
  id           String   @id @default(cuid())
  provider     String   // "google" | "github"
  providerAccountId String
  accessToken  String?  // 加密，用于 API 调用（如需要）
  refreshToken String?
  expiresAt    DateTime?
  scope        String?
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

**迁移安全性：** 由于无生产用户，`passwordHash` 可添加为可空。现有用户继续仅通过魔法链接认证。`emailVerified` 字段支持未来邮件验证流程。

### 2.3 提供商模块结构

```
src/server/auth/
  session.ts          （现有 — 公开 API 不变）
  magic-link.ts       （现有 — 公开 API 不变）
  password.ts         （新增）
  oauth.ts            （新增 — 共享 OAuth 工具）
  oauth-google.ts     （新增）
  oauth-github.ts     （新增）
  csrf.ts             （新增）
  rate-limit.ts       （新增）
```

### 2.4 密码登录流程

**数据流：**

```
用户提交邮箱 + 密码
  -> POST /api/auth/password/login
  -> validatePasswordLogin(email, password)
       |
       +-> 按邮箱查找 User
       +-> 比较密码与 passwordHash 中的 bcrypt 哈希
       +-> 如果未设置 passwordHash -> 错误"使用魔法链接登录"
       +-> 成功 -> createSession(user.id)
       |
       -> 重定向到 /creator（或为 API 客户端返回 JSON）
```

**注册流程（用于新用户或链接密码到现有用户）：**

```
用户提交邮箱 + 密码 + 确认密码
  -> POST /api/auth/password/register
  -> registerPassword(email, password)
       |
       +-> 验证密码强度（最少 8 个字符，混合要求）
       +-> 用 bcrypt（成本因子 12）哈希
       +-> Upsert User：设置 passwordHash
       +-> 设置 emailVerified = false（可选验证邮件）
       +-> createSession(user.id)
```

**实现注意事项：**
- 使用 `bcryptjs`（纯 JS，无原生依赖）或 `bcrypt`（原生，更快）。
- 限制登录尝试为每邮箱每分钟 5 次（见第 3 节）。
- 密码重置流程可使用现有魔法链接机制：生成短期令牌、邮件重置链接、让用户设置新密码。

### 2.5 Google OAuth 流程

**数据流：**

```
用户点击"使用 Google 登录"
  -> GET /api/auth/oauth/google
       -> 生成 PKCE code_verifier + code_challenge（S256）
       -> 在短期 httpOnly Cookie（10 分钟）中存储 code_verifier
       -> 重定向到 Google 授权 URL
          （scope: openid email profile）
       |
       v
Google 带授权码重定向
  -> GET /api/auth/oauth/google/callback?code=...&state=...
       -> 验证 state（OAuth 的 CSRF 保护）
       -> 从 Cookie 读取 code_verifier
       -> 用 code + code_verifier 在 Google token 端点交换
       -> 解码 ID 令牌（JWT）获取 Google 用户信息（sub、email）
       -> 查找或创建 User + OAuthAccount
       -> createSession(user.id)
       -> 清除 code_verifier Cookie，设置会话 Cookie
       -> 重定向到 /creator
```

**所需环境变量：**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

**为什么使用 PKCE 而不是 URL 中的 client_secret：** PKCE 是现代 OAuth 2.0 最佳实践。它避免了在浏览器 URL 中暴露 client_secret，适用于机密和公开客户端。存储在 httpOnly Cookie 中的 `code_verifier` 确保只有发起请求的同一浏览器可以交换授权码。

### 2.6 GitHub OAuth 流程

GitHub 不支持 OAuth apps 的 PKCE，因此流程使用更简单的 `state` 参数进行 CSRF 保护：

```
用户点击"使用 GitHub 登录"
  -> GET /api/auth/oauth/github
       -> 生成随机 state 令牌
       -> 在短期 httpOnly Cookie（10 分钟）中存储 state
       -> 重定向到 GitHub 授权 URL
          （scope: read:user user:email）
       |
       v
GitHub 重定向
  -> GET /api/auth/oauth/github/callback?code=...&state=...
       -> 验证 state 与 Cookie 匹配
       -> 用 code + client_secret 在 GitHub 交换 access token
       -> GET https://api.github.com/user（带 access token）
       -> GET https://api.github.com/user/emails（获取主要邮箱）
       -> 查找或创建 User + OAuthAccount
       -> createSession(user.id)
       -> 清除 state Cookie，设置会话 Cookie
       -> 重定向到 /creator
```

**所需环境变量：**
```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### 2.7 账户链接

当 OAuth 登录找到具有相同邮箱的现有用户时：
- 如果该提供商的 `OAuthAccount` 不存在：创建一个并链接。
- 如果该提供商的 `OAuthAccount` 已存在但 `providerAccountId` 不同：拒绝并报错"账户已链接到不同的 GitHub/Google 账户。"

当密码注册找到现有用户（通过魔法链接）时：
- 在现有用户上设置 `passwordHash`。用户现在可以用任一方法登录。

### 2.8 登出

新端点 `POST /api/auth/logout`：
1. 读取会话 Cookie。
2. 从数据库删除 `Session` 行。
3. 清除 `hermes_market_session` Cookie（设置 `maxAge: 0`）。

这填补了 CONCERNS.md 第 6.1 节中识别的缺口。

---

## 3. CSRF 保护架构

### 3.1 问题

Next.js 服务端动作通过 Origin 头有内置 CSRF 保护。API 路由处理程序（`/api/*`）没有。项目有 8+ 个 `/api/` 下的 POST 端点接受表单提交并执行状态变更操作：

- `POST /api/auth/request-link`
- `POST /api/orders/[id]/cancel`
- `POST /api/orders/[id]/pay`
- `POST /api/orders/[id]/complete`
- `POST /api/orders/[id]/dispute`
- `POST /api/orders/[id]/deliveries`
- `POST /api/creator/agents`
- `POST /api/consultations`

所有都存在 CSRF 漏洞：恶意站点可以提交表单 POST 到这些端点，浏览器将自动包含会话 Cookie。

### 3.2 建议方法：同步令牌模式

**为什么不使用 Origin 头检查？** Origin 检查适用于基于 fetch 的请求，但不覆盖所有浏览器（一些在同源重定向时剥离 Origin）。同步令牌模式更健壮。

**为什么不迁移一切到服务端动作？** 那是更大的重构。令牌方法可以增量应用到现有 API 路由。

**实现：**

```typescript
// src/server/auth/csrf.ts

import crypto from "node:crypto";
import { cookies } from "next/headers";

const CSRF_COOKIE = "hermes_csrf_token";
const CSRF_TOKEN_BYTES = 32;

export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
}

export function getCsrfSecretFromCookie(): string | null {
  // 从 httpOnly Cookie 读取 CSRF 密钥
}

export function createCsrfTokenPair(): { cookieValue: string; formToken: string } {
  // 生成密钥，存储在 httpOnly Cookie
  // 派生公开令牌：HMAC(secret, session-specific-data)
  // 返回两者
}

export function validateCsrfToken(formToken: string, cookieSecret: string): boolean {
  // 验证：HMAC(cookieSecret, ...) === formToken
  // 使用恒定时间比较
}
```

**流程：**

1. **令牌发放：** 任何渲染表单的服务端组件或 API 路由包含隐藏 `<input name="_csrf" value="...">`。对应密钥存储在 httpOnly `hermes_csrf_token` Cookie 中。

2. **令牌验证：** CSRF 中间件（见第 3.3 节）为每个 POST/PUT/DELETE 到 `/api/*` 验证 `_csrf` 表单字段与 Cookie 密钥。

3. **跳过条件：** 以下端点免于 CSRF：
   - `POST /api/payments/webhook` — 由 Stripe 签名验证。
   - `POST /api/auth/request-link` — 不需要认证会话。
   - `POST /api/auth/password/login` — 不需要认证会话。
   - `POST /api/auth/password/register` — 不需要认证会话。
   - OAuth 回调路由 — 由 state/PKCE 参数验证。

### 3.3 CSRF 中间件位置

**建议：Next.js 中间件（项目根目录的 `middleware.ts`）**

Next.js 15 支持项目根目录的 `middleware.ts`（或 `.js`）文件，在路由处理程序之前在 Edge Runtime 上运行。这是 CSRF 的正确层，因为：

1. 在任何数据库查询运行之前拦截所有匹配请求。
2. 避免在每个路由中重复 CSRF 检查。
3. 可以用 403 响应短路。

```typescript
// middleware.ts（示意）

import { NextRequest, NextResponse } from "next/server";

const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/payments/webhook",
  "/api/auth/request-link",
  "/api/auth/password/login",
  "/api/auth/password/register",
  "/api/auth/oauth/google",
  "/api/auth/oauth/github",
  "/api/auth/logout",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF 检查
  if (CSRF_PROTECTED_METHODS.has(request.method) && !CSRF_EXEMPT_PATHS.has(pathname)) {
    const cookieSecret = request.cookies.get("hermes_csrf_token")?.value;
    const formToken = /* 从表单 body 或头读取 */;

    if (!cookieSecret || !formToken || !validateCsrfToken(formToken, cookieSecret)) {
      return new NextResponse("CSRF token mismatch", { status: 403 });
    }
  }

  // 速率限制（见第 4 节）
  // ...

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],  // 仅在 API 路由上运行
};
```

**Edge Runtime 注意事项：** CSRF 验证函数使用 `crypto.createHmac`，可通过 `crypto.subtle` 在 Edge Runtime 获得。实现应使用 Web Crypto API（`crypto.subtle.sign`）而非 Node.js `crypto` 以兼容 Next.js 中间件。

### 3.4 替代方案：双提交 Cookie

更简单的同步令牌变体：
1. 设置带随机令牌的非 httpOnly Cookie。
2. 页面上的 JavaScript 读取 Cookie 并作为头或表单字段包含。
3. 中间件检查 Cookie 值和提交值匹配。

这更简单，但如果存在子域漏洞则更弱。首选基于 HMAC 的同步令牌模式。

---

## 4. 速率限制架构

### 4.1 需求

以下端点需要速率限制：

| 端点 | 限制 | 键 |
|------|------|-----|
| `POST /api/auth/request-link` | 每邮箱每小时 5 次，每 IP 每小时 20 次 | 邮箱、IP |
| `POST /api/auth/password/login` | 每邮箱每 15 分钟 5 次，每 IP 每小时 20 次 | 邮箱、IP |
| `POST /api/auth/password/register` | 每 IP 每小时 3 次 | IP |
| `GET /api/auth/oauth/google` | 每 IP 每分钟 10 次 | IP |
| `GET /api/auth/oauth/github` | 每 IP 每分钟 10 次 | IP |
| `POST /api/consultations` | 每用户每小时 5 次（或每 IP） | 用户 ID 或 IP |
| `POST /api/creator/agents` | 每用户每小时 10 次 | 用户 ID |
| `POST /api/orders/[id]/deliveries` | 每用户每小时 20 次 | 用户 ID |
| `POST /api/payments/webhook` | 每 IP 每分钟 100 次 | IP |
| 一般 `/api/*` | 每 IP 每分钟 100 次 | IP |

### 4.2 内存 vs Redis

**建议：从内存开始，计划使用 Redis。**

对于当前阶段（本地开发，无生产用户），内存滑动窗口计数器足够：

```typescript
// src/server/auth/rate-limit.ts（示意）

type RateLimitEntry = { count: number; windowStart: number };
const store = new Map<string, RateLimitEntry>();

// 每 5 分钟定期清理
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > CLEANUP_THRESHOLD) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  // 滑动窗口实现
}
```

**迁移到 Redis 的路径：** `checkRateLimit` 函数签名保持不变。将 `Map` 交换为 `ioredis` 和 `INCR` + `EXPIRE`。无需更改中间件。

**为什么不全在中间件中？** Next.js 中间件在 Edge Runtime 上运行，无法访问 Node.js `Map` 或 Redis。速率限制有两个自然归宿：

1. **按路由（在路由处理程序中）：** 用于按用户 ID 或邮箱限速（需要读取请求 body 或会话）。这是认证端点和用户特定限制的方法。
2. **中间件（仅基于 IP）：** 用于不需要读取 body 的一般基于 IP 的速率限制。中间件可以使用轻量级内存存储，在每次部署时重置（对基于 IP 的一般限制可接受）。

**建议混合：**
- 中间件：所有 `/api/*` 路由的一般基于 IP 的速率限制（每分钟 100 请求）。
- 按路由：按邮箱（认证）或用户 ID（创作者操作）的特定速率限制，实现为在每个路由处理程序顶部调用的共享工具。

### 4.3 中间件集成

```typescript
// middleware.ts（扩展示意）

import { NextRequest, NextResponse } from "next/server";

// 中间件中用于基于 IP 速率限制的内存存储
// 注意：每次部署重置。可接受用于一般 IP 限制。
const ipRateStore = new Map<string, { count: number; windowStart: number }>();
const IP_RATE_LIMIT = 100;     // 每个窗口的请求数
const IP_RATE_WINDOW = 60_000; // 1 分钟

function checkIpRateLimit(ip: string): boolean {
  // 滑动窗口检查针对 ipRateStore
  // 允许则返回 true
}

export function middleware(request: NextRequest) {
  // 所有 API 路由的基于 IP 速率限制
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";

    if (!checkIpRateLimit(ip)) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: { "Retry-After": "60" }
      });
    }
  }

  // CSRF 检查（来自第 3.3 节）
  // ...

  return NextResponse.next();
}
```

### 4.4 按路由速率限制工具

```typescript
// 在路由处理程序中使用

import { checkRateLimit } from "@/server/auth/rate-limit";

export async function POST(request: Request) {
  // 认证特定速率限制（基于邮箱）
  const email = formData.get("email");
  const { allowed } = checkRateLimit(`auth:login:${email}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return Response.json({ errors: ["Too many attempts. Try again later."] }, { status: 429 });
  }
  // ... 处理程序其余部分
}
```

---

## 5. 数据完整性改进

### 5.1 订单/退款操作的事务模式

**问题（来自 CONCERNS.md 2.1）：** `src/app/admin/actions.ts` 中的 `refundDisputedOrder` 调用 `requestRefund()` 然后 `resolveLatestOpenDisputeForOrder()` 无事务。如果第二次调用失败，退款已发放但争议保持开放。

**模式：包装在 `$transaction` 中**

```typescript
await prisma.$transaction(async (tx) => {
  await requestRefund({ ... }, tx);       // 传递 tx 作为存储
  await resolveLatestOpenDisputeForOrder({ ... }, tx);
});
```

这要求两个服务函数接受可选事务客户端（它们已经通过 `store` 依赖注入模式执行）。

**问题（来自 CONCERNS.md 2.2）：** 支付账本 `recordPaymentEvent` 在 `findUnique` 和 `create` 之间有 TOCTOU 竞态。

**模式：捕获唯一约束冲突（P2002）**

```typescript
try {
  return await prisma.paymentLedger.create({ data: ... });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { duplicate: true };
  }
  throw error;
