# 认证与安全功能 — Hermes Agent Marketplace

安全加固里程碑的功能分析。按必要性（门槛、差异化、反功能）对功能进行分类，包含复杂性估计、依赖关系和基于当前代码库的实施说明。

---

## 当前状态

平台目前有：
- **仅魔法链接认证** — 通过 `src/server/auth/magic-link.ts` 的基于邮箱的无密码登录
- **自定义会话管理** — 通过 `src/server/auth/session.ts` 的基于 Cookie 的会话存储在 PostgreSQL 中，带 SHA-256 哈希令牌、30 天过期、httpOnly + sameSite=lax Cookie
- **三层授权** — `getCurrentUser()`（任何认证）、`requireCreator()`（白名单检查）、`requireAdmin()`（邮箱白名单）
- **无中间件层** — 不存在 `src/middleware.ts`；所有认证检查都是按路由内联的
- **无 CSRF 保护** — API 路由无保护；服务端动作通过 Next.js Origin 头检查获得保护
- **无速率限制** — 任何地方都无请求节流
- **无密码/OAuth** — 仅单一认证方法
- **13 个 API 路由** — 6 个 POST 变更（request-link、agents、consultations、cancel、complete、dispute、deliveries）、3 个 GET 操作（consume、dev/complete、download）、1 个 webhook、加上 pay 重定向
- **User 模型** — 有 `email`（唯一）、`role`（USER/CREATOR/ADMIN）、`whitelistStatus`（NONE/INVITED/ACTIVE）；无密码哈希、无 OAuth 提供商字段

---

## 功能目录

### 类别 1：门槛 — 必须有

这些对于处理金钱和用户数据的任何生产市场都是不可协商的。没有它们，平台无法安全部署。

---

#### T1. 将开发支付路由置于环境和认证检查之后

| 属性 | 详情 |
|------|------|
| **严重性** | 高（来自 CONCERNS.md 1.1） |
| **复杂性** | 低 |
| **文件** | `src/app/api/payments/dev/complete/route.ts` |
| **描述** | `GET /api/payments/dev/complete` 端点接受任何未认证请求并标记订单已支付。至少用 `NODE_ENV !== "production"` 检查保护它，最好也用 `requireAdmin()`。 |
| **依赖** | 无 — 独立修复 |
| **实施** | 在处理程序顶部添加环境检查；可选调用 `requireAdmin()`。3-5 行。 |

---

#### T2. 为咨询创建端点添加认证

| 属性 | 详情 |
|------|------|
| **严重性** | 高（来自 CONCERNS.md 1.2） |
| **复杂性** | 低 |
| **文件** | `src/app/api/consultations/route.ts` |
| **描述** | `POST /api/consultations` 接受未认证请求，允许用任意邮箱垃圾创建咨询。添加 `getCurrentUser()` 检查；要求认证以创建咨询。 |
| **依赖** | 无 — 独立修复 |
| **实施** | 添加 `getCurrentUser()` 调用，如果为 null 则返回 401。可能需要更新咨询服务以使用认证用户的邮箱而非接受表单数据的任意邮箱。 |

---

#### T3. 为所有 /api/* POST 路由添加 CSRF 保护

| 属性 | 详情 |
|------|------|
| **严重性** | 中（来自 CONCERNS.md 1.3） |
| **复杂性** | 中 |
| **文件** | 所有 6+ 个 POST API 路由、新中间件或工具 |
| **描述** | CSRF 令牌不存在。所有接受表单提交的 `/api/*` POST 端点都存在漏洞：request-link、订单 cancel/complete/dispute、agent 上传、交付上传。Next.js 服务端动作有内置 Origin 检查，但 API 路由没有。 |
| **依赖** | 无，但与速率限制（T5）和中间件（T7）交叉 |
| **实施方法** |
| **选项 A：Origin/Referer 头验证**（建议） | 添加共享函数，在所有变异 API 路由上验证 `Origin` 或 `Referer` 头匹配 `APP_URL`。无状态，无令牌管理。Next.js 服务端动作已经这样做。 |
| **选项 B：双提交 Cookie 模式** | 生成 CSRF 令牌，设置为 Cookie，要求作为隐藏表单字段。无状态更简单；需要更改所有表单和路由处理程序。 |
| **选项 C：将表单 POST 迁移到服务端动作** | 完全消除问题，因为服务端动作有内置 CSRF。更大的重构，但在根源上解决。 |
| **建议** | 从选项 A 开始（共享 `validateCsrf()` 工具在每个 POST 路由调用 Origin 头检查）。这是最轻量级修复。选项 C 是好的后续重构。 |

---

#### T4. 速率限制中间件

| 属性 | 详情 |
|------|------|
| **严重性** | 中（来自 CONCERNS.md 1.4） |
| **复杂性** | 中 |
| **文件** | 新 `src/middleware.ts` 或路由级包装器 |
| **描述** | 任何端点都无速率限制。关键目标：认证（魔法链接垃圾、邮箱枚举）、咨询创建、文件上传、支付 webhook。 |
| **关键速率限制层级** |
| - 认证端点（request-link、consume） | 每 IP 每分钟 5 次，每邮箱每小时 10 次 |
| - 咨询创建 | 每认证用户每分钟 10 次 |
| - 文件上传（agents、deliveries） | 每创作者每小时 20 次 |
| - 支付 webhook | 每 IP 每分钟 100 次（Stripe 重试不应被阻止） |
| - 一般 API | 每 IP 每分钟 100 次 |
| **依赖** | 需要计数器存储后端（Redis、数据库表或滑动窗口内存）。对于单实例部署，内存可接受。 |
| **实施** |
| **选项 A：Next.js 中间件**（`src/middleware.ts`） | 在 Edge Runtime 上运行。无法直接访问 Prisma。需要外部存储（Upstash Redis 或轻量级 API）。适合基于 IP 的限制。 |
| **选项 B：路由级包装函数** | 每个路由处理程序调用 `checkRateLimit(key, limit, window)` 函数，使用内存滑动窗口或数据库表。更细粒度控制，与现有基础设施配合。 |
| **建议** | 当前使用选项 B（内存速率限制器用于单实例部署，无生产用户）。定义 `RateLimitStore` 接口以便将来可交换为 Redis。按路由应用为包装函数。 |

---

#### T5. 交付上传的文件大小验证

| 属性 | 详情 |
|------|------|
| **严重性** | 中（来自 CONCERNS.md 1.5） |
| **复杂性** | 低 |
| **文件** | `src/app/api/orders/[id]/deliveries/route.ts`、`next.config.mjs` |
| **描述** | 交付上传完全没有大小验证。Agent 上传检查 `MAX_ZIP_BYTES`（25 MB）但仅在完全缓冲后。通过 Next.js 路由段配置（`export const config = { api: { bodyParser: { sizeLimit } } }`）添加显式大小限制，并在处理前早期验证文件大小。 |
| **依赖** | 无 |
| **实施** | 为 body 大小限制添加路由段配置。在 File 对象从 FormData 处理前添加早期大小检查。每路由 5-10 行。 |

---

#### T6. 文件上传类型验证

| 属性 | 详情 |
|------|------|
| **严重性** | 中 |
| **复杂性** | 低 |
| **文件** | `src/app/api/orders/[id]/deliveries/route.ts`、`src/app/api/creator/agents/route.ts` |
| **描述** | Agent 上传通过 `zip-validator.ts` 验证 ZIP 结构（检查危险扩展如 .exe、.bat、.dmg）。交付上传完全没有类型验证——可以上传任何文件类型。 |
| **依赖** | 无 |
| **实施** | 为交付上传定义允许的 MIME 类型白名单（例如 `application/zip`、`application/pdf`、常见文档类型）。验证 `Content-Type` 头或接受前的文件扩展名。用 400 错误拒绝未知类型。 |

---

#### T7. 启动时生产环境变量验证

| 属性 | 详情 |
|------|------|
| **严重性** | 高（潜在 — 生产部署阻塞） |
| **复杂性** | 低 |
| **文件** | 新 `src/server/config.ts` 或扩展现有启动 |
| **描述** | 几个密钥回退到硬编码开发值：`DOWNLOAD_TICKET_SECRET` 默认为 `"dev-download-ticket-secret"`、`SESSION_SECRET` 列在 `.env.example` 但未使用、S3 存储变量缺少在 `.env.example` 中。生产中，缺少密钥应使启动失败而非静默使用不安全默认值。 |
| **生产必需变量** |
| `DATABASE_URL` | 必需 — Prisma 连接 |
| `APP_URL` | 必需 — CSRF Origin 验证、魔法链接 URL |
| `DOWNLOAD_TICKET_SECRET` | 必需 — 否则可能伪造票证 |
| `STRIPE_SECRET_KEY` | 当 `PAYMENT_PROVIDER=stripe` 时必需 |
| `STRIPE_WEBHOOK_SECRET` | 当 `PAYMENT_PROVIDER=stripe` 时必需 |
| `S3_*` 变量 | 当 `STORAGE_PROVIDER=s3` 时必需 |
| `ADMIN_EMAILS` | 必需 — 管理员访问控制 |
| **依赖** | 无 |
| **实施** | 创建 `validateProductionConfig()` 函数在应用初始化早期调用。检查 `NODE_ENV === "production"` 并在缺少必需变量时快速失败并显示描述性错误。使用 Zod 模式进行类型安全配置。 |

---

#### T8. 基于密码的登录

| 属性 | 详情 |
|------|------|
| **严重性** | 门槛 — 用户期望密码登录作为基线 |
| **复杂性** | 中高 |
| **文件** | Prisma 模式（User 模型）、新 `src/server/auth/password.ts`、登录页面更新、新注册页面、新 API 路由 |
| **描述** | 添加邮箱 + 密码注册和认证，与现有魔法链接并存。用户应能为其账户设置密码并用它登录。 |
| **模式更改** | 在 User 模型添加 `passwordHash String?`（可空 — 现有仅魔法链接用户为 null）。 |
| **关键决策** |
| 密码哈希 | 使用 `bcrypt`（通过 `bcryptjs` 用于纯 JS，或原生 `bcrypt` 包）。Argon2 更安全但增加原生依赖复杂性。 |
| 密码要求 | 最少 8 个字符。无最大复杂性规则（NIST SP 800-63B 指导）。对照常见密码列表检查（top 100k 泄露密码）。 |
| 注册流程 | 新 `/register` 页面。创建带密码哈希的 User。现有魔法链接用户可通过"设置密码"流程设置密码。 |
| 登录流程 | 更新 `/login` 页面，在魔法链接选项旁添加邮箱 + 密码表单。`POST /api/auth/login` 验证凭证，创建会话。 |
| **依赖** | 无 — 但应在 OAuth（T9、T10）之前实现，因为它们共享会话基础设施。 |
| **实施说明** | 现有 `createSession()` 函数在 `session.ts` 中已经处理会话创建和 Cookie 设置。密码认证只需验证凭证然后调用 `createSession()`。`consumeMagicLink` 模式是原子验证-会话创建流程的良好模板。 |

---

#### T9. Google OAuth 登录

| 属性 | 详情 |
|------|------|
| **严重性** | 门槛 — SaaS 市场期望的认证选项 |
| **复杂性** | 中 |
| **文件** | 新 `src/server/auth/oauth.ts`、新 OAuth 回调路由、Prisma 模式更改、登录页面更新 |
| **描述** | 添加 Google OAuth 作为登录方法。用户点击"使用 Google 登录"、授权，自动登录或注册。 |
| **模式更改** | 新 `OAuthAccount` 模型：`id`、`provider`（GOOGLE/GITHUB）、`providerAccountId`、`userId`、`accessToken`（可选）、`refreshToken`（可选）、`expiresAt`（可选）、`createdAt`、`updatedAt`。`(provider, providerAccountId)` 唯一约束。 |
| **实施方法** | 使用标准 OAuth 2.0 授权码流程（无 NextAuth/Auth.js 依赖 — 保持现有自定义会话系统）。 |
| **流程** |
| 1. 用户在 `/login` 点击"使用 Google 登录" | 重定向到 Google 授权 URL，带客户端 ID、重定向 URI、scopes（email、profile）。 |
| 2. Google 重定向到 `/api/auth/callback/google?code=...` | 服务器交换 code 为令牌、提取用户信息。 |
| 3. 查找或创建用户 | 按邮箱匹配。如果用户存在，链接 OAuth 账户。如果新，创建用户 + OAuth 账户。 |
| 4. 创建会话 | 调用现有 `createSession()`。 |
| **新环境变量** | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` |
| **依赖** | T8（密码认证）应首先完成以建立注册 + 会话模式。或者，如果 OAuth 账户模型提前设计，则可并行完成。 |

---

#### T10. GitHub OAuth 登录

| 属性 | 详情 |
|------|------|
| **严重性** | 门槛 — 对开发者/创作者受众重要 |
| **复杂性** | 中 |
| **文件** | 与 T9 相同的 OAuth 基础设施 |
| **描述** | 添加 GitHub OAuth 作为登录方法。由于这是开发者市场——创作者很可能是 GitHub 用户——这特别相关。 |
| **实施** | 重用 T9 的 `OAuthAccount` 模型和 OAuth 基础设施。GitHub OAuth 流程与 Google 几乎相同（授权码流程）。不同 scopes：`user:email`。 |
| **新环境变量** | `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` |
| **依赖** | T9（共享 OAuth 基础设施）。首先实施 T9，然后 T10 重用相同模式。 |

---

#### T11. 在 requireCreator 中添加角色检查

| 属性 | 详情 |
|------|------|
| **严重性** | 低（来自 CONCERNS.md 1.7） |
| **复杂性** | 低 |
| **文件** | `src/server/auth/session.ts` 第 155-162 行 |
| **描述** | `requireCreator()` 仅检查 `whitelistStatus === ACTIVE` 但不验证 `role === CREATOR`。`ACTIVE` 白名单状态的管理员将通过。在守卫条件中添加 `role === CREATOR` 检查。 |
| **依赖** | 无 |
| **实施** | 在守卫条件中添加一行。首先验证没有管理员流程依赖 `requireCreator()` 为管理员用户通过。 |

---

#### T12. 重复评价预防

| 属性 | 详情 |
|------|------|
| **严重性** | 低（来自 CONCERNS.md 1.8） |
| **复杂性** | 低 |
| **文件** | `src/server/agents/product-service.ts`、Prisma 模式 |
| **描述** | 用户可以对同一包提交无限评价。为评价添加 `(agentPackageId, userId)` 的唯一约束，或至少预检查。 |
| **依赖** | 无 |
| **实施** | 在模式中 `AgentPackageReview` 模型添加 `@@unique([agentPackageId, userId])`。在 `submitAgentPackageReview` 中优雅处理约束错误。 |

---

#### T13. 非原子退款 + 争议解决修复

| 属性 | 详情 |
|------|------|
| **严重性** | 高（来自 CONCERNS.md 2.1） |
| **复杂性** | 中 |
| **文件** | `src/app/admin/actions.ts` 第 158-171 行 |
| **描述** | `refundDisputedOrder` 调用 `requestRefund()` 然后 `resolveLatestOpenDisputeForOrder()` 无事务。如果 resolve 在退款后失败，争议保持开放，第二次退款可能发放。将两者包装在 `$transaction` 中。 |
| **依赖** | 无 — 但注意 `requestRefund` 可能调用 Stripe（外部服务），无法参与数据库事务。解决方案：在事务外首先执行 Stripe 调用，或使 resolve 步骤通过在继续前检查现有退款具有幂等性。 |
| **实施** | 将 DB 操作包装在 `$transaction` 中。仔细处理外部 Stripe 调用——考虑首先执行 Stripe 调用（非事务），然后在单个事务中原子记录退款 + 解决争议。 |

---

#### T14. 支付账本竞态条件修复

| 属性 | 详情 |
|------|------|
| **严重性** | 高（来自 CONCERNS.md 2.2） |
| **复杂性** | 低-中 |
| **文件** | `src/server/payments/ledger.ts` 第 58-98 行 |
| **描述** | `recordPaymentEvent` 做 `findUnique` 然后 `create` 但不捕获唯一约束冲突。两个带有相同 `providerEventId` 的并发 webhook 都通过检查并尝试创建。第二个抛出 P2002 作为 400 向上传播到支付提供商。 |
| **依赖** | 无 |
| **实施** | 在 `create` 调用中专门捕获 Prisma `P2002` 错误代码。将 P2002 视为"已处理，返回重复结果"而非让传播。5-10 行。 |

---

#### T15. 原子订单状态转换

| 属性 | 详情 |
|------|------|
| **严重性** | 中（来自 CONCERNS.md 2.3） |
| **复杂性** | 中 |
| **文件** | `src/server/orders/service.ts` 多个 `markServiceOrder*` 函数 |
| **描述** | 订单状态读取和写入非原子。在验证和更新之间，另一个请求可以改变状态。使用 `updateMany` 和 `where: { id, status: expectedStatus }` 并检查 `count === 1`。 |
| **依赖** | 无 |
| **实施** | 重构每个 `markServiceOrder*` 函数使用条件更新。模式：`const result = await store.updateMany({ where: { id, status: expectedStatus }, data: { status: newStatus } }); if (result.count === 0) throw new Error('Order status conflict');`。更改约 6 个函数。 |

---

#### T16. 会话清理（过期会话和魔法链接令牌）

| 属性 | 详情 |
|------|------|
| **严重性** | 中（来自 CONCERNS.md 2.5） |
| **复杂性** | 低-中 |
| **文件** | 新清理脚本或 cron 作业，或 Next.js 中间件钩子 |
| **描述** | 过期会话和已消费魔法链接令牌永远累积。需要定期清理。 |
| **依赖** | 无 |
| **实施** | 选项：（A）添加按计划调用的清理函数（node-cron、系统 cron 或应用启动触发）。（B）使用 PostgreSQL `pg_cron` 扩展。（C）在 `getCurrentSession()` 中添加机会性清理——每次有人登录时删除一些过期会话。选项 C 最简单，无需基础设施。 |

---

#### T17. 登出功能

| 属性 | 详情 |
|------|------|
| **严重性** | 中（来自 CONCERNS.md 6.1）— 基本 UX 期望 |
| **复杂性** | 低 |
| **文件** | 新 `src/app/api/auth/logout/route.ts` 或服务端动作、session.ts 更新 |
| **描述** | 不存在登出。会话 30 天后过期，但用户无法明确结束会话。添加删除会话记录并清除 Cookie 的登出端点。 |
| **依赖** | 无 |
| **实施** | 新路由或动作：读取会话 Cookie，调用 `deleteSessionRecord()`，调用 `cookieStore.delete(SESSION_COOKIE)`。10-15 行。 |

---

#### T18. 生产邮件提供商

| 属性 | 详情 |
|------|------|
| **严重性** | 高 — 魔法链接认证在生产中无实际邮件传递无用 |
| **复杂性** | 中 |
| **文件** | 新 `src/server/mail/production-mailer.ts`、更新 `src/server/auth/magic-link.ts` |
| **描述** | 唯一邮件实现（`dev-mailer.ts`）写入 `.jsonl` 文件。生产需要真实邮件提供商（Resend、SendGrid、Postmark 或 AWS SES）。遵循支付和存储使用的现有适配器模式。 |
| **依赖** | 无 |
| **实施** | 创建带 `sendLoginEmail(to, loginUrl)` 方法的 `EmailProvider` 接口。创建生产适配器（推荐 Resend — 简单 API、良好免费额度）。通过 `EMAIL_PROVIDER` 环境变量选择。更新 `requestMagicLink()` 使用配置的提供商。 |

---

### 类别 2：差异化 — 竞争安全优势

这些超越门槛，为市场平台提供真正的安全差异化。

---

#### D1. 角色/权限更改时会话撤销

| 属性 | 详情 |
|------|------|
| **严重性** | 低（来自 CONCERNS.md 6.3）— 但高安全价值 |
| **复杂性** | 中 |
| **文件** | `src/app/admin/actions.ts`、`src/server/auth/session.ts` |
| **描述** | 当管理员更改用户角色（激活/停用创作者、更改管理员状态）时，现有会话不失效。用户保留旧权限直到 30 天会话过期。在用户角色或白名单状态更改时使该用户的所有会话失效。 |
| **安全价值** | 防止降级后权限持续。这是真正的攻击向量 — 被降级的管理员可能保留访问数周。大多数平台错过这个。 |
| **依赖** | 无 |
| **实施** | 在 session.ts 添加 `deleteSessionsByUserId(userId)`。从 `activateCreatorWhitelist` 和任何未来角色更改的管理员操作调用。考虑在管理 UI 中添加"撤销所有会话"按钮。 |

---
