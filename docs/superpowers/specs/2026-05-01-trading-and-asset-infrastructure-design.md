# Hermes-agent 交易与资产基础设施设计

日期：2026-05-01

## 目标

在现有 Hermes-agent marketplace 与服务交易 MVP 之上，建设下一阶段的统一基础设施层，覆盖四类核心能力：

- 真实支付 provider 接入
- 私有对象存储与签名下载
- 自动退款与仲裁
- 服务商结算出款集成

这一阶段不再把上述能力当成零散功能处理，而是收敛成统一的 `交易与资产基础设施层`，为现有市场、订单、交付和后台运营提供稳定底座。

## 设计原则

- `权限先于文件`：任何 ZIP 或交付物访问都必须先经过授权，再进入下载链路。
- `支付状态单一事实源`：订单状态由平台自身系统控制，provider 事件只驱动状态变更。
- `退款与结算基于可审计事实`：退款、争议和结算都依赖明确的账务事件，不能只依赖页面状态。
- `适配器优先`：存储和支付都先抽象接口，再落地本地实现、S3 兼容实现或真实支付 provider。
- `分阶段上线`：每一阶段都要能独立交付，不把资金、文件和出款风险揉成一次改动。
- `敏感操作必须可追踪`：下载票据、支付、退款、仲裁、结算都要记录操作者、目标、结果和时间。
- `密钥可轮换`：HMAC secret、webhook secret、对象存储凭证都必须来自环境变量，并在数据结构中预留 `keyId`。

## 范围

### 本阶段包含

- 统一 ZIP 与交付物的受控下载模型
- 存储 provider 抽象与本地/S3 兼容实现边界
- 真实支付 provider 抽象、事件标准化与 webhook 幂等处理
- 退款实体、争议实体、后台仲裁动作
- 结算明细与结算批次模型
- 面向后台和创作者工作台的基础运营视图

### 本阶段不包含

- 多支付 provider 同时在线切换
- 自动化仲裁规则引擎
- 多级分账与税务系统
- 自动 payout 到银行卡或钱包的复杂财务集成
- 完整总账或会计系统

## 总体架构

统一基础设施层分成四个连续子阶段：

### Phase 5A：资产访问基础设施

- 抽象 `StorageProvider`
- 抽象 `DownloadTicketService`
- ZIP 与交付物统一采用短时效签名票据下载
- 保留本地存储实现，新增 `S3CompatibleStorageProvider` 骨架

### Phase 5B：真实支付基础设施

- 抽象 `PaymentProvider`
- 保留 `DevPaymentProvider`
- 新增真实支付 provider 实现
- 统一支付事件模型与 webhook 处理

### Phase 5C：退款与仲裁基础设施

- 把当前简单争议状态升级为独立 `Dispute` 实体
- 把退款升级为独立 `Refund` 实体
- 后台可执行全额退款、部分退款、驳回、恢复流程

### Phase 5D：服务商结算出款基础设施

- 抽象 `SettlementLine` 与 `SettlementBatch`
- 计算可结算金额
- 支持批次化出款管理
- 第一版支持人工打款回填，后续再接自动 payout

## 横向安全与审计边界

以下能力横跨 5A 到 5D，不属于某一个子阶段的局部细节。

### AuditLog

新增统一审计日志，用于记录敏感操作：

- `actorId`
- `actorRole`
- `action`
- `targetType`
- `targetId`
- `beforeSnapshot`
- `afterSnapshot`
- `ipAddress`
- `userAgent`
- `createdAt`

必须进入审计日志的动作：

- 签发下载票据
- 下载私有交付物
- 创建支付 session
- 处理 provider webhook
- 发起争议
- 仲裁争议
- 创建退款
- 处理退款 webhook
- 创建或提交结算批次
- 标记批次已出款

### 密钥与配置

敏感配置必须来自环境变量：

- `DOWNLOAD_TICKET_SECRET`
- `DOWNLOAD_TICKET_ACTIVE_KEY_ID`
- `PAYMENT_WEBHOOK_SECRET`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`

下载票据和 webhook 处理都要预留 `keyId`。当前实现支持 active key 与 previous key 同时校验，轮换窗口结束后再移除 previous key。

### 速率限制与幂等

以下入口需要基础速率限制或幂等保护：

- 下载票据签发
- 下载文件
- 支付 session 创建
- webhook 处理
- 退款创建
- 争议创建

第一版可以在应用层实现轻量保护。支付、退款、webhook 必须使用幂等 key 或 provider event id 防重放。

## Phase 5A：资产访问基础设施

### 目标

把当前文件访问从“本地直读/路由直接输出”升级成“授权 -> 签发票据 -> 校验票据 -> 存储回源”的统一模型，同时为未来对象存储迁移做好接口边界。

### 核心组件

#### StorageProvider

统一存储接口，业务层不再直接依赖本地路径：

- `putObject`
- `getObjectStream`
- `deleteObject`
- `buildObjectKey`

第一版实现：

- `LocalStorageProvider`
- `S3CompatibleStorageProvider` 骨架

#### DownloadTicketService

负责签发短时效下载票据，建议默认 5 到 10 分钟有效。票据至少包含：

- `resourceType`：`agent_zip` / `delivery_asset`
- `resourceId`
- `objectKey`
- `actorScope`：匿名市场用户 / 买家 / 服务商 / 管理员
- `actorId`：登录用户 id，匿名下载可为空
- `sessionId`：匿名或登录会话标识，用于降低票据转发风险
- `resourceVersion`：资源版本或更新时间戳，用于资源变更后让旧票据失效
- `jti`：票据唯一 id，用于审计和可选单次使用
- `keyId`：签名密钥 id，用于密钥轮换
- `audience`：允许使用票据的下载路由
- `expiresAt`

第一版采用服务端 HMAC 签名，无需引入外部依赖。

交付物票据默认绑定 `actorId` 和 `sessionId`。ZIP 公开下载允许匿名票据，但仍要绑定 `sessionId` 并记录审计日志。第一版不强制所有票据单次使用，但数据结构要支持后续把高风险资源切换为单次使用。

#### DownloadAuthorizationService

负责判断谁可以获取下载票据：

- 已发布智能体 ZIP：允许匿名用户获取下载票据
- 未发布智能体 ZIP：只允许作者和管理员
- 交付物：只允许买家、服务商、管理员

这个服务只负责授权，不直接读文件。

授权判断还必须检查资源状态：

- 已下架或归档的智能体不能继续签发匿名 ZIP 票据
- 订单取消后不能继续签发交付物票据
- 订单进入争议后，买家和服务商仍可访问既有交付物，管理员可按仲裁需要访问
- 资源删除或替换后，旧 `resourceVersion` 的票据应失效

### 下载链路

```text
请求下载
→ 业务授权
→ 签发 download ticket
→ 下载路由校验 ticket
→ StorageProvider 回源
→ 返回文件流
```

### 数据模型调整

数据库中的文件字段逐步从 URL 模型转向对象模型：

- `objectKey`
- `fileName`
- `mimeType`
- `byteSize`
- `checksum`
- `storageProvider`
- `bucket`
- `contentDisposition`
- `uploadedBy`
- `uploadedAt`
- `deletedAt`

当前 `zipFileUrl`、`fileUrl` 保留作兼容展示和过渡，不再作为长期资源标识。

`checksum` 用于上传后完整性校验和迁移校验。`contentDisposition` 必须由平台生成，不能直接信任用户上传文件名，避免响应头注入和下载文件名异常。

### 实现策略

这一阶段采用 `A -> B` 两段式设计：

- 第一版：应用层签发票据，应用下载路由回源本地存储并输出文件
- 第二版：切换到真正的对象存储预签名 URL，只替换底层 provider 行为，不改变业务授权模型

## Phase 5B：真实支付基础设施

### 目标

在现有 dev payment flow 上引入真实支付能力，同时保留本地可测试性和现有订单状态模型。

### 核心组件

#### PaymentProvider

统一支付接口：

- `createCheckoutSession(order)`
- `parseWebhook(request)`
- `refundPayment(refundRequest)`，先定义接口，后续在 Phase 5C 完整接入

第一版实现：

- `DevPaymentProvider`
- 一个真实支付 provider，例如 Stripe

#### PaymentEventService

负责把 provider webhook 事件标准化为平台内部事件：

- `payment.succeeded`
- `payment.failed`
- `payment.cancelled`
- `refund.succeeded`
- `refund.failed`

平台内部业务只消费标准事件，不直接散落 provider 原始事件结构。

#### PaymentLedger

记录最小支付事实，用于幂等、防重放和对账：

- `orderId`
- `provider`
- `providerPaymentId`
- `providerCheckoutSessionId`
- `providerEventId`
- `amount`
- `amountMinor`
- `currency`
- `paymentStatus`
- `failureReason`
- `idempotencyKey`
- `lastWebhookEventId`
- `lastWebhookReceivedAt`
- `rawEventDigest`
- `rawEventStoredAt`

### 状态模型

订单状态继续保留业务语义：

- `PENDING_PAYMENT`
- `IN_PROGRESS`
- `DELIVERED`
- `COMPLETED`
- `DISPUTED`
- `CANCELLED`

支付状态独立表达财务语义：

- `UNPAID`
- `PAID`
- `FAILED`
- `CANCELLED`
- 后续扩展 `REFUNDED`
- 后续扩展 `PARTIALLY_REFUNDED`

### 关键约束

- 订单状态和支付状态不能混成一个字段
- webhook 必须做幂等处理
- 成功页前端跳转不能作为支付成功依据
- `DevPaymentProvider` 必须保留，作为本地和测试环境的基线
- provider event id 必须唯一入库，重复 webhook 只能返回已处理结果
- 金额校验必须使用最小货币单位，不能用浮点数比较
- `payment.cancelled` 映射为 `PaymentStatus.CANCELLED`，订单保持 `PENDING_PAYMENT` 或由买家/系统取消订单，不能推进到已支付

## Phase 5C：退款与仲裁基础设施

### 目标

把当前简单的“争议中”状态升级为完整的争议与退款流程，同时把自动退款能力限制在明确、可审计的规则之内。

### 核心实体

#### Dispute

记录争议过程：

- `orderId`
- `openedBy`：买家 / 服务商 / 管理员
- `reason`
- `status`：`OPEN` / `UNDER_REVIEW` / `RESOLVED`
- `resolutionType`：`REFUND_FULL` / `REFUND_PARTIAL` / `REJECTED` / `RETURN_TO_PROGRESS` / `RETURN_TO_DELIVERED`
- `resolutionNote`
- `resolvedBy`
- `resolvedAt`
- `responseDueAt`
- `visibility`

#### DisputeEvidence

记录争议证据：

- `disputeId`
- `submittedBy`
- `note`
- `attachmentObjectKey`
- `attachmentFileName`
- `visibleToBuyer`
- `visibleToProvider`
- `createdAt`

#### Refund

记录实际退款动作：

- `orderId`
- `disputeId`
- `provider`
- `paymentReference`
- `amount`
- `amountMinor`
- `currency`
- `status`：`PENDING` / `SUCCEEDED` / `FAILED`
- `providerRefundId`
- `providerEventId`
- `failureReason`
- `requestedBy`
- `requestedAt`
- `completedAt`

### 自动规则边界

只做保守自动化：

- 未支付订单取消：不涉及退款
- 已支付但未开工，且平台/服务商同意取消：允许自动全额退款

其余情况先走管理员仲裁触发退款，不做开放式自动退款。

`未开工` 必须是系统可判断的事实。建议新增 `workStartedAt`，由服务商在开始履约时显式标记，或在首次上传交付物时自动补齐。只有 `workStartedAt` 为空、订单未交付且无开放争议时，才允许低风险自动全额退款。

### 状态关系

- 订单进入争议时：`ServiceOrder.status = DISPUTED`
- 仲裁后可能恢复到：
  - `IN_PROGRESS`
  - `DELIVERED`
- 也可能进入取消或完成后的退款结果

这里有三个独立维度：

- `Dispute`：过程
- `Refund`：财务动作
- `ServiceOrder`：业务结果

三者必须分离，避免状态污染。

## Phase 5D：服务商结算出款基础设施

### 目标

先把可结算金额和批次管理做对，再考虑自动出款。第一版重点是“结算管理”，不是“自动 payout”。

### 核心实体

#### SettlementLine

单笔订单的可结算记录：

- `orderId`
- `providerId`
- `grossAmount`
- `grossAmountMinor`
- `feeRate`
- `feePolicySnapshot`
- `platformFeeAmount`
- `platformFeeAmountMinor`
- `netAmount`
- `netAmountMinor`
- `refundDeductionAmount`
- `adjustmentAmount`
- `currency`
- `status`：`PENDING` / `LOCKED` / `SETTLED`
- `eligibleAt`
- `holdUntil`
- `lockedAt`
- `settledAt`

生成条件：

- 订单 `COMPLETED`
- 支付状态 `PAID`
- 无未决争议
- 无待处理退款

#### SettlementBatch

一次实际出款的批次：

- `providerId`
- `totalAmount`
- `totalAmountMinor`
- `currency`
- `status`：`DRAFT` / `SUBMITTED` / `PAID_OUT` / `FAILED`
- `payoutReference`
- `submittedAt`
- `paidOutAt`
- `lineSnapshot`

### 处理流程

```text
订单完成
→ 生成或刷新 SettlementLine
→ 管理员确认批次
→ 平台线下或 provider 打款
→ 回填 payoutReference
→ 标记批次和订单已结算
```

### 关键约束

- 有开放争议的订单不能进入可结算
- 有未完成退款的订单不能进入可结算
- 退款后可结算金额必须能重新计算
- 结算入批次后需要锁定快照，避免金额漂移
- 已提交批次不能直接编辑金额，只能通过调整记录或新批次修正
- 已结算后发生退款时，不能改历史批次，应生成负向调整或从后续结算中扣减

当前已有的 `settledAt` 与 `settlementReference` 可继续保留作兼容展示，但长期会被完整结算模型替代。

## 风险与控制点

### Phase 5A

- 旧下载链接兼容风险
- 本地开发与测试不能被新签名链路拖慢

### Phase 5B

- webhook 幂等处理错误会导致重复入账
- provider 事件与本地订单状态不一致

### Phase 5C

- 自动退款规则过宽会引入资金风险
- 争议、退款、订单状态耦合过深会导致维护困难

### Phase 5D

- 结算金额口径不一致
- 退款后历史结算追溯困难

## 推荐实施顺序

固定顺序如下：

1. `Phase 5A` 资产访问基础设施
2. `Phase 5B` 真实支付基础设施
3. `Phase 5C` 退款与仲裁基础设施
4. `Phase 5D` 结算出款基础设施

原因：

- 没有统一文件访问层，交付资产边界不稳
- 没有真实支付，退款能力不成立
- 没有退款与争议收敛，结算金额不可信
- 没有结算模型，出款不可控

## 第一批任务建议

第一批只做 `Phase 5A`，并拆成以下最小单元：

1. 新增 `StorageProvider` 抽象
2. 数据模型补 `objectKey`、`fileName`、`mimeType`、`byteSize`、`checksum`、`storageProvider`
3. 对既有 ZIP 和交付物做 backfill，保留旧 URL 字段兼容
4. 把现有本地 ZIP/交付物存储迁移到 provider 接口后面
5. 新增 `DownloadTicketService` 与 HMAC 签名票据
6. 新增 `DownloadAuthorizationService`
7. 改 ZIP 下载路由为统一票据链路
8. 改交付物下载路由为统一票据链路
9. 加审计日志和基础速率限制
10. 补测试：过期、篡改、权限、资源状态、成功下载
11. 预留 `S3CompatibleStorageProvider` 骨架，但这一轮不强接云

## 验收标准

### Phase 5A 验收

- ZIP 下载和交付物下载都不再依赖裸文件路径
- 非授权用户不能获取有效下载票据
- 票据过期后下载失败
- 篡改票据后下载失败
- 票据被用于错误路由时下载失败
- 资源下架、取消或替换后旧票据失效
- 下载动作产生审计日志
- 本地开发与测试环境无需云对象存储也能通过完整下载链路

### Phase 5B 验收

- `dev` 与真实支付 provider 可以通过统一接口工作
- webhook 重放不会重复推进订单状态
- 支付成功、失败、取消都能稳定映射到平台内部事件
- webhook 金额、币种和订单归属校验失败时不会推进订单
- 支付和 webhook 处理产生审计日志

### Phase 5C 验收

- 争议有独立记录
- 退款有独立记录
- 管理员可以执行全额退款、部分退款、驳回
- 自动退款只覆盖定义明确的低风险场景
- 争议证据和仲裁动作有审计记录
- 退款成功或失败不会让订单、争议和结算状态出现矛盾

### Phase 5D 验收

- 订单能生成可结算明细
- 后台能按服务商生成结算批次
- 退款和争议中的订单不会进入错误的结算状态
- 批次提交后金额和订单清单不可被静默修改
- 已结算后退款通过调整记录处理，不改写历史批次
