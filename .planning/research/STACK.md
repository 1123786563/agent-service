# 认证扩展与安全加固技术栈 — 2025 年推荐

## 背景

Hermes Agent Marketplace 使用 Next.js 15 App Router 与 React 19、Prisma 5、PostgreSQL、Stripe 和 S3 兼容存储运行。认证目前是自定义魔法链接系统，带基于 Cookie 的会话（`hermes_market_session` Cookie、不透明令牌、`Session` 表中的 SHA-256 哈希）。项目无中间件（`middleware.ts` 不存在）、无 CSRF 保护、无速率限制。

本里程碑添加：密码登录、Google OAuth、GitHub OAuth、CSRF 保护、速率限制和生产加固——所有与现有魔法链接流程并存。

---

## 1. 认证框架：扩展自定义认证

### 建议：不采用 Auth.js / NextAuth

**使用现有自定义认证系统并扩展它。** Auth.js（原 NextAuth）v5 是绿地 Next.js 认证的主流选择，但本项目有特定原因避免它：

| 因素 | Auth.js v5 | 自定义（扩展现有） |
|------|-------------|-----------------|
| 迁移成本 | 替换会话管理、Cookie 处理、用户 Upsert、魔法链接、管理员检查；重写 13+ API 路由中所有 `getCurrentSession`/`requireCreator`/`requireAdmin` 调用 | 在现有基础上添加新认证方法 |
| 现有会话模式 | Auth.js 期望自己的 `Adapter` 模式；当前 `Session` 表（cuid ID、tokenHash、userId、expiresAt）不匹配 | 按原样重用 |
| 会话令牌控制 | 抽象；不透明 Cookie 令牌内部管理 | 完全控制（已有带 SHA-256 哈希、时序安全 Cookie 写入、事务回滚的不透明令牌） |
| 魔法链接共存 | 可能通过 `CredentialsProvider` 实现，但尴尬——魔法链接不是 Auth.js 一等公民 | 已经完美工作 |
| OAuth 提供商设置 | 一等，但仅需每个提供商 3 个 API 路由（Google、GitHub）trivial to replicate | 每个提供商使用标准 OAuth 2.0 流程约 150 行 |
| Bundle 大小 | `next-auth` 为服务端包增加约 150KB（JWT/JWS/JWE 依赖即使使用数据库会话） | 零额外框架负担 |
| Next.js 15 兼容性 | 与 App Router 工作但在服务端动作、路由处理程序和中间件集成方面有粗糙边缘；RC 周期中持续破坏性更改 | 无外部框架耦合 |
| 中文本地化错误 UX | 必须覆盖 Auth.js 错误页面/回调 | 已有带中文消息的 `AuthFlowError` |

**现有自定义认证设计良好。** `src/server/auth/session.ts` 和 `src/server/auth/magic-link.ts` 中的代码干净：不透明令牌、SHA-256 哈希、带回滚的 Prisma 事务、正确的 Cookie 安全（httpOnly、sameSite、production 中 secure）。用 Auth.js 替换是重写而非增强。

### 构建内容

扩展 `src/server/auth/` 模块，添加三个新文件遵循已建立模式：

```
src/server/auth/
  magic-link.ts    （现有 — 保持不变）
  session.ts       （现有 — 保持不变，添加小帮助函数）
  password.ts      （新增 — 注册、登录、密码哈希）
  oauth.ts         （新增 — Google 和 GitHub 的 OAuth 2.0 流程）
```

添加对应 API 路由：

```
src/app/api/auth/
  request-link/route.ts    （现有）
  consume/route.ts          （现有）
  register/route.ts         （新增 — POST 邮箱+密码注册）
  login/route.ts            （新增 — POST 邮箱+密码登录）
  google/callback/route.ts  （新增 — OAuth 回调）
  github/callback/route.ts  （新增 — OAuth 回调）
```

所有方法汇聚到 `session.ts` 中相同的 `createSession()` 调用，因此无论认证方法如何，会话 Cookie 行为相同。

---

## 2. 密码哈希：`argon2`

### 建议：`argon2` v0.41+（通过 `@node-rs/argon2`）

| 包 | 版本 | 算法 | 为什么 |
|------|------|------|------|
| `@node-rs/argon2` | ^2.0.0 | Argon2id | 2015 年密码哈希竞赛获胜者。内存硬，抗 GPU/ASIC 攻击。通过 NAPI-RS 的原生 Rust 绑定——现代 Node.js 无编译问题 |

**为什么选 Argon2id 而非 bcrypt：**
- bcrypt 有 72 字节密码限制，抗 GPU 攻击不如 Argon2id 有效
- Argon2id 是 OWASP 为新系统推荐算法（2024 年指导）
- `@node-rs/argon2` 为所有平台提供预构建二进制（Linux x64/ARM、macOS、Windows）通过 NAPI-RS——无 node-gyp，无构建步骤
- `node:crypto.scrypt` 替代方案存在，但 Argon2id 是更强选择且同样易于使用

**为什么不用 `bcryptjs`：**
- 纯 JavaScript 实现，比原生替代方案显著慢
- 虽然传统上密码哈希慢是期望的，但 bcryptjs 在错误维度慢（CPU）而内存轻（易于在 GPU 上并行化）
- Argon2id 的内存硬度是正确现代权衡

**使用模式：**
```typescript
import { hash, verify } from "@node-rs/argon2";

const HASH_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP 推荐
const hash = await hash(password, HASH_OPTIONS);
const valid = await verify(hash, password);
```

### 模式添加

添加到 `User` 模型：
```prisma
model User {
  // ...现有字段...
  passwordHash  String?   // null 表示仅魔法链接或仅 OAuth 用户
  emailVerified Boolean   @default(false)
}
```

`passwordHash` 可空以支持通过魔法链接或 OAuth 注册但未设置密码的用户。

---

## 3. OAuth：Google 和 GitHub 通过 `arctic`

### 建议：`arctic` ^3.0.0

| 包 | 版本 | 用途 |
|------|------|------|
| `arctic` | ^3.0.0 | 主要提供商的轻量级 OAuth 2.0 / OpenID Connect 客户端 |

**为什么选 `arctic` 而非自建或 Auth.js：**
- Arctic 是 Lucia Auth 生态系统中专门构建的 OAuth 客户端库（现独立维护）。它处理 20+ 提供商的 PKCE 流程、state 参数生成、令牌交换和声明解析
- 对会话或 Cookie 无意见——仅处理 OAuth 舞蹈。完美适配我们的自定义会话系统
- 约 15KB，无框架耦合
- 支持我们需要的确切提供商（Google、GitHub）带类型安全 API
- 活跃维护，兼容 Node.js 22+ 和 Next.js 15

**为什么不用 `next-auth`/Auth.js 仅用于 OAuth：**
- 需要将会话、Cookie 和用户管理迁移到 Auth.js 约定
- OAuth 流程每个提供商 3 个 API 路由——用 Arctic 约 100 行trivial代码
- Auth.js 带来我们不需要的 150KB+ JWT/JWS 依赖（我们使用数据库会话）

**为什么不用原始 `fetch`-based OAuth：**
- Arctic 处理边缘情况：PKCE code verifier 生成、state 参数 CSRF 保护、正确 `application/x-www-form-urlencoded` 令牌交换、ID 令牌验证
- 这些容易出错且安全关键；Arctic 每个提供商约 50 行正确处理

### 模式添加

```prisma
model OAuthAccount {
  id           String   @id @default(cuid())
  provider     String   // "google" | "github"
  providerAccountId String
  accessToken  String?  // 静态加密；如果不需要持续 API 访问则可选
  refreshToken String?
  expiresAt    DateTime?
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

添加到 User：
```prisma
model User {
  // ...现有...
  oauthAccounts OAuthAccount[]
}
```

### Arctic 的 OAuth 流程

```
1. 用户点击"使用 Google 登录"
   GET /api/auth/google -> 生成 state + codeVerifier，存储在 Cookie，重定向到 Google
2. Google 重定向
   GET /api/auth/google/callback?code=...&state=...
   -> 验证 state，交换 code 为令牌，获取 userinfo
   -> upsert User + OAuthAccount
   -> createSession()（重用现有）
   -> 重定向到 /creator
3. GitHub：相同模式，不同 Arctic 提供商
```

---

## 4. CSRF 保护：通过中间件的双提交 Cookie

### 建议：自定义中间件 — 无需库

**为什么不用 CSRF 库：**
- Next.js 15 App Router Route Handlers 通过 POST 接收 `FormData` 时，通过浏览器 Same-Origin Policy 自然受保护
- 实际 CSRF 风险适用于 JSON `Content-Type` API 请求（攻击者可通过 `fetch` 跨域发送）。项目当前 POST 路由使用 `FormData`（魔法链接请求）或服务端动作
- 标准 Next.js 防御是：在中间件验证所有变异请求的 `Origin` / `Sec-Fetch-Site` 头

**实施：创建 `src/middleware.ts`**

这是单一最有影响力的安全添加。中间件应：

1. **验证所有 POST/PUT/PATCH/DELETE 请求的 Origin 头** 到 `/api/*`
   - 比较 `Origin` 或 `Referer` 头与应用已知 Origin
   - 拒绝 `Origin` 不匹配的请求（阻止跨域表单提交和 fetch）
   - 豁免：Stripe webhook（`/api/payments/webhook`）——Stripe 发送自己的签名验证
   - 豁免：开发支付路由——已在 `NODE_ENV` 守卫后面

2. **无需 CSRF 令牌生成** — `sameSite: "lax"` Cookie + Origin 验证组合是 OWASP 推荐和 Next.js 本身使用的现代标准

**为什么不使用 `csrf-csrf` / `csurf`：**
- `csurf` 已弃用并放弃
- `csrf-csrf`（双提交 Cookie 库）维护良好但在 Origin 验证实现相同安全属性时增加了不必要的复杂性
- 双提交 Cookie 模式对于现代浏览器严格弱于 Origin 验证（两者都依赖同源强制，但 Origin 更简单）

### 关键 Next.js 15 中间件细节

Next.js 15 中间件默认在 Edge Runtime 上运行。Cookie 读/写通过 `NextRequest`/`NextResponse` 工作。Origin 头检查是简单字符串比较——无需 Node.js API。

---

## 5. 速率限制：`@upstash/ratelimit`

### 建议：`@upstash/ratelimit` ^2.0.0 + `@upstash/redis` ^1.34.0

| 包 | 版本 | 用途 |
|------|------|------|
| `@upstash/ratelimit` | ^2.0.0 | 令牌桶/滑动窗口速率限制 |
| `@upstash/redis` | ^1.34.0 | 基于 HTTP 的 Redis 客户端（Edge Runtime 可用） |

**为什么选 Upstash：**
- 基于 HTTP 的 Redis 客户端——适用于 Next.js Edge Runtime、Serverless 函数和标准 Node.js
- 无需持久 TCP 连接；完美适配 serverless/edge 部署
- 免费额度：每天 10,000 命令，对于认证速率限制绰绰有余
- `@upstash/ratelimit` 开箱即提供滑动窗口、固定窗口和令牌桶算法
- 库约 5KB，零依赖

**速率限制配置：**

| 端点 | 限制 | 理由 |
|------|------|------|
| `POST /api/auth/request-link` | 每邮箱每小时 5 次，每 IP 每小时 20 次 | 防止魔法链接垃圾 |
| `POST /api/auth/register` | 每 IP 每小时 5 次 | 防止批量账户创建 |
| `POST /api/auth/login` | 每邮箱每 15 分钟 10 次，每 IP 每小时 20 次 | 防止凭证填充 |
| `GET /api/auth/google/callback` | 每 IP 每分钟 10 次 | 防止 OAuth 滥用 |
| `GET /api/auth/github/callback` | 每 IP 每分钟 10 次 | 防止 OAuth 滥用 |
| `POST /api/consultations` | 每用户每小时 10 次 | 防止咨询垃圾 |
| `POST /api/creator/agents` | 每用户每小时 10 次 | 防止上传滥用 |
| `POST /api/payments/webhook` | 每分钟每个 Stripe 签名 100 次 | 保护 webhook 处理 |
| 所有其他 `/api/*` POST | 每 IP 每分钟 30 次 | 一般滥用保护 |

**为什么不用 `express-rate-limit` / 自定义内存：**
- `express-rate-limit` 不兼容 Next.js 中间件（Edge Runtime）
- 内存存储在 serverless 函数调用间不持久
- 无需完整 Redis 服务器——Upstash HTTP API 为此目的构建

**开发回退：**

对于无 Upstash 的本地开发，实现内存 `Map`-based 速率限制器遵循相同接口：

```typescript
// src/server/rate-limit.ts
const isDev = process.env.NODE_ENV !== "production";

export function getRateLimiter(limit: number, window: string) {
  if (isDev) return new InMemoryRateLimiter(limit, window);
  return new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(limit, window) });
}
```

**为什么不用 `rate-limiter-flexible`：**
- 需要持久 Redis 或 MongoDB 连接（基于 TCP）
- 不兼容 Edge Runtime
- 对于本质上是带 TTL 的计数器来说依赖过重

---

## 6. 会话安全增强

### 当前状态（保持）
- `httpOnly: true` — 好
- `sameSite: "lax"` — 好
- `secure: true` 生产环境 — 好
- 不透明令牌（非 JWT）— 好
- 数据库中的 SHA-256 令牌哈希 — 好
- 30 天过期 — 合理

### 添加

1. **权限升级时会话轮换**：当用户从 `USER` 角色转到 `CREATOR` 角色（白名单批准）时，轮换会话令牌。这防止用户之前未认证或具有不同角色时的会话固定。

2. **在 Session 模型添加 `lastActiveAt`**（可选）：追踪活动以清理陈旧会话。发布不阻塞。

3. **无需 JWT**：当前不透明令牌 + 数据库查找方法对此应用正确。每次认证请求已经查询数据库进行授权检查（角色、白名单状态）；JWT 会为无延迟收益增加复杂性（撤销、密钥管理）。

---

## 7. 生产环境验证

### 建议：自定义启动验证模块

创建 `src/server/config.ts` 在应用启动时验证所有必需环境变量：

```typescript
// 如果生产配置缺少则快速失败
const required = [
  "DATABASE_URL",
  "DOWNLOAD_TICKET_SECRET",
  "DOWNLOAD_TICKET_ACTIVE_KEY_ID",
  // ...支付/存储提供商的按条件检查
];
```

在 `src/instrumentation.ts` 中的模块导入时间运行（Next.js 15 原生支持）。

**为什么不使用 `@t3-oss/env-nextjs`：**
- 添加 `@t3-oss/env-core` + `zod` 依赖（我们已有 zod，但包装很薄）
- 我们的需求简单：在启动时检查环境变量存在
- 30 行模块比引入框架依赖进行验证更清晰

---

## 8. 额外安全库

### Helmet 等效：通过中间件的自定义安全头

Next.js 不使用 Express，所以 `helmet` 不适用。改为在 `next.config.mjs` 中添加安全头：

```javascript
const nextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // Content-Security-Policy：OAuth URL 确定后设置
      ]
    }];
  }
};
```

### 生产邮件：Resend

| 包 | 版本 | 用途 |
|------|------|------|
| `resend` | ^4.0.0 | 生产邮件传递（魔法链接、邮箱验证） |

**为什么选 Resend：**
- 现代 API、优秀开发者体验、慷慨免费额度（每天 100 封邮件）
- 为 Next.js 构建（React Email 模板）
- 比 SendGrid 或 AWS SES 更简单的 API
- 现有开发邮件器适配器模式使这成为干净交换

---

## 9. 不使用什么

| 库/方法 | 为什么不用 |
|---------|----------|
| **Auth.js / NextAuth v5** | 需要重写会话管理、魔法链接流程和所有认证帮助。自定义系统设计良好；Auth.js 为三个提供商需求增加复杂性无比例收益 |
| **Passport.js** | Express 中间件；不兼容 Next.js App Router Route Handlers |
| **bcrypt / bcryptjs** | 对新系统劣于 Argon2id。bcrypt 的 72 字节限制和仅 CPU 硬度是缺点 |
| **csurf / csrf-csrf** | csurf 已弃用。csrf-csrf 在 Origin 验证实现相同保护时增加复杂性 |
| **express-rate-limit** | 需要 Express；不兼容 Next.js 中间件（Edge Runtime） |
| **基于 JWT 的会话** | 增加撤销复杂性。我们的数据库支持会话已经每次认证请求查询进行授权；JWT 会为无延迟收益增加密钥轮换和撤销列表 |
| **Supabase Auth / Clerk / Firebase Auth** | 托管认证服务将替换整个会话系统。当我们需要向现有自定义系统添加 3 种认证方法时，这是杀鸡用牛刀 |
| **Lucia Auth** | 2024 年弃用。Arctic（其 OAuth 组件）独立存活，这是我们使用的 |

---

## 10. 新依赖摘要

| 包 | 版本 | 大小（gzip） | 用途 |
|------|------|-------------|------|
| `@node-rs/argon2` | ^2.0.0 | 约 200KB 原生 | 密码哈希（Argon2id） |
| `arctic` | ^3.0.0 | 约 15KB | OAuth 2.0 客户端（Google、GitHub） |
| `@upstash/ratelimit` | ^2.0.0 | 约 5KB | 速率限制 |
| `@upstash/redis` | ^1.34.0 | 约 15KB | 用于速率限制的基于 HTTP 的 Redis |
| `resend` | ^4.0.0 | 约 20KB | 生产邮件传递 |

**新增生产依赖总计：5 个包，约 255KB**

---

## 11. 实施顺序

顺序重要因为组件间有依赖：

1. **中间件（`src/middleware.ts`）** — Origin 验证 + 安全头。一切的基础。
2. **密码认证** — `@node-rs/argon2` + `src/server/auth/password.ts` + 注册/登录路由。模式迁移：User 添加 `passwordHash`、`emailVerified`。
3. **OAuth（Google + GitHub）** — `arctic` + `src/server/auth/oauth.ts` + 回调路由。模式迁移：添加 `OAuthAccount` 模型。
4. **速率限制** — `@upstash/ratelimit` + `src/server/rate-limit.ts`。应用到所有认证端点和变更路由。
5. **生产邮件** — `resend` + 适配器遵循现有 `dev-mailer.ts` 模式。
6. **环境验证** — `src/server/config.ts` + `src/instrumentation.ts`。

步骤 2 和 3 可并行因为无共享代码。步骤 1 和 4 都触及中间件应顺序进行。

---

## 12. 模式更改摘要

```prisma
// User 模型添加
model User {
  // ...现有字段...
  passwordHash   String?           // Argon2id 哈希；null = 未设置密码
  emailVerified  Boolean @default(false)
  oauthAccounts  OAuthAccount[]
}

// 新模型
model OAuthAccount {
  id                String   @id @default(cuid())
  provider          String   // "google" | "github"
  providerAccountId String
  userId            String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

`Session`、`MagicLinkToken` 或任何其他现有模型无更改。`OAuthAccount` 模型是加性的。

---

*最后更新：2026-05-05 — 认证扩展里程碑技术栈研究*
