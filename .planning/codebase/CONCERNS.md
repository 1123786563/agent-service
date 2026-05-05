# 代码库问题、风险和改进领域

对 Hermes Agent Marketplace 代码库的分析，涵盖安全、数据完整性、错误处理、可扩展性、代码质量、缺失功能、配置和测试缺陷。

---

## 1. 安全问题

### 1.1 开发支付路由无认证 — **高危**

**文件：** `src/app/api/payments/dev/complete/route.ts`（第 5-46 行）

`GET /api/payments/dev/complete` 端点接受任何带有 `orderId` 和 `paymentReference` 查询参数的请求并触发支付完成。完全无认证。任何未认证访问者都可以通过猜测或枚举订单 ID（cuid 有一定可预测性）将任何订单标记为已支付。

```typescript
export async function GET(request: Request) {
  // 完全没有认证检查
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") ?? "";
```

**建议：** 至少将此路由置于 `NODE_ENV !== "production"` 检查之后，并添加共享密钥检查。考虑在生产构建中完全移除或要求管理员认证。

### 1.2 咨询 API 无认证 — **高危**

**文件：** `src/app/api/consultations/route.ts`（第 3-56 行）

`POST /api/consultations` 端点允许任何未认证请求创建咨询。虽然服务验证输入，但没有速率限制或认证，允许用任意邮箱垃圾式创建咨询。

**建议：** 添加认证或至少为匿名咨询创建添加 CAPTCHA/速率限制机制。

### 1.3 状态变更端点无 CSRF 保护 — **中危**

代码库任何地方都未使用 CSRF 令牌。所有接受表单提交的 POST 端点（`/api/auth/request-link`、`/api/orders/[id]/cancel`、`/api/orders/[id]/complete`、`/api/orders/[id]/dispute`、`/api/orders/[id]/deliveries`、`/api/creator/agents`）都存在跨站请求伪造漏洞。恶意站点可能诱骗已登录用户取消订单、上传交付或创建智能体。

Next.js 服务端动作通过 Origin 头有内置 CSRF 保护，但 `/api/*` 的 API 路由无法受益于此。

**建议：** 为所有接受表单数据的 `/api/*` POST 路由添加 CSRF 令牌验证，或将所有表单提交迁移到服务端动作。

### 1.4 无速率限制 — **中危**

任何端点都无速率限制。魔法链接认证流程（`src/app/api/auth/request-link/route.ts`）、咨询创建、支付 webhook 和文件上传端点都无保护。

- **认证**：攻击者可能向受害者邮箱滥发魔法链接请求或枚举有效邮箱。
- **Webhook**：重复 webhook 调用通过 `providerEventId` 去重，但每次仍会运行查找和验证。
- **上传**：除文件大小检查外，上传频率无限制。

**建议：** 为认证、咨询创建和文件上传端点添加按 IP 和按用户的速率限制中间件。

### 1.5 路由处理程序中文件上传大小无限制 — **中危**

**文件：** `src/app/api/creator/agents/route.ts`（第 23-33 行）
**文件：** `src/app/api/orders/[id]/deliveries/route.ts`（第 22-32 行）

文件上传接受任意文件大小的 `FormData`。虽然 `zip-validator.ts` 在应用层强制执行 `MAX_ZIP_BYTES`（25 MB），但在验证之前整个文件已缓冲到内存中。Next.js App Router 有默认 body 大小限制，但未明确配置。

对于交付上传，根本没有大小验证——可以上传任意大小的任何文件。

**建议：** 添加显式 `bodySizeLimit` 路由段配置或在缓冲前验证文件大小。在保存前验证交付文件大小。

### 1.6 开发下载票证密钥硬编码 — **低危**

**文件：** `src/server/storage/download-tickets.ts`（第 24-25 行）

```typescript
const DEFAULT_SECRET = "dev-download-ticket-secret";
const DEFAULT_KEY_ID = "dev-key-1";
```

如果生产环境中未设置 `DOWNLOAD_TICKET_SECRET`，下载票证将使用公开已知的密钥签名，允许伪造票证。

**建议：** 如果生产环境中未配置 `DOWNLOAD_TICKET_SECRET` 则启动失败，而不是回退到硬编码默认值。

### 1.7 `requireCreator` 检查白名单但不检查角色 — **低危**

**文件：** `src/server/auth/session.ts`（第 155-162 行）

`requireCreator()` 仅检查 `whitelistStatus === ACTIVE` 但不验证 `role === CREATOR`。管理页面（`src/app/admin/page.tsx`，第 20 行）单独检查 `user.role !== UserRole.ADMIN`。如果管理员的 `whitelistStatus` 也为 `ACTIVE`，则将通过 `requireCreator()`。虽然管理后台白名单激活在 `src/app/admin/actions.ts` 中设置 `role: CREATOR`，但如果管理员被手动给予 `ACTIVE` 白名单状态，可能允许意外的跨角色访问。

**建议：** 在 `requireCreator()` 中添加 `role` 检查或记录有意重叠。

### 1.8 评价提交无重复预防 — **低危**

**文件：** `src/server/agents/product-service.ts`（第 44-64 行）

`submitAgentPackageReview` 允许任何用户（包括 `userId: null` 的未认证用户）对同一包提交无限评价。无唯一约束或重复检查。

**建议：** 为评价添加 `(agentPackageId, userId)` 的唯一约束，或至少限制匿名评价的每次时间窗口。

---

## 2. 数据完整性

### 2.1 管理员操作中退款 + 争议解决非原子性 — **高危**

**文件：** `src/app/admin/actions.ts`（第 158-171 行）

```typescript
await requestRefund({...});
// 如果 resolveLatestOpenDisputeForOrder 在这里失败，退款已经发放
// 但争议保持开放
await resolveLatestOpenDisputeForOrder({...});
```

这两个操作未包装在数据库事务中。如果退款成功但争议解决失败（网络错误、并发修改），订单将应用退款但争议保持开放。后续解决争议的尝试可能触发第二次退款。

**建议：** 将两个操作包装在单个 `$transaction` 块中，或通过在继续前检查现有退款使争议解决具有幂等性。

### 2.2 支付账本去重非竞态安全 — **高危**

**文件：** `src/server/payments/ledger.ts`（第 58-98 行）

`recordPaymentEvent` 函数执行 `findUnique` 后跟 `create`，无事务或唯一约束强制。两个带有相同 `providerEventId` 的并发 webhook 传递都可能通过 `findUnique` 检查（返回 null），然后都尝试创建账本条目。第二个将抛出唯一约束冲突，但 `adapter.ts`（第 128 行）中的调用代码仅检查 `ledgerResult.duplicate`——抛出的约束错误会作为 400 错误向上传播到支付提供商，可能导致重试。

**建议：** 使用数据库级 `providerEventId` 唯一约束（模式第 345 行已存在）并专门捕获 `P2002` 错误，将其视为重复而不是让错误传播。

### 2.3 订单状态转换非原子性 — **中危**

**文件：** `src/server/orders/service.ts`（第 272-302、304-339 行等）

多个 `markServiceOrder*` 函数读取订单、验证状态，然后在单独操作中更新。在读取和写入之间，另一个并发请求可能改变订单状态。例如：

1. 请求 A 读取订单为 `PENDING_PAYMENT`
2. 请求 B 读取订单为 `PENDING_PAYMENT`
3. 请求 A 将其标记为 `IN_PROGRESS`（已支付）
4. 请求 B 将其标记为 `FAILED`

这将导致订单处于 `FAILED` 状态，尽管已收到付款。

**建议：** 使用条件更新（例如，`updateMany` 使用 `where: { id, status: expectedStatus }` 并检查 `count === 1`）或使用 `$transaction` 和可序列化隔离级别。

### 2.4 退款服务检查从未设置的 `order.workStartedAt` — **中危**

**文件：** `src/server/refunds/service.ts`（第 69-71 行）

```typescript
if (order.workStartedAt && !input.allowAfterWorkStarted) {
  throw new Error("Service order has already started");
}
```

模式中存在 `workStartedAt` 字段（第 314 行）但代码库中从未写入。该守卫实际上是死代码——因为 `workStartedAt` 始终为 null，永远无法触发。

**建议：** 当订单转换到 `IN_PROGRESS` 时设置 `workStartedAt`，或删除字段和守卫。

### 2.5 会话和 MagicLinkToken 积累无清理 — **中危**

**文件：** `src/server/auth/session.ts`、`src/server/auth/magic-link.ts`

过期的会话和已消费的魔法链接令牌永远不会被清理。随着时间推移，`Session` 和 `MagicLinkToken` 表将无限增长。过期会话仅在读取时过滤（第 143 行：`session.expiresAt < new Date()`）。

**建议：** 添加计划清理任务（cron 或数据库级 TTL）以清除过期会话和已消费/过期的魔法链接令牌。

### 2.6 DownloadTicketUse 记录积累 — **低危**

**文件：** `src/server/storage/download-tickets.ts`（第 137-170 行）

一次性下载票证记录插入 `DownloadTicketUse` 但永不清理。随着时间推移，此表将增长。

**建议：** 为过期票证使用记录添加定期清理。

---

## 3. 错误处理

### 3.1 路由间错误响应不一致 — **中危**

API 路由错误响应不一致：
- 一些返回带 `{ errors: [message] }` 的 JSON 和 400 状态（例如 `/api/consultations/route.ts`）
- 一些在认证失败时重定向到登录（例如 `/api/orders/[id]/cancel/route.ts`）
- 一些使用 303 状态重定向（例如 `/api/orders/[id]/pay/route.ts`）
- 服务端动作抛出在 UI 中显示为 `NEXT_ERROR` 的错误

不一致使客户端难以统一处理错误。

**建议：** 建立一致的错误响应契约。对于 API 路由，始终返回带标准错误形状的 JSON。对于表单提交，始终使用错误参数重定向。

### 3.2 清理路径中静默错误吞噬 — **中危**

多个文件在清理操作中静默捕获并丢弃错误：

- `src/server/deliveries/service.ts` 第 253-257 行：DB 失败后的文件清理
- `src/server/agents/package-service.ts` 第 367-370 行：包创建失败后的文件清理
- `src/server/auth/session.ts` 第 122-126 行：Cookie 失败后会话删除
- `src/server/auth/magic-link.ts` 第 142-157 行：已消费魔法链接的回滚

虽然"尽力清理"是合理的模式，但这些都不记录清理失败。孤立文件和过时记录可能静默积累。

**建议：** 至少将清理失败记录到监控系统，以便操作员检测和清理孤立资源。

### 3.3 内部错误消息暴露给用户 — **低危**

**文件：** `src/app/api/consultations/route.ts`（第 47 行）

```typescript
const message = error instanceof Error ? error.message : "Could not create consultation";
```

服务层验证的内部错误消息（例如"此咨询不属于此提供商"）直接传递给客户端。虽然这些消息是信息性的，但可能暴露内部系统细节。

**建议：** 在返回给客户端前将内部错误消息映射为用户友好消息。

---

## 4. 可扩展性

### 4.1 管理页面 N+1 查询 — **高危**

**文件：** `src/app/admin/page.tsx`（第 17-165 行）

管理后台执行至少 **8 个独立数据库查询** 来渲染单个页面：
1. `agentPackage.findMany` 包含 consultations/orders（第 24 行）
2. `agentPackage.count` 发布数（第 40 行）
3. `agentPackage.aggregate` 下载总和（第 44 行）
4. `consultation.count`（第 50 行）
5. `serviceOrder.count` x2（第 51-56 行）
6. `consultation.findMany` 包含（第 58 行）
7. `serviceOrder.findMany` x3（第 66-114 行）
8. `user.findMany` 包含（第 125 行）

带有嵌套关系（例如，带 consultations 的包包括 orders）的重型包含将产生大型 JOIN。随着数据集增长，此页面将变得非常慢。

**建议：** 用单个聚合查询或数据库视图替换多个查询。为所有列表查询添加分页。

### 4.2 分析页面将所有数据加载到内存 — **高危**

**文件：** `src/app/admin/analytics/page.tsx`（第 17-96 行）

分析页面将所有已发布包与嵌套 consultations/orders、所有已完成付费订单与结算明细、以及所有创作者与其包/订单加载到内存。无分页，无数据库级聚合。

转换指标在加载所有数据后用 JavaScript 计算：

```typescript
packages.reduce((sum, pkg) => sum + pkg.downloadCount, 0);
```

**建议：** 使用 SQL `SUM`、`COUNT` 和 `GROUP BY` 将聚合推送到数据库级别。添加分页和日期范围过滤器。

### 4.3 产品推荐加载所有包 — **中危**

**文件：** `src/server/agents/product-service.ts`（第 95-155 行）

`listRecommendedAgentPackages` 将**所有**已发布包与其所有 consultations、orders、reviews 和 favorites 加载到内存，然后在 JavaScript 中计算分数和排序。`take` 选项仅在加载所有内容后应用。

**建议：** 在写入时计算推荐分数（例如在包发布时或收到新评价时）并存储在数据库中，然后查询时使用 `ORDER BY score DESC LIMIT N`。

### 4.4 列表端点无分页 — **中危**

多个页面加载所有记录无分页：
- `src/app/creator/consultations/page.tsx` 第 26 行：所有 consultations
- `src/app/creator/orders/page.tsx` 第 28 行：所有订单
- `src/app/account/orders/page.tsx` 第 18 行：买家的所有订单
- `src/app/admin/whitelist/page.tsx` 第 15 行：所有用户
- `src/app/creators/[id]/page.tsx` 第 13 行：创作者的所有包

随着数据增长，这些页面将变慢且内存密集。

**建议：** 为所有列表视图添加基于游标或偏移的分页。

### 4.5 内存文件操作 — **低危**

**文件：** `src/server/storage/local-provider.ts`（第 120 行）

文件完全在内存中写入和读取（`Buffer`）。对于大上传，这限制并发并增加内存压力。`src/server/storage/provider.ts` 中的 `readStreamToBuffer` 函数（第 36-44 行）也完全缓冲流。

**建议：** 对于生产环境，使用流式文件操作，特别是支持原生流的 S3 存储。

---

## 5. 代码质量

### 5.1 路由中重复认证检查 — **中危**

**文件：** `src/app/api/creator/agents/route.ts`（第 7-21 行）
**文件：** `src/app/api/orders/[id]/deliveries/route.ts`（第 6-20 行）

两个路由都调用 `getCurrentUser()` 检查白名单状态，然后立即调用 `requireCreator()` 再次调用 `getCurrentUser()`——导致**同一用户两次数据库查询**：

```typescript
const currentUser = await getCurrentUser();
if (!currentUser) { redirect("/login"); }
if (currentUser.whitelistStatus !== WhitelistStatus.ACTIVE) { return 403; }
const user = await requireCreator(); // 再次调用 getCurrentUser()
```

**建议：** 直接使用 `requireCreator()`（已处理 null 检查）或重构以传递已获取的用户。

### 5.2 重复的 `inferMimeType` 函数 — **低危**

**文件：** `src/server/storage/local-provider.ts`（第 60-76 行）
**文件：** `src/server/storage/s3-provider.ts`（第 39-55 行）

`inferMimeType` 函数在两个存储提供商中完全重复。

**建议：** 提取到共享工具模块。

### 5.3 重复的 `normalizeAsciiFileName` / `trimTrailingSlash` — **低危**

`trimTrailingSlash` 在 `local-provider.ts`（第 12 行）和 `s3-provider.ts`（第 21 行）中重复。文件名规范化逻辑分散在两个提供商中。

**建议：** 将共享工具提取到公共模块。

### 5.4 不一致的 `as` 类型断言使用 — **低危**

**文件：** `src/server/refunds/service.ts`（第 200 行）

```typescript
if (existingRefund?.providerEventId === event.providerEventId) {
  return existingRefund;
}
```

代码使用 `existingRefund?.providerEventId === event.providerEventId` 进行去重，但第 185-192 行的 `OR` 查询按 `providerEventId` 或 `providerRefundId` 匹配。如果匹配仅通过 `providerRefundId`（而 `providerEventId` 不同），第 200 行的去重检查将失败，可能创建重复退款条目。

**建议：** 确保去重逻辑与查询逻辑完全匹配。

### 5.5 魔法数字常量 — **低危**

- `src/server/auth/magic-link.ts` 第 14 行：`MAGIC_LINK_MINUTES = 15` — 合理但未记录
- `src/server/auth/session.ts` 第 7 行：`SESSION_DAYS = 30` — 合理但未记录
- `src/server/storage/download-tickets.ts` 第 23 行：`DEFAULT_TICKET_TTL_SECONDS = 5 * 60` — 合理
- `src/server/agents/package-service.ts` 第 143 行：`Math.min(..., 20) * 0.5` — 评分公式未记录
- `src/server/agents/package-service.ts` 第 139-143 行：推荐权重（0.35、0.3、0.25）— 未记录

**建议：** 记录评分权重和时间值（TTL）的理由。

---

## 6. 缺失功能/不完整实现

### 6.1 无登出功能 — **中危**

不存在销毁会话的端点或动作。会话在 30 天后过期，但用户无法明确结束会话。会话记录和 Cookie 保持到过期。

**建议：** 添加删除会话记录并清除 Cookie 的登出端点。

### 6.2 无生产邮件提供商 — **中危**

**文件：** `src/server/mail/dev-mailer.ts`

唯一的邮件实现写入 `.jsonl` 文件。不存在生产邮件提供商（例如 SendGrid、Resend、Postmark）。生产中的魔法链接邮件将静默写入磁盘而不是发送。

**建议：** 实现通过环境配置选择的发送实际邮件的生产邮件适配器。

### 6.3 密码/角色更改时无会话撤销 — **低危**

当管理员更改用户角色时（例如通过 `src/app/admin/actions.ts` 中的 `activateCreatorWhitelist`），现有会话不会被撤销。角色从 ADMIN 更改为 CREATOR 的用户可能继续使用具有管理员权限的旧会话。

**建议：** 当用户角色更改时使该用户的所有会话失效。

### 6.4 无 Webhook 幂等性密钥存储 — **低危**

**文件：** `src/server/payments/ledger.ts`

存储了 `idempotencyKey` 但从未用于去重。去重仅依赖 `providerEventId`。如果提供商发送具有不同事件 ID 的相同逻辑事件，将被处理两次。

**建议：** 当存在时，添加按 `idempotencyKey` 的去重，除了 `providerEventId`。

### 6.5 智能体市场无分页 — **低危**

**文件：** `src/app/agents/page.tsx`（第 27 行）

`listPublishedAgentPackages` 将所有已发布包加载到内存，无分页。随着市场增长，这将变成性能问题。

### 6.6 无争议证据上传端点 — **低危**

模式中的 `DisputeEvidence` 模型（第 428-443 行）有 `attachmentObjectKey` 和 `attachmentFileName` 字段，`createDispute` 服务函数（第 80-91 行）接受证据，但没有上传证据附件的 API 路由。争议路由（`src/app/api/orders/[id]/dispute/route.ts`）始终用硬编码原因创建争议，无证据。

**建议：** 添加证据上传端点或服务端动作。

---

## 7. 配置与部署

### 7.1 未使用的环境变量 `SESSION_SECRET` — **低危**

**文件：** `.env.example` 第 3 行

`.env.example` 列出了 `SESSION_SECRET="replace-with-a-32-byte-secret"` 但代码库中从未引用此变量。会话使用 SHA-256 哈希的不透明令牌加密，而非密钥加密。

**建议：** 从 `.env.example` 中删除误导性变量或实现会话令牌加密。

### 7.2 无显式 Next.js Body 大小限制 — **低危**

Next.js 配置（`next.config.mjs`）中未设置显式请求 body 大小限制。默认限制未记录，可能导致大文件（如交付上传）被静默拒绝。

**建议：** 在 `next.config.mjs` 中为文件上传端点添加显式 `experimental.bodySizeLimit`。
