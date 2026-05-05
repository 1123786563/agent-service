# 结构 — Hermes Agent Marketplace

项目的完整目录和文件参考。

---

## 根目录

```
/Users/yongjunwu/trea/saas-idea/
├── .claude/                          # Claude Code 本地设置
│   └── settings.local.json
├── .data/                            # 本地开发数据
│   └── deliveries/                   # 本地交付文件存储
│       └── handoff-*.txt             # 示例交付交接文件
├── .env.example                      # 环境变量模板
├── .gitignore
├── docs/                             # 阶段文档
│   ├── phase-1-operator-guide.md     # 阶段 1：市场基础
│   ├── phase-2-operator-guide.md     # 阶段 2：咨询和订单
│   ├── phase-3-operator-guide.md     # 阶段 3：交付
│   ├── phase-4-operator-guide.md     # 阶段 4：市场指标
│   ├── phase-5-operator-guide.md     # 阶段 5：结算
│   ├── phase-6-operator-guide.md     # 阶段 6：操作指南
│   └── superpowers/                  # 规划文档
│       ├── plans/                    # 各阶段实施计划
│       └── specs/                    # 设计规范
├── eslint.config.mjs                 # ESLint flat 配置
├── next-env.d.ts                     # Next.js TypeScript 声明
├── next.config.mjs                   # Next.js 配置（最小/默认）
├── package.json                      # 依赖和脚本
├── playwright.config.ts              # E2E 测试配置（Playwright）
├── prisma/                           # 数据库模式和迁移
│   ├── schema.prisma                 # 完整数据库模式（20+ 模型）
│   ├── seed.ts                       # 从 ADMIN_EMAILS 播种管理员用户
│   └── migrations/                   # 增量迁移历史
│       ├── 20260429162510_init_marketplace/
│       ├── 20260429165018_harden_schema_indexes/
│       ├── 20260430113239_phase2_consultations_orders/
│       ├── 20260430120313_phase3_deliveries/
│       ├── 20260430135134_phase4_marketplace_metrics/
│       ├── 20260430171608_phase5_settlement_tracking/
│       ├── 20260503063052_phase5a_asset_metadata/
│       ├── 20260503064500_phase5b_payment_ledger/
│       ├── 20260503072000_phase5c_disputes_refunds/
│       ├── 20260503073500_phase5d_settlement_batches/
│       └── 20260505153000_phase7_production_product_gaps/
├── scripts/
│   └── migrate-assets-to-object-storage.ts  # 本地到 S3 迁移工具
├── src/                              # 应用源代码
│   ├── app/                          # Next.js App Router 页面和 API
│   ├── components/                   # 共享 React 组件
│   ├── server/                       # 后端服务层
│   └── test/                         # 测试 fixtures
├── tests/                            # 测试套件
│   ├── server/                       # 服务端单元测试
│   └── e2e/                          # 端到端测试（Playwright）
├── tsconfig.json                     # TypeScript 配置
└── vitest.config.ts                  # Vitest 单元测试配置
```

---

## `src/app/` — 页面和 API 路由

### 页面路由

```
src/app/
├── layout.tsx                    # 根布局：头部导航（zh-CN）、主容器
├── page.tsx                      # 主页：英雄区，带到 /agents 和 /creator 的链接
├── globals.css                   # 全局样式（CSS 自定义属性、工具类）
├── login/
│   └── page.tsx                  # 登录页面：邮箱表单、魔法链接状态消息
├── agents/
│   ├── page.tsx                  # 智能体市场：搜索、筛选、排序、AgentCard 网格
│   └── [slug]/
│       └── page.tsx              # 智能体详情页面：渲染 AgentDetail 组件
├── creators/
│   └── [id]/
│       └── page.tsx              # 公开创作者资料：已发布包、统计
├── account/
│   └── orders/
│       └── page.tsx              # 买家订单列表：支付、取消、完成、争议、下载
├── creator/
│   ├── page.tsx                  # 创作者后台：包列表、统计、链接
│   ├── actions.ts                # 服务端动作：createConsultationOrderAction
│   ├── agents/
│   │   └── new/
│   │       └── page.tsx          # 上传新智能体 ZIP 表单
│   ├── consultations/
│   │   └── page.tsx              # 创作者咨询列表：管理范围、创建订单
│   └── orders/
│       └── page.tsx              # 创作者订单列表：上传交付、争议、结算状态
├── admin/
│   ├── page.tsx                  # 管理员后台：包、订单、争议、结算
│   ├── actions.ts                # 服务端动作：白名单、归档、重置、解决、退款、结算
│   ├── whitelist/
│   │   └── page.tsx              # 用户白名单管理
│   └── analytics/
│       └── page.tsx              # 运营分析：漏斗、转换、创作者排名
├── docs/
│   └── page.tsx                  # 文档：ZIP 结构、导入清单、风险指南
└── services/
    └── page.tsx                  # 服务概览：定制、部署、培训、集成
```

### API 路由

```
src/app/api/
├── auth/
│   ├── request-link/
│   │   └── route.ts              # POST：发送魔法链接邮件，重定向到 /login?sent=1
│   └── consume/
│       └── route.ts              # GET：消费魔法链接令牌、设置会话、重定向到 /creator
├── creator/
│   └── agents/
│       └── route.ts              # POST：上传智能体 ZIP（multipart/form-data）、验证、发布
├── agents/
│   └── [slug]/
│       └── download/
│           └── route.ts          # GET：通过票证认证和审计日志下载智能体 ZIP
├── consultations/
│   └── route.ts                  # POST：创建新咨询（JSON body）
├── orders/
│   └── [id]/
│       ├── pay/
│       │   └── route.ts          # POST：发起支付结账会话
│       ├── cancel/
│       │   └── route.ts          # POST：取消未支付待处理订单（仅买家）
│       ├── complete/
│       │   └── route.ts          # POST：接受最新交付、标记订单完成（买家）
│       ├── dispute/
│       │   └── route.ts          # POST：开启订单争议（买家/提供商/管理员）
│       └── deliveries/
│           ├── route.ts          # POST：上传交付文件（仅提供商）
│           └── [deliveryId]/
│               └── download/
│                   └── route.ts  # GET：通过认证 + 一次性票证下载交付资产
└── payments/
    ├── webhook/
    │   └── route.ts              # POST：处理来自提供商的支付/退款 webhook
    └── dev/
        └── complete/
            └── route.ts          # GET：开发模式支付完成（模拟 webhook）
```

---

## `src/server/` — 后端服务层

```
src/server/
├── db.ts                         # PrismaClient 单例（globalThis 缓存用于开发 HMR）
│
├── agents/                       # 智能体包领域
│   ├── package-service.ts        # 核心 CRUD：从 ZIP 创建、列出、按 slug 获取、读取 ZIP、完整性评分、转换指标
│   ├── product-service.ts        # 产品功能：收藏、评价、导入说明、推荐引擎
│   ├── metadata-schema.ts        # agent.json 验证的 Zod 模式（id、name、version、skills、workflows、permissions、env、author、service）
│   └── zip-validator.ts          # 低级 ZIP 验证：中央目录解析、路径安全、文件数量/大小限制、危险扩展检测
│
├── orders/                       # 订单领域
│   └── service.ts                # 创建、支付、失败、取消、争议、解决服务订单；按买家/提供商列出
│
├── payments/                     # 支付领域
│   ├── adapter.ts                # PaymentProvider 接口、提供商工厂、applyPaymentEvent()
│   ├── stripe-adapter.ts         # StripePaymentProvider：结账会话、webhook 解析、退款
│   ├── dev-adapter.ts            # 开发模式适配器：本地支付模拟、无真实 API 调用
│   ├── ledger.ts                 # 对 PaymentLedger 表的幂等支付事件记录
│   └── webhook-events.ts         # NormalizedPaymentEvent / NormalizedRefundEvent 类型定义
│
├── consultations/                # 咨询领域
│   └── service.ts                # 创建、更新状态机、按提供商列出、按 ID 获取
│
├── deliveries/                   # 交付领域
│   └── service.ts                # 创建交付 + 标记订单已交付、列出、获取用于下载、接受最新
│
├── disputes/                     # 争议领域
│   └── service.ts                # 创建争议 + 证据、通过管理员操作解决
│
├── refunds/                      # 退款领域
│   └── service.ts                # 通过提供商请求退款、应用退款 webhook 事件、更新结算
│
├── settlements/                  # 结算领域
│   └── service.ts                # 构建明细、提交批次、标记已支付、退款调整
│
├── audit/                        # 审计日志
│   └── service.ts                # 只追加审计轨迹（角色、操作、目标、前后快照）
│
├── auth/                         # 认证
│   ├── magic-link.ts             # 请求/消费魔法链接令牌、邮箱验证、错误类型
│   └── session.ts                # 会话 CRUD、Cookie 管理、getCurrentUser()、requireCreator()、requireAdmin()
│
├── storage/                      # 文件存储
│   ├── provider.ts               # StorageProvider 接口、StorageScope、StoredObject、readStreamToBuffer()
│   ├── factory.ts                # 根据 STORAGE_PROVIDER 环境变量选择本地或 S3 提供商
│   ├── local-provider.ts         # LocalStorageProvider：基于文件系统的 put/get/delete（清理名称）
│   ├── s3-provider.ts            # S3CompatibleStorageProvider：AWS SDK S3（路径/虚拟主机样式 URL）
│   ├── local-storage.ts          # 智能体 ZIP 便捷包装器（保存、读取、删除）
│   ├── local-delivery-storage.ts # 交付文件便捷包装器（保存、读取、删除）
│   ├── download-authorization.ts # 授权智能体 ZIP 和交付资产下载
│   └── download-tickets.ts       # HMAC-SHA256 下载票证（创建、验证、一次性消费）
│
└── mail/
    └── dev-mailer.ts             # 开发邮件：写入 .data/dev-email-outbox.jsonl
```

---

## `src/components/` — 共享组件

```
src/components/
├── agent-card.tsx                 # 智能体包卡片（服务端组件）：完整性、转换指标、服务徽章
├── agent-detail.tsx               # 完整智能体详情视图（服务端组件）：skills、workflows、元数据、咨询表单
├── consultation-form.tsx          # 客户端组件：通过 fetch 提交咨询、状态显示
├── upload-agent-form.tsx          # 智能体 ZIP 上传表单（POST 到 /api/creator/agents）
├── upload-delivery-form.tsx       # 交付文件上传表单（POST 到 /api/orders/[id]/deliveries）
├── cancel-order-button.tsx        # 客户端组件：通过 fetch 取消订单（useTransition）
├── complete-order-button.tsx       # 接受交付按钮（表单 POST）
├── dispute-order-button.tsx        # 开启争议按钮（表单 POST）
├── order-status-pill.tsx          # 订单状态徽章（zh-CN 标签）
├── consultation-status-pill.tsx   # 咨询状态徽章（zh-CN 标签）
├── package-status-pill.tsx        # 智能体包状态徽章（zh-CN 标签）
└── settlement-status-pill.tsx     # 结算明细状态徽章（zh-CN 标签）
```

---

## `prisma/` — 数据库模式

### 模型（22 个总计）

```
prisma/schema.prisma

枚举（14 个）：
  UserRole, WhitelistStatus, AgentPackageStatus, ConsultationStatus,
  ServiceOrderStatus, PaymentStatus, StorageProviderKind,
  DisputeStatus, DisputeResolutionType, RefundStatus,
  SettlementLineStatus, SettlementBatchStatus, SettlementAdjustmentStatus

核心模型：
  User                         # 认证、角色（USER/CREATOR/ADMIN）、白名单
  MagicLinkToken               # 无密码登录令牌（每次请求 1 个）
  Session                      # 基于 Cookie 的会话（30 天过期）

市场模型：
  AgentPackage                 # 带元数据、存储信息的已发布智能体 ZIP
  Skill                        # 包内声明的 skills
  Workflow                     # 包内声明的工作流
  AgentPackageFavorite         # 用户收藏（每用户+包唯一）
  AgentPackageReview           # 用户评价（1-5 星）
  AgentPackageImportInstruction # CLI/一键导入说明
  DownloadTicketUse            # 一次性下载票证消费日志

商务模型：
  Consultation                 # 买家-提供商需求讨论
  ServiceOrder                 # 链接到咨询的付费服务订单
  PaymentLedger                # 只追加支付事件日志
  Delivery                     # 提供商上传的交付文件

争议与退款模型：
  Dispute                      # 带证据的订单争议
  DisputeEvidence              # 对买家/提供商可见的争议证据条目
  Refund                       # 链接到订单和可选争议的退款记录

结算模型：
  SettlementLine               # 每订单结算计算（费用、净额、扣除）
  SettlementAdjustment         # 结算后调整（例如锁定后退款）
  SettlementBatch              # 提供商批次支付分组

审计：
  AuditLog                     # 只追加审计轨迹（角色、操作、快照）
```

### 关键索引

- `AgentPackage`: `(ownerId, createdAt)`、`(status, publishedAt)` — 创作者列表和发布源
- `ServiceOrder`: `(consultationId)`、`(providerId, createdAt)`、`(buyerEmail, createdAt)`、`(status, paymentStatus)`、`(status, settledAt)` — 订单查找
- `PaymentLedger`: `(orderId, createdAt)`、`(provider, paymentStatus, createdAt)` — 支付查询
- `Dispute`: `(orderId, createdAt)`、`(status, createdAt)` — 争议查找
- `SettlementLine`: `(providerId, status, eligibleAt)` — 批次资格查询

---

## `tests/` — 测试套件

```
tests/
├── server/                           # 单元测试（Vitest）
│   ├── harness.test.ts               # 测试工具设置验证
│   ├── session.test.ts               # 会话令牌创建、哈希
│   ├── magic-link.test.ts            # 魔法链接请求/消费流程
│   ├── agent-detail-page.test.tsx    # 智能体详情页面渲染
│   ├── agents-page.test.tsx          # 智能体列表页面渲染
│   ├── creator-page.test.tsx         # 创作者后台渲染
│   ├── creator-orders-page.test.tsx   # 创作者订单页面渲染
│   ├── creator-consultations-page.test.tsx  # 创作者咨询页面
│   ├── creator-public-page.test.tsx   # 公开创作者资料页面
│   ├── creator-actions.test.ts       # 咨询订单服务端动作
│   ├── creator-upload-route.test.ts  # 智能体上传 API 路由
│   ├── new-creator-agent-page.test.tsx  # 新智能体上传页面
│   ├── admin-page.test.tsx           # 管理员后台页面
│   ├── admin-actions.test.ts         # 管理员服务端动作
│   ├── admin-analytics-page.test.tsx  # 分析页面
│   ├── account-orders-page.test.tsx   # 买家订单页面
│   ├── login-page.test.ts            # 登录页面渲染
│   ├── order-service.test.ts        # 订单 CRUD 业务逻辑
│   ├── consultation-service.test.ts  # 咨询 CRUD 业务逻辑
│   ├── consultation-route.test.ts    # 咨询 API 路由
│   ├── delivery-service.test.ts      # 交付上传/下载逻辑
│   ├── delivery-route.test.ts        # 交付上传 API 路由
│   ├── delivery-download-route.test.ts  # 交付下载 API 路由
│   ├── dispute-service.test.ts       # 争议创建/解决逻辑
│   ├── dispute-order-route.test.ts   # 争议 API 路由
│   ├── refund-service.test.ts        # 退款请求/webhook 处理
│   ├── settlement-service.test.ts    # 结算明细/批次逻辑
│   ├── payment-ledger.test.ts        # 支付账本幂等性
│   ├── payment-route.test.ts         # 支付结账 API 路由
│   ├── stripe-adapter.test.ts        # Stripe 适配器规范化
│   ├── product-service.test.ts       # 收藏、评价、推荐
│   ├── package-service.test.ts        # 包 CRUD 和验证
│   ├── zip-validator.test.ts         # ZIP 结构验证
│   ├── metadata-schema.test.ts       # agent.json 元数据验证
│   ├── storage-factory.test.ts       # 存储提供商选择
│   ├── local-storage.test.ts         # 本地存储 I/O
│   ├── local-delivery-storage.test.ts  # 本地交付存储 I/O
│   ├── s3-provider.test.ts           # S3 存储提供商
│   ├── download-ticket.test.ts       # HMAC 票证创建/验证
│   ├── download-authorization.test.ts  # 下载访问控制
│   └── cancel-order-route.test.ts    # 取消订单 API 路由
│       └── complete-order-route.test.ts  # 完成订单 API 路由
│
└── e2e/                              # 端到端测试（Playwright）
    ├── marketplace.spec.ts           # 智能体浏览、筛选、下载
    ├── consultation.spec.ts          # 咨询提交和管理
    ├── order-lifecycle.spec.ts       # 完整订单创建到完成流程
    ├── delivery.spec.ts               # 交付上传和下载
    ├── settlement.spec.ts            # 结算批次处理
    └── storage-rollout.spec.ts       # S3 存储提供商切换
```

---

## `src/test/` — 测试工具

```
src/test/
└── fixtures.ts                      # createAgentZip() 辅助函数：内存中生成有效测试 ZIP
```

---

## 根配置文件

| 文件 | 用途 |
|------|------|
| `package.json` | 项目名 `hermes-agent-marketplace`，脚本：`dev`、`build`、`start`、`lint`、`test`、`test:e2e`、`prisma:*` |
| `tsconfig.json` | 严格 TypeScript、ES2022 目标、bundler 模块解析、`@/*` 路径别名到 `./src/*` |
| `next.config.mjs` | 默认 Next.js 配置（无自定义配置） |
| `vitest.config.ts` | Vitest：node 环境、globals、`@/` 别名、包含 `tests/**/*.test.{ts,tsx}` |
| `playwright.config.ts` | Playwright E2E 配置指向 `tests/e2e/` |
| `eslint.config.mjs` | ESLint flat 配置与 Next.js 插件 |
| `.env.example` | 模板：`DATABASE_URL`、`APP_URL`、`ADMIN_EMAILS`、`PAYMENT_PROVIDER`、`STRIPE_*`、存储变量 |
| `prisma/schema.prisma` | PostgreSQL 提供商、22 个模型、14 个枚举、为市场查询索引 |
| `prisma/seed.ts` | 从 `ADMIN_EMAILS` 环境变量 Upsert 管理员用户 |

---

## 命名约定

| 模式 | 约定 | 示例 |
|------|------|------|
