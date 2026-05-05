# 技术栈 — Hermes Agent Marketplace

## 运行时与框架

| 层级 | 技术 | 版本 | 来源 |
|------|------|------|------|
| 运行时 | Node.js | (最新) | `@types/node` ^22.8.0 |
| 框架 | Next.js | ^15.0.0 | `package.json` 中的 `next` |
| React | React | ^19.0.0 | `package.json` 中的 `react` / `react-dom` |
| 语言 | TypeScript | ^5.6.3 | `package.json` 中的 `typescript` |

### TypeScript 配置

- **目标**：ES2022
- **模块**：`esnext` 使用 `bundler` 解析
- **严格模式**：启用（`strict: true`、`noEmit: true`）
- **JSX**：`preserve`（Next.js 处理转换）
- **路径别名**：`@/*` 映射到 `./src/*`
- **增量编译**：启用
- 配置文件：`tsconfig.json`

### Next.js 配置

- 最小配置（`next.config.mjs` 是空对象）
- 使用 App Router（所有路由在 `src/app/` 下）
- 服务端组件和服务端动作是主要渲染策略

---

## 数据库与 ORM

| 组件 | 技术 | 版本 | 详情 |
|------|------|------|------|
| 数据库 | PostgreSQL | (外部) | 通过 `DATABASE_URL` 环境变量配置 |
| ORM | Prisma | ^5.22.0 | `prisma` CLI 和 `@prisma/client` |

### Prisma 模式概述

文件：`prisma/schema.prisma`

- **生成器**：`prisma-client-js`
- **数据源**：通过 `DATABASE_URL` 环境变量的 PostgreSQL
- **18 个模型**，**12 个枚举类型**
- **13 个迁移文件**，追踪分阶段模式演进

### 枚举（12 个）

`UserRole`、`WhitelistStatus`、`AgentPackageStatus`、`ConsultationStatus`、`ServiceOrderStatus`、`PaymentStatus`、`StorageProviderKind`、`DisputeStatus`、`DisputeResolutionType`、`RefundStatus`、`SettlementLineStatus`、`SettlementBatchStatus`、`SettlementAdjustmentStatus`

### 模型（18 个）

| 模型 | 用途 |
|------|------|
| `User` | 带角色（USER、CREATOR、ADMIN）的用户 |
| `MagicLinkToken` | 无密码认证令牌生命周期 |
| `Session` | 基于 Cookie 的浏览器会话追踪 |
| `AgentPackage` | 核心市场列表（智能体 ZIP 包） |
| `AgentPackageFavorite` | 用户收藏/书签 |
| `AgentPackageReview` | 星级评分和评价（1-5） |
| `AgentPackageImportInstruction` | CLI/一键导入命令 |
| `DownloadTicketUse` | 防滥用一次性下载票证追踪 |
| `Skill` | 元数据中的智能体能力 |
| `Workflow` | 元数据中的智能体工作流定义 |
| `Consultation` | 买家-提供商服务讨论 |
| `ServiceOrder` | 付费服务参与（完整生命周期） |
| `PaymentLedger` | 幂等支付事件账本 |
| `Delivery` | 提供商到买家的文件交付 |
| `AuditLog` | 系统范围审计轨迹 |
| `Dispute` | 订单争议生命周期 |
| `Refund` | 支付退款追踪 |
| `SettlementLine` | 每订单提供商结算计算 |
| `SettlementAdjustment` | 结算后调整（退款、纠正） |
| `SettlementBatch` | 提供商批次支付聚合 |

### 数据库连接

文件：`src/server/db.ts`

- 使用 `globalThis` 缓存的单例 `PrismaClient` 模式，防止开发中多次实例
- 开发日志：`error` + `warn`；生产：`error` 仅

### 播种

文件：`prisma/seed.ts`

- 从 `ADMIN_EMAILS` 环境变量播种管理员用户（逗号分隔）
- 通过 `npm run prisma:seed` 运行（使用 `tsx`）

---

## 支付处理

| 组件 | 技术 | 版本 | 详情 |
|------|------|------|------|
| 支付 SDK | Stripe | ^22.1.0 | `stripe` npm 包 |
| 提供商模式 | 适配器 | -- | `PaymentProvider` 接口 |
| 开发适配器 | 进程内 | -- | 无需外部服务 |

提供商选择通过 `PAYMENT_PROVIDER` 环境变量控制（默认：`"dev"`）。

详见 [INTEGRATIONS.md](./INTEGRATIONS.md) 的完整支付架构。

---

## 对象存储

| 组件 | 技术 | 版本 | 详情 |
|------|------|------|------|
| AWS SDK | `@aws-sdk/client-s3` | ^3.1041.0 | S3 兼容操作 |
| 提供商模式 | 适配器 | -- | `StorageProvider` 接口 |
| 本地提供商 | 文件系统 | -- | `.data/uploads/` 和 `.data/deliveries/` |

提供商选择通过 `STORAGE_PROVIDER` 环境变量控制（`"local"` 或 `"s3-compatible"`）。

详见 [INTEGRATIONS.md](./INTEGRATIONS.md) 的完整存储架构。

---

## 关键依赖

| 包 | 用途 |
|------|------|
| `next` ^15.0.0 | 全栈 React 框架（App Router、RSC、服务端动作） |
| `react` ^19.0.0 | UI 渲染 |
| `zod` ^3.23.8 | API 输入、元数据、webhook 的运行时验证/模式 |
| `stripe` ^22.1.0 | Stripe 支付网关（结账、退款、webhook） |
| `@prisma/client` ^5.22.0 | 类型安全数据库客户端 |
| `@aws-sdk/client-s3` ^3.1041.0 | S3 兼容对象存储操作 |
| `jszip` ^3.10.1 | 智能体包 ZIP 存档解析和验证 |
| `nanoid` ^5.0.7 | URL 安全唯一 ID 生成 |

---

## 构建工具与打包器

| 工具 | 用途 |
|------|------|
| Next.js | 内置 Turbopack/Webpack 打包器（无自定义配置） |
| `next build` | 通过 `npm run build` 生产构建 |
| `next dev` | 通过 `npm run dev` 开发服务器 |
| `tsx` ^4.19.2 | Prisma 种子脚本的 TypeScript 执行 |

`next.config.mjs` 是空配置对象——无自定义 webpack 插件、无中间件、无重写。

---

## 开发工具

### 代码检查

| 工具 | 版本 | 详情 |
|------|------|------|
| ESLint | ^9.13.0 | Flat 配置（v9） |
| eslint-config-next | ^15.0.0 | Next.js 特定规则 |

运行：`npm run lint`

### 单元/集成测试

| 工具 | 版本 | 详情 |
|------|------|------|
| Vitest | ^2.1.4 | 带 `globals: true` 的测试运行器 |
| jsdom | ^25.0.1 | 组件测试的 DOM 环境 |
| @testing-library/react | ^16.0.1 | React 组件测试工具 |
| @testing-library/jest-dom | ^6.6.3 | 自定义 DOM 匹配器 |
| @testing-library/user-event | ^14.5.2 | 用户交互模拟 |

配置文件：`vitest.config.ts`

- 测试环境：`node`
- 测试文件：`tests/**/*.test.ts`、`tests/**/*.test.tsx`
- 路径别名：`@` 映射到 `./src`
- **47 个单元/集成测试文件**，分布在 `tests/server/`
- 运行：`npm test`（单次运行）或 `npm run test:watch`

### E2E 测试

| 工具 | 版本 | 详情 |
|------|------|------|
| Playwright | ^1.48.0 | 基于浏览器的端到端测试 |

- **5 个 E2E 规范文件**：市场、咨询、订单生命周期、交付、结算、存储推广
- 运行：`npm run test:e2e`

---

## 项目结构

```
src/
  app/                    # Next.js App Router 页面和 API 路由
    page.tsx              # 主页
    layout.tsx            # 根布局
    agents/               # 智能体市场页面
    creator/              # 创作者后台页面和动作
    account/              # 买家账户页面
    admin/                # 管理员页面和动作
    login/                # 登录页面
    docs/                 # 文档页面
    services/             # 服务页面
    api/                  # API 路由处理程序
      auth/               # 魔法链接认证端点
      payments/           # 支付 webhook 和开发完成
      orders/             # 订单生命周期（支付、交付、完成、取消、争议）
      consultations/      # 咨询创建
      agents/             # 智能体包下载
      creator/            # 创作者智能体上传
  server/                 # 服务端业务逻辑
    db.ts                 # Prisma 客户端单例
    auth/                 # 魔法链接认证
    mail/                 # 邮件（仅开发，基于文件）
    agents/               # 智能体包元数据、验证、服务
    consultations/         # 咨询服务和逻辑
    orders/               # 订单生命周期服务
    deliveries/            # 交付服务
    payments/             # 支付适配器、Stripe、开发、账本、webhook
    refunds/              # 退款服务
    disputes/              # 争议服务
    settlements/           # 结算和批次服务
    storage/              # 存储适配器、本地、S3、下载认证
    audit/                # 审计日志
  components/             # 共享 React 组件
  test/                   # 测试 fixtures
prisma/                   # Prisma 模式、迁移、种子
tests/                    # Vitest 单元测试和 Playwright E2E
```

---

## 环境变量

应用完全通过环境变量配置：

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | （必需） |
| `PAYMENT_PROVIDER` | 支付提供商：`"dev"` 或 `"stripe"` | `"dev"` |
| `STRIPE_SECRET_KEY` | Stripe API 密钥 | （stripe 必需） |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook 签名密钥 | （stripe 必需） |
| `APP_URL` | 回调的公共应用 URL | `http://localhost:3000` |
| `STORAGE_PROVIDER` | 存储提供商：`"local"` 或 `"s3-compatible"` | `"local"` |
| `S3_ENDPOINT` | S3 兼容端点 URL | （s3-compatible 必需） |
| `S3_REGION` | S3 区域 | （s3-compatible 必需） |
| `S3_BUCKET` | S3 桶名称 | （s3-compatible 必需） |
| `S3_ACCESS_KEY_ID` | S3 访问密钥 | （s3-compatible 必需） |
| `S3_SECRET_ACCESS_KEY` | S3 密钥 | （s3-compatible 必需） |
| `S3_FORCE_PATH_STYLE` | 使用路径样式 S3 URL | `"true"` |
| `S3_PUBLIC_BASE_URL` | S3 对象访问 URL 覆盖 | （可选） |
| `UPLOAD_DIR` | 本地上传目录（智能体） | `.data/uploads` |
| `DELIVERY_UPLOAD_DIR` | 本地上传目录（交付） | `.data/deliveries` |
| `ADMIN_EMAILS` | 逗号分隔的管理员邮箱地址 | （可选） |
| `DEV_EMAIL_OUTBOX` | 开发邮件日志文件路径 | `.data/dev-email-outbox.jsonl` |
| `DOWNLOAD_TICKET_SECRET` | 下载票证 HMAC 密钥 | `"dev-download-ticket-secret"` |
| `DOWNLOAD_TICKET_ACTIVE_KEY_ID` | 活动签名密钥 ID | `"dev-key-1"` |
| `DOWNLOAD_TICKET_PREVIOUS_KEY_ID` | 之前签名密钥（轮换） | （可选） |
| `DOWNLOAD_TICKET_PREVIOUS_SECRET` | 之前签名密钥（轮换） | （可选） |
