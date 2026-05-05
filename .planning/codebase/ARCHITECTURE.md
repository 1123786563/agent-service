# 架构 — Hermes Agent Marketplace

## 概述

Hermes Agent Marketplace 是一个基于 Next.js 15 的 SaaS 应用，用于发布、发现和交易 AI 智能体包（包含经过验证的 `agent.json` 元数据的 ZIP 文件）。平台支持完整的市场生命周期：智能体发布、买家咨询、订单管理、支付处理、交付、争议解决、退款和提供商结算。

应用独家使用 **Next.js App Router** 模式。服务端渲染和服务端动作是主要的交互模型。不存在被前端消费的 REST API 客户端；相反，页面是直接查询数据库的服务端组件，变更通过 Next.js 服务端动作（`"use server"` 函数）或处理表单提交并重定向的 API 路由处理程序流动。

**运行时栈：** Next.js 15 (App Router)、React 19、TypeScript（严格）、PostgreSQL via Prisma 5、Stripe 支付、AWS S3 兼容对象存储。

---

## 架构模式

### 服务端组件（默认）

`src/app/` 下的所有页面文件都是 **异步服务端组件**。它们直接调用服务层函数和 Prisma，然后渲染 HTML。不使用任何客户端数据获取库。

直接访问数据的关键页面：
- `src/app/agents/page.tsx` — 调用 `listPublishedAgentPackages()`
- `src/app/agents/[slug]/page.tsx` — 调用 `getPublishedAgentPackageBySlug()`
- `src/app/creator/page.tsx` — 调用 `prisma.agentPackage.findMany()` 并聚合
- `src/app/admin/page.tsx` — 直接调用 `prisma` 进行后台查询
- `src/app/account/orders/page.tsx` — 调用 `prisma.serviceOrder.findMany()` 并按买家邮箱过滤

### 客户端组件（最小化）

只有三个组件使用 `"use client"`：
- `src/components/consultation-form.tsx` — 通过 `useState` 管理本地提交状态
- `src/components/cancel-order-button.tsx` — 使用 `useTransition` 和 `fetch()` 进行乐观变更
- 不存在其他客户端交互

### 服务端动作

两个文件定义 `"use server"` 动作：
- `src/app/creator/actions.ts` — `createConsultationOrderAction()`（范围咨询和创建订单）
- `src/app/admin/actions.ts` — 7 个动作：`activateCreatorWhitelist`、`archiveAgentPackage`、`resetOrderPayment`、`resolveDisputedOrder`、`refundDisputedOrder`、`markOrderSettled`、`markSettlementBatchPaidOutAction`

服务端动作在变更后调用 `revalidatePath()` 以刷新服务端组件缓存。

---

## 数据流

```
请求
  |
  v
Next.js App Router
  |
  +--> 服务端组件页面
  |      |
  |      +--> 服务层 (src/server/*)
  |             |
  |             +--> Prisma 客户端 (src/server/db.ts)
  |                    |
  |                    +--> PostgreSQL
  |
  +--> API 路由处理程序 (src/app/api/*)
         |
         +--> 认证检查 (getCurrentUser / requireCreator / requireAdmin)
         |
         +--> 服务层 (src/server/*)
         |      |
         |      +--> Prisma 客户端
         |
         +--> 响应 (JSON 或重定向)
```

### Prisma 单例

`src/server/db.ts` 导出一个 `PrismaClient` 实例，在开发环境中存储在 `globalThis` 上以在 HMR 时存活。所有服务从此模块导入 `prisma`。

---

## 服务层

服务层位于 `src/server/` 下，按领域组织。每个服务模块遵循一致的模式：

### 常见服务模式

1. **类型定义** — 每个文件顶部定义输入类型、存储接口和依赖注入类型。
2. **存储接口** — 类型化的 `Store` 接口抽象所有 Prisma 调用，支持测试时模拟。
3. **默认存储** — `defaultDeps`（或 `defaultStore`）对象连接真实 Prisma 客户端。
4. **业务逻辑函数** — 接受输入 + 可选 `deps` 参数以进行依赖注入的纯业务逻辑函数。
5. **验证** — Zod 模式验证输入字符串；自定义断言验证领域不变量。
6. **事务** — 多表变更使用 `prisma.$transaction()`。

### 领域服务

| 模块 | 文件 | 用途 |
|------|------|------|
| **智能体/包** | `src/server/agents/package-service.ts` | 上传、验证、列出和读取智能体 ZIP 包 |
| **智能体/元数据** | `src/server/agents/metadata-schema.ts` | `agent.json` 元数据验证的 Zod 模式 |
| **智能体/ZIP 验证器** | `src/server/agents/zip-validator.ts` | 低级 ZIP 结构验证（中央目录解析、路径安全） |
| **智能体/产品** | `src/server/agents/product-service.ts` | 收藏、评价、导入说明、推荐评分 |
| **订单** | `src/server/orders/service.ts` | 创建、支付、取消、争议、解决服务订单 |
| **支付/适配器** | `src/server/payments/adapter.ts` | 支付提供商抽象（`PaymentProvider` 接口） |
| **支付/Stripe** | `src/server/payments/stripe-adapter.ts` | Stripe 结账会话、Webhook 解析、退款调用 |
| **支付/开发** | `src/server/payments/dev-adapter.ts` | 开发模式支付提供商（无真实 Stripe 调用） |
| **支付/账本** | `src/server/payments/ledger.ts` | 对 `PaymentLedger` 表的幂等支付事件记录 |
| **支付/Webhook 事件** | `src/server/payments/webhook-events.ts` | 规范化支付/退款事件类型定义 |
| **咨询** | `src/server/consultations/service.ts` | 创建、更新、列出买家咨询（带状态机） |
| **交付** | `src/server/deliveries/service.ts` | 上传交付文件、标记已交付、接受交付 |
| **争议** | `src/server/disputes/service.ts` | 开启争议、提交证据、通过管理员操作解决 |
| **退款** | `src/server/refunds/service.ts` | 通过支付提供商请求退款、应用退款 Webhook 事件 |
| **结算** | `src/server/settlements/service.ts` | 构建结算明细、提交批次、标记已支付 |
| **审计** | `src/server/audit/service.ts` | 只追加的审计日志记录 |
| **认证/魔法链接** | `src/server/auth/magic-link.ts` | 通过魔法链接令牌的无密码登录 |
| **认证/会话** | `src/server/auth/session.ts` | 基于 Cookie 的会话管理、`getCurrentUser()`、`requireCreator()`、`requireAdmin()` |
| **存储/提供商** | `src/server/storage/provider.ts` | `StorageProvider` 接口、范围类型、流工具 |
| **存储/本地** | `src/server/storage/local-provider.ts` | 本地文件系统存储提供商 |
| **存储/S3** | `src/server/storage/s3-provider.ts` | S3 兼容对象存储提供商（AWS SDK） |
| **存储/工厂** | `src/server/storage/factory.ts` | 根据 `STORAGE_PROVIDER` 环境变量选择存储提供商 |
| **存储/本地存储** | `src/server/storage/local-storage.ts` | 智能体 ZIP 文件 I/O 的便捷包装器 |
| **存储/本地交付** | `src/server/storage/local-delivery-storage.ts` | 交付文件 I/O 的便捷包装器 |
| **存储/下载授权** | `src/server/storage/download-authorization.ts` | 智能体 ZIP 和交付资产下载访问授权 |
| **存储/下载票证** | `src/server/storage/download-tickets.ts` | HMAC 签名下载票证（可选一次性执行） |
| **邮件/开发邮件** | `src/server/mail/dev-mailer.ts` | 开发模式邮件"发送"（写入 JSONL 文件） |

---

## 认证与授权流程

### 魔法链接认证

1. 用户在 `/login` 页面输入邮箱。
2. 表单 POST 到 `POST /api/auth/request-link`。
3. `src/server/auth/magic-link.ts` 中的 `requestMagicLink()`：
   - 用 Zod 验证邮箱。
   - Upsert `User` 记录（如果邮箱匹配 `ADMIN_EMAILS` 环境变量则自动分配 `ADMIN` 角色）。
   - 创建带 SHA-256 哈希令牌和 15 分钟过期时间的 `MagicLinkToken`。
   - 通过 `sendDevLoginEmail()` 发送登录 URL（写入 `.data/dev-email-outbox.jsonl`）。
4. 用户点击链接访问 `GET /api/auth/consume?token=...`。
5. `consumeMagicLink()`：
   - 原子事务：标记令牌已消费、创建 `Session` 记录。
   - 设置 `hermes_market_session` HTTP-only Cookie（30 天过期）。
   - 如果 Cookie 设置失败，回滚令牌消费和会话创建。

### 授权守卫

`src/server/auth/session.ts` 中的三个函数提供分层访问：

| 函数 | 要求 | 使用者 |
|------|------|-------|
| `getCurrentUser()` | 有效会话 Cookie、未过期会话 | 买家页面、一般访问 |
| `requireCreator()` | 已认证 + `whitelistStatus === ACTIVE` | 创作者页面、上传、咨询订单创建 |
| `requireAdmin()` | 已认证 + 邮箱在 `ADMIN_EMAILS` 中 | 管理后台、白名单、争议解决、退款 |

---

## 文件上传/下载管道

### 智能体 ZIP 上传

```
创作者提交 ZIP 表单
  -> POST /api/creator/agents (API 路由)
  -> requireCreator() 认证检查
  -> createAgentPackageFromZip() (package-service)
       |
       +-> validateAgentZip() (zip-validator)
       |     - 直接解析 ZIP 中央目录（不解压）
       |     - 检查文件数量（最多 250 个）、大小（25MB 压缩、100MB 解压）
       |     - 验证 agent.json 存在并可针对 metadata-schema.ts 解析
       |     - 验证 ZIP 中所有 skill/workflow 路径存在
       |     - 标记危险扩展名（.exe、.dmg、.bat）和脚本文件
       |     - 检测路径遍历和不安全路径
       |
       +-> getStorageProvider().putObject()
       |     - 本地：写入 .data/uploads/ 并清理文件名
       |     - S3：PUT 对象到配置桶的 agents/ 前缀下
       |
       +-> Slug 生成：slugifyPackageName() 冲突时添加唯一后缀
       |
       +-> Prisma：创建 AgentPackage（包含 skills、workflows、验证结果）
```

### 智能体 ZIP 下载

```
GET /api/agents/[slug]/download
  -> authorizeAgentZipDownload() - 验证包状态为 PUBLISHED
  -> createDownloadTicket() 或验证查询参数中的现有票证
  -> HMAC-SHA256 签名票证（默认 5 分钟过期）
  -> incrementPublishedAgentPackageDownloadCount()
  -> readStoredZip() - 从本地文件系统或 S3 读取
  -> recordAuditLog() - 记录下载事件
  -> 响应 application/zip
```

### 交付上传/下载

交付遵循相同的存储管道但使用 `deliveries/` 范围。下载需要认证（买家、提供商或管理员）并使用一次性下载票证。

---

## 支付流程

### 结账流程

```
买家在 /account/orders 点击"支付"
  -> POST /api/orders/[id]/pay
  -> getCurrentUser() - 验证买家拥有订单
  -> createPaymentSessionForOrder()
       |
       +-> 验证订单状态为 PENDING_PAYMENT 且支付状态可支付
       +-> getPaymentAdapter() - 解析为 "dev" 或 "stripe" 提供商
       +-> adapter.createCheckoutSession()
            - 开发：返回到 /api/payments/dev/complete 的 URL
            - Stripe：创建 Stripe Checkout Session，返回重定向 URL
       |
       -> Response.redirect() 到结账 URL (303)
```

### Webhook 处理

```
支付提供商发送 webhook
  -> POST /api/payments/webhook
  -> adapter.parseWebhook()
       - 开发：解析 JSON body 针对 devWebhookPayloadSchema
       - Stripe：验证签名，规范化事件类型
  -> isRefundEvent()? -> applyRefundEvent() : applyPaymentEvent()
       |
       +-> recordPaymentEvent() (ledger.ts)
       |     - 幂等性：检查 providerEventId 唯一性
       |     - 存储原始事件摘要（SHA-256）
       |
       +-> 更新 ServiceOrder 状态：
       |     - payment.succeeded -> IN_PROGRESS + PAID
       |     - payment.failed -> PENDING_PAYMENT + FAILED
       |     - payment.cancelled -> PENDING_PAYMENT + CANCELLED
       |
       +-> recordAuditLog()
```

### 支付账本

`PaymentLedger` 表是一个只追加的事件日志。每行记录：
- `providerEventId`（唯一）— 去重键
- `providerPaymentId` / `providerCheckoutSessionId` — 提供商引用
- `amountMinor` / `currency` — 金额详情
- `paymentStatus` — 事件中的当前状态
- `rawEventDigest` — 原始 payload 的 SHA-256 用于完整性验证
- `idempotencyKey` — 幂等提供商操作

---

## 订单生命周期

```
                         +------------------+
                         | PENDING_PAYMENT  |
                         | payment: UNPAID  |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |               |            |
              支付成功         支付失败        支付取消
                    |               |            |
                    v               v            v
             +------+------+  （保持这里）  （保持这里）
             | IN_PROGRESS |
             | payment:PAID|
             +------+------+
                    |
          +---------+---------+
          |                   |
    提供商上传          买家开启争议
          |                   |
          v                   v
   +------+------+    +-------+-------+
   |  DELIVERED   |    |   DISPUTED    |
   +------+------+    +-------+-------+
          |                   |
   买家接受交付          管理员解决
          |            /  |  \
          v           /   |   \
   +------+------+   /    |    \
   |  COMPLETED  |<-+     |     +-> 全额退款
   +------+------+        |          |
                         |          v
                    返回到       CANCELLED
                    IN_PROGRESS   payment:
                    或 DELIVERED  REFUNDED
                                            （或从
                                             PENDING_PAYMENT
                                             通过取消进入）
```

### 状态转换

| 从 | 到 | 触发器 |
|----|----|--------|
| PENDING_PAYMENT | IN_PROGRESS | 支付成功 webhook |
| PENDING_PAYMENT | CANCELLED | 买家取消（仅在 UNPAID/FAILED 时） |
| IN_PROGRESS | DELIVERED | 提供商上传交付文件 |
| IN_PROGRESS | DISPUTED | 买家或提供商开启争议 |
| DELIVERED | COMPLETED | 买家接受交付 |
| DELIVERED | DISPUTED | 买家或提供商开启争议 |
| DISPUTED | IN_PROGRESS | 管理员解决：返回进行中 |
| DISPUTED | DELIVERED | 管理员解决：返回已交付 |
| DISPUTED | CANCELLED | 管理员解决：全额退款 |

### 咨询转订单管道

1. 买家从智能体详情页面提交咨询（`/agents/[slug]#consultation`）。
2. `POST /api/consultations` 创建状态为 `NEW` 的咨询。
3. 提供商通过 `NEW -> IN_DISCUSSION -> SCOPED` 更新咨询状态（带范围摘要）。
4. 提供商通过 `createConsultationOrderAction` 服务端动作创建订单：
   - 如果尚未设置则将状态设置为 `SCOPED`。
   - 调用 `createServiceOrder()` 原子创建订单并更新咨询状态为 `ORDER_CREATED`。

---

## 结算管道

```
订单 COMPLETED + 支付 PAID
  |
  v
buildSettlementLine()
  - 验证无开放争议或待处理退款
  - 创建 SettlementLine（总额、平台费、净额）
  |
  v
submitSettlementBatch()
  - 按提供商和货币分组明细
  - 包含待处理 SettlementAdjustment
  - 锁定明细（状态：LOCKED）
  - 创建 SettlementBatch（状态：SUBMITTED）
  |
  v
markSettlementBatchPaidOut()
  - 更新批次为 PAID_OUT
  - 标记明细为 SETTLED
  - 更新 ServiceOrder.settledAt 和 settlementReference
```

### 退款对结算的影响

当退款成功时：
- 如果结算明细为 `PENDING`：直接减少 `refundDeductionAmount`。
- 如果明细为 `LOCKED` 或 `SETTLED`：创建负金额的 `SettlementAdjustment`，应用到下一批次。

---

## 争议解决

```
createDispute()
  - 验证订单处于可争议状态（PAID、IN_PROGRESS、DELIVERED）
  - 防止重复开放争议
  - 原子：创建 Dispute + 证据、更新订单为 DISPUTED

resolveDispute()
  - 解决类型：
    - RETURN_TO_PROGRESS -> 订单返回 IN_PROGRESS
    - RETURN_TO_DELIVERED -> 订单返回 DELIVERED
    - REFUND_FULL -> 订单 CANCELLED，支付 REFUNDED
    - REFUND_PARTIAL -> 订单 CANCELLED，支付 PARTIALLY_REFUNDED
    - REJECTED -> 订单返回 DELIVERED
```

---

## 关键设计决策

1. **无外部认证提供商** — 魔法链接认证内置，使用 SHA-256 哈希令牌和存储在数据库中的基于 Cookie 的会话。

2. **依赖注入以提高可测试性** — 每个服务接受可选的 `deps` 或 `store` 参数，支持基于模拟的单元测试，无需数据库访问。

3. **双提供商存储抽象** — `StorageProvider` 接口允许通过环境变量在本地文件系统和 S3 兼容存储之间切换，附带迁移脚本（`scripts/migrate-assets-to-object-storage.ts`）。

4. **支付提供商抽象** — `PaymentProvider` 接口规范化 Stripe 和开发模式适配器。Webhook 事件映射到通用的 `NormalizedProviderEvent` 类型。

5. **只追加支付账本** — 所有支付事件通过 `providerEventId` 的幂等性检查记录，防止重复处理。

6. **HMAC 签名下载票证** — 下载授权使用无状态 HMAC 令牌，可选通过 `DownloadTicketUse` 表强制一次性执行。

7. **Zod 优先验证** — 所有外部输入（表单数据、API payload、元数据文件）通过 Zod 模式验证后再到达业务逻辑。

8. **服务端组件优先** — 最少客户端 JavaScript。只有两个组件使用 `"use client"`。所有数据获取和渲染发生在服务端。
