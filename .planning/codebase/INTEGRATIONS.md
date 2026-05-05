# 外部集成 — Hermes Agent Marketplace

## 架构概述

所有外部集成遵循 **适配器模式** — 供应商无关接口与可通过环境变量切换的实现。这实现了完全本地开发，无需外部服务依赖。

```
                    +-------------------+
                    |   适配器层         |
                    |  (接口 +          |
                    |   工厂)           |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+          +---------v---------+
     |  开发适配器      |          |  生产适配器       |
     |  （进程内）      |          |                   |
     +------------------+          +---------+----------+
                                            |
                              +-------------+-------------+
                              |                           |
                     +--------v--------+        +---------v--------+
                     |  Stripe SDK     |        |  AWS S3 SDK      |
                     +-----------------+        +------------------+
```

---

## 1. Stripe 支付集成

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/payments/adapter.ts` | `PaymentProvider` 接口、工厂、会话编排 |
| `src/server/payments/stripe-adapter.ts` | `StripePaymentProvider` 实现 |
| `src/server/payments/dev-adapter.ts` | `devPaymentAdapter`（进程内，无外部服务） |
| `src/server/payments/ledger.ts` | 幂等支付事件账本 |
| `src/server/payments/webhook-events.ts` | 规范化事件类型定义 |
| `src/app/api/payments/webhook/route.ts` | Webhook 端点（`POST /api/payments/webhook`） |
| `src/app/api/payments/dev/complete/route.ts` | 开发支付完成（`GET /api/payments/dev/complete`） |
| `src/app/api/orders/[id]/pay/route.ts` | 结账会话创建 |

### 适配器接口

```typescript
interface PaymentProvider {
  provider: string;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<PaymentCheckoutSession>;
  parseWebhook(request: Request): Promise<NormalizedProviderEvent>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}
```

### 提供商选择

- `getPaymentProvider()` 读取 `PAYMENT_PROVIDER` 环境变量（默认：`"dev"`）
- `getPaymentAdapter()` 返回匹配的适配器实例：
  - `"dev"` -> `devPaymentAdapter`（单例）
  - `"stripe"` -> 新 `StripePaymentProvider()` 实例
  - 任何其他值抛出 `Error`

### Stripe 结账流程

1. **创建会话**：`createPaymentSessionForOrder()` 加载订单，验证状态为 `PENDING_PAYMENT` 且支付状态可支付，然后调用 `adapter.createCheckoutSession()`。
2. **Stripe 适配器** 通过 `stripe.checkout.sessions.create()` 创建 Checkout Session：
   - 模式：`payment`（一次性，非订阅）
   - `client_reference_id` 设置为 orderId
   - `success_url` 和 `cancel_url` 指向 `/account/orders` 带查询参数
   - `metadata` 在会话和支付意向两者都携带 `orderId`、`paymentReference` 和 `provider`
   - `price_data` 是内联的（无预创建 Stripe 产品/价格）
3. **Webhook 传递**：Stripe 发送事件到 `POST /api/payments/webhook`
4. **Webhook 处理**：`adapter.parseWebhook()` 验证签名并规范化事件
5. **账本记录**：`recordPaymentEvent()` 通过 `providerEventId` 强制幂等性
6. **订单更新**：相应更新订单状态和支付状态

### Stripe Webhook 事件处理

`StripePaymentProvider.normalizeWebhookEvent()` 处理五种 Stripe 事件类型：

| Stripe 事件类型 | 规范化类型 | 对订单的影响 |
|----------------|----------|------------|
| `checkout.session.completed` | `payment.succeeded` | -> IN_PROGRESS / PAID |
| `checkout.session.expired` | `payment.cancelled` | -> PENDING_PAYMENT / CANCELLED |
| `payment_intent.succeeded` | `payment.succeeded` | -> IN_PROGRESS / PAID |
| `payment_intent.payment_failed` | `payment.failed` | -> PENDING_PAYMENT / FAILED |
| `refund.updated` / `refund.failed` | `refund.succeeded` / `refund.failed` | 更新 Refund 记录 |

### Stripe 退款流程

- `StripePaymentProvider.refundPayment()` 使用 `payment_intent` 引用和 `amount` 调用 `stripe.refunds.create()`
- 退款状态映射：`succeeded` -> `"succeeded"`、`failed` -> `"failed"`、其他 -> `"pending"`
- 退款结果通过 `applyRefundEvent()` 记录，也调整结算明细

### 配置

| 环境变量 | 需要用于 | 用途 |
|---------|---------|------|
| `STRIPE_SECRET_KEY` | stripe | API 认证 |
| `STRIPE_WEBHOOK_SECRET` | stripe | Webhook 签名验证 |
| `APP_URL` | stripe | 成功/取消 URL 生成 |
| `PAYMENT_PROVIDER` | 全部 | 选择 `"dev"` 或 `"stripe"` |

### 错误处理

- 缺少 Stripe 配置时 `getRequiredConfigValue()` 抛出描述性错误
- 缺少 `Stripe-Signature` 头或签名无效时 Webhook 解析抛出错误
- 事件 metadata 中缺少订单 ID 时 `assertMetadataOrderId()` 抛出错误
- 所有 Webhook 错误返回带 `{ errors: [message] }` JSON 的 HTTP 400
- 支付账本强制幂等性——重复 `providerEventId` 值被静默跳过

### 开发适配器

开发适配器提供完整支付流程无需 Stripe：

- **结账**：返回到 `GET /api/payments/dev/complete?orderId=...&paymentReference=...` 的 URL
- **完成**：开发完成端点创建规范化事件并通过相同的 `applyPaymentEvent()` 管道处理
- **退款**：立即返回 `"succeeded"` 状态和 `devrefund_*` ID
- **Webhook**：接受带 `devWebhookPayloadSchema` 验证的 JSON payload
- 支持 `"payment.succeeded"`、`"payment.failed"` 和 `"payment.cancelled"` 事件类型

---

## 2. AWS S3 对象存储

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/storage/provider.ts` | `StorageProvider` 接口、`StoredObject` 类型 |
| `src/server/storage/factory.ts` | 带配置验证的提供商工厂 |
| `src/server/storage/s3-provider.ts` | `S3CompatibleStorageProvider` 实现 |
| `src/server/storage/local-provider.ts` | `LocalStorageProvider` 实现 |
| `src/server/storage/local-storage.ts` | 智能体包存储门面（本地） |
| `src/server/storage/local-delivery-storage.ts` | 交付文件存储门面（本地） |
| `src/server/storage/download-authorization.ts` | 下载访问授权 |
| `src/server/storage/download-tickets.ts` | HMAC 签名下载票证 |
| `src/app/api/agents/[slug]/download/route.ts` | 智能体包下载端点 |
| `src/app/api/orders/[id]/deliveries/[deliveryId]/download/route.ts` | 交付下载端点 |

### 适配器接口

```typescript
interface StorageProvider {
  kind: "local" | "s3-compatible";
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObjectStream(input: { objectKey: string }): Promise<Readable>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  buildObjectKey(input: { scope: StorageScope; fileName: string }): string;
}
```

### 提供商选择

`src/server/storage/factory.ts` 中的 `getStorageProvider()`：
- 读取 `STORAGE_PROVIDER` 环境变量（默认：`"local"`）
- `"local"` -> `LocalStorageProvider` 单例
- `"s3-compatible"` -> 验证所有必需的 S3 环境变量，然后创建 `S3CompatibleStorageProvider`
- 未知提供商值或缺少 S3 配置时抛出错误

### 存储范围

系统有两个存储范围，每个都有单独的目录/桶前缀：

| 范围 | 默认本地目录 | 默认 URL 前缀 | 使用者 |
|------|------------|-------------|-------|
| `agents` | `.data/uploads` | `/api/uploads` | 智能体 ZIP 包 |
| `deliveries` | `.data/deliveries` | `/api/deliveries` | 订单交付 |

### S3 实现细节

`S3CompatibleStorageProvider`（`src/server/storage/s3-provider.ts`）：

- 使用 `@aws-sdk/client-s3` 和 `S3Client`
- 支持路径样式或虚拟主机样式 URL（可通过 `S3_FORCE_PATH_STYLE` 配置，默认：`true`）
- 可选 `S3_PUBLIC_BASE_URL` 覆盖用于 CDN/代理前端
- **PutObject**：包含 `ContentType`、`ContentDisposition` 和 `ChecksumSHA256` 头
- **GetObject**：返回 `Readable` 流，规范各种响应 body 类型
- **DeleteObject**：标准 S3 删除
- **对象键**：格式 `{scope}/{fileName}`（例如 `agents/my-agent-abc123.zip`）

### 文件处理

- **文件名清理**：Unicode 规范化（NFKD）、去除变音符号、仅 ASCII 小写、路径遍历预防
- **唯一后缀**：追加 8 个随机十六进制字节以防止冲突
- **MIME 类型推断**：按文件扩展名（`.zip`、`.pdf`、`.json`、`.md`、`.txt`，默认：`application/octet-stream`）
- **校验和**：上传时计算 SHA-256 十六进制摘要，存储在 `AgentPackage.checksum` / `Delivery.checksum`

### 下载授权

文件：`src/server/storage/download-authorization.ts`、`src/server/storage/download-tickets.ts`

文件下载访问通过票证系统控制：

1. **授权检查**：
   - 智能体 ZIP：需要 `AgentPackageStatus.PUBLISHED`——可匿名访问
   - 交付资产：需要通过 `authorizeDeliveryAssetDownload()` 验证买家/提供商/管理员角色

2. **票证发放**：`createDownloadTicket()` 创建 HMAC-SHA256 签名票证：
   - Payload：`{ resourceType, resourceId, objectKey, actorScope, audience, jti, keyId, expiresAt }`
   - 默认 TTL：5 分钟
   - 支持通过 `DOWNLOAD_TICKET_PREVIOUS_KEY_ID` / `DOWNLOAD_TICKET_PREVIOUS_SECRET` 密钥轮换

3. **票证验证**：`verifyDownloadTicket()` 检查签名、受众和过期
   - 一次性票证在 `DownloadTicketUse` 表中记录使用（防止重放）
   - 使用 `crypto.timingSafeEqual` 进行签名比较（防止时序攻击）

### 配置

| 环境变量 | 需要用于 | 用途 |
|---------|---------|------|
| `STORAGE_PROVIDER` | 全部 | `"local"` 或 `"s3-compatible"` |
| `S3_ENDPOINT` | s3-compatible | S3 服务端点 |
| `S3_REGION` | s3-compatible | S3 区域 |
| `S3_BUCKET` | s3-compatible | 目标桶 |
| `S3_ACCESS_KEY_ID` | s3-compatible | 访问密钥 |
| `S3_SECRET_ACCESS_KEY` | s3-compatible | 密钥 |
| `S3_FORCE_PATH_STYLE` | s3-compatible | 路径样式 URL（默认：`true`） |
| `S3_PUBLIC_BASE_URL` | s3-compatible | CDN/代理 URL 覆盖 |
| `UPLOAD_DIR` | local | 智能体上传目录 |
| `DELIVERY_UPLOAD_DIR` | local | 交付上传目录 |
| `DOWNLOAD_TICKET_SECRET` | 全部 | HMAC 签名密钥 |
| `DOWNLOAD_TICKET_ACTIVE_KEY_ID` | 全部 | 活动签名密钥 ID |
| `DOWNLOAD_TICKET_PREVIOUS_KEY_ID` | 全部 | 之前密钥（用于轮换） |
| `DOWNLOAD_TICKET_PREVIOUS_SECRET` | 全部 | 之前密钥（用于轮换） |

---

## 3. 邮件/魔法链接认证

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/auth/magic-link.ts` | 魔法链接请求/消费逻辑 |
| `src/server/auth/session.ts` | 会话创建、验证、Cookie 管理 |
| `src/server/mail/dev-mailer.ts` | 仅开发邮件传递（写入 JSONL 文件） |
| `src/app/api/auth/request-link/route.ts` | `POST /api/auth/request-link` |
| `src/app/api/auth/consume/route.ts` | `GET /api/auth/consume?token=...` |
| `src/app/login/page.tsx` | 登录表单 UI |

### 认证流程

```
用户输入邮箱
       |
       v
POST /api/auth/request-link
       |
       v
requestMagicLink(email)
  1. 验证邮箱（Zod）
  2. Upsert User（自动提升管理员邮箱）
  3. 创建 MagicLinkToken（sha256 哈希，15分钟 TTL）
  4. 发送带链接的邮件（开发：写入 JSONL 文件）
       |
       v
用户点击链接 -> GET /api/auth/consume?token=...
       |
       v
consumeMagicLink(token)
  1. 哈希令牌，查找未消费、未过期的 MagicLinkToken
  2. 在 $transaction 中：
     a. 标记令牌已消费（consumedAt）
     b. 创建 Session 记录（sha256 哈希，30天 TTL）
  3. 设置 httpOnly 会话 Cookie
  4. 重定向到 /creator
```

### 会话管理

- **Cookie 名称**：`hermes_market_session`
- **Cookie 属性**：`httpOnly`、`sameSite: "lax"`、生产环境 `secure`、30 天过期
- **令牌模型**：不透明令牌（32 个随机字节，base64url 编码）；仅存储 SHA-256 哈希
- **会话查找**：`getCurrentSession()` 读取 Cookie，哈希令牌，用 `include: { user: true }` 查询 `Session`
- **授权帮助函数**：`getCurrentUser()`、`requireCreator()`（检查 `WhitelistStatus.ACTIVE`）、`requireAdmin()`（检查 `ADMIN_EMAILS`）

### 错误处理

- `AuthFlowError` 类带类型化错误码：`"invalid-email"`、`"invalid-token"`
- 登录页面显示本地化错误/状态消息（中文）
- 魔法链接消费使用 `$transaction` 保证原子性
- Cookie 写入失败触发会话记录和魔法链接消费的回滚

### 开发邮件器

文件：`src/server/mail/dev-mailer.ts`

- 将登录邮件写入 JSONL 文件（默认：`.data/dev-email-outbox.jsonl`）
- 每行：`{ type: "login", email, loginUrl, sentAt }`
- 可通过 `DEV_EMAIL_OUTBOX` 环境变量配置

**注意**：尚无生产邮件集成。系统当前仅支持开发邮件器。需要添加生产邮件服务（例如 Resend、SendGrid、AWS SES）作为生产邮件适配器。

---

## 4. 数据库连接（PostgreSQL via Prisma）

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/db.ts` | PrismaClient 单例 |
| `prisma/schema.prisma` | 模式定义 |
| `prisma/seed.ts` | 管理员用户播种 |
| `prisma/migrations/` | 13 个迁移文件 |

### 连接管理

- 使用 `globalThis` 的单例模式防止开发热重载期间多个 PrismaClient 实例
- 通过 `DATABASE_URL` 环境变量的连接字符串
- 开发日志级别：`error` + `warn`；生产：`error`

### 事务使用

代码库广泛使用 Prisma `$transaction`：

| 操作 | 文件 |
|------|------|
| 魔法链接消费 + 会话创建 | `src/server/auth/magic-link.ts` |
| 订单创建 + 咨询状态更新 | `src/server/orders/service.ts` |
| 交付创建 + 订单状态更新 | `src/server/deliveries/service.ts` |
| 争议创建 + 订单状态更新 | `src/server/disputes/service.ts` |
| 争议解决 + 订单/支付状态更新 | `src/server/disputes/service.ts` |
| 退款创建 + 订单/支付/结算更新 | `src/server/refunds/service.ts` |
| 结算批次创建 + 明细/调整锁定 | `src/server/settlements/service.ts` |
| 批次支付 + 订单结算标记 | `src/server/settlements/service.ts` |
| Cookie 写入失败回滚 | `src/server/auth/magic-link.ts`、`src/server/auth/session.ts` |

---

## 5. 审计日志

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/audit/service.ts` | `recordAuditLog()` 函数 |
| `prisma/schema.prisma` | `AuditLog` 模型定义 |

### 实现

- 简单只追加审计轨迹，存储在 PostgreSQL `AuditLog` 表中
- 每条记录：`actorId`、`actorRole`（USER/ADMIN/SYSTEM）、`action`、`targetType`、`targetId`、可选 `beforeSnapshot`/`afterSnapshot`（JSON）、可选 `ipAddress`/`userAgent`
- 调用自：支付 webhook、争议创建/解决、退款创建/webhook

### 审计事件目录

| 操作 | 角色 | 触发器 |
|------|------|--------|
| `payment.webhook.processed` | SYSTEM | 收到支付 webhook |
| `dispute.create` | USER | 买家开启争议 |
| `dispute.resolve` | ADMIN | 管理员解决争议 |
| `refund.create` | ADMIN | 发起退款 |
| `refund.webhook.processed` | SYSTEM | 收到退款 webhook |

---

## 6. ZIP 包验证（JSZip）

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/agents/metadata-schema.ts` | `agent.json` 元数据的 Zod 模式 |
| `src/server/agents/zip-validator.ts` | ZIP 存档验证 |
| `src/server/agents/package-service.ts` | 包创建编排 |

### 验证管道

1. **大小检查**：最大 25 MB 压缩
2. **中央目录解析**：ZIP 中央目录的原始二进制解析（不依赖 JSZip 进行结构验证）
3. **条目验证**：最多 250 个文件、最多 100 MB 解压、路径安全检查、重复路径检测
4. **危险内容检测**：阻止 `.exe`、`.dmg`、`.pkg`、`.bat`、`.cmd`、`.ps1`；标记 `.sh`、`.js`、`.ts`、`.py`、`.rb`
5. **必需文件**：`agent.json` 和 `README.md` 必须存在
6. **元数据验证**：`agent.json` 通过 `agentMetadataSchema`（Zod）解析和严格字段验证
7. **引用文件验证**：元数据中声明的所有 skill 和 workflow 路径必须在存档中存在
8. **风险评估**：标记网络权限、文件系统写权限和 3+ 环境变量

### 元数据模式

`agent.json` 必须符合严格的 Zod 模式：

- **必需字段**：`id`（kebab-case）、`name`、`version`（semver）、`summary`（10-300 字符）、`categories`（1-8 项）、`skills`（1-30，每个带 name/path/description）、`workflows`（1-20）、`hermes`（minVersion + importType）、`author`（name + 可选 website）
- **可选字段**：`permissions`（字符串数组）、`env`（环境变量定义）、`service`（可用性 + 类型）
- **路径安全**：所有文件路径必须相对、正斜杠、无 `..` 遍历

---

## 7. 下载票证系统（内部集成）

### 文件

| 文件 | 角色 |
|------|------|
| `src/server/storage/download-tickets.ts` | 票证创建、签名、验证、消费 |
| `src/server/storage/download-authorization.ts` | 智能体/交付下载授权检查 |
| `src/app/api/agents/[slug]/download/route.ts` | 智能体下载处理程序 |
| `src/app/api/orders/[id]/deliveries/[deliveryId]/download/route.ts` | 交付下载处理程序 |

### 架构

下载系统是存储和认证之间的内部集成：

1. 下载 API 路由首先 **授权** 请求（检查用户角色、订单所有权等）
2. 然后 **发放票证** — HMAC-SHA256 签名 payload，包含对象键、资源标识符和过期时间
3. 票证返回给客户端（当前内部使用；API 路由直接读取文件）

### 安全属性

- **HMAC-SHA256** 签名支持密钥轮换
- **时序安全** 签名比较
- **受众验证** 防止票证在不同端点间重用
- **一次性票证** 通过 `DownloadTicketUse` 数据库记录跟踪
- **5 分钟 TTL** 默认

---

## 8. Webhook 端点

### 支付 Webhook

**路由**：`POST /api/payments/webhook`

| 方面 | 详情 |
|------|------|
| 认证 | Stripe 签名验证（生产）或 JSON body（开发） |
| 处理 | 提供商无关：`adapter.parseWebhook()` -> `applyPaymentEvent()` 或 `applyRefundEvent()` |
| 幂等性 | `PaymentLedger` 表强制唯一 `providerEventId` |
| 响应 | 成功时 `{ ok, type, orderId, orderStatus, paymentStatus }`；失败时 `{ errors }` (400) |
