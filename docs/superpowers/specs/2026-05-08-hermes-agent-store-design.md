# Hermes Agent Store — 产品设计文档

> 日期：2026-05-08
> 状态：已确认，待实现

---

## 1. 项目概述

将现有的 hermes-agent-marketplace 升级为完整的 Agent 产品市场，核心改造：

1. **包格式升级**：从 `agent.json`（JSON）迁移到 `AGENTS.md`（Markdown + YAML frontmatter），新增 `SOUL.md` 身份层
2. **团队包支持**：单 Agent 包为基础单元，支持多 Agent 组合编排为团队包
3. **付费模式**：免费 + 付费混合，平台双边抽成
4. **一键导入**：Hermes 深链接导入协议，从发现到可用只需一次点击

### 目标用户

- **开发者/技术人员**：自行运行 Hermes Agent，需要高质量、可定制的 Agent 包
- **非技术企业用户**：期望一键导入、即开即用的 AI 员工

### 核心差异化

1. **完整 Agent 即产品** — 不卖技能/插件，卖带人格、带行为规则、带技能的完整可执行 Agent
2. **Hermes 原生体验** — 深度绑定 Hermes Agent 运行时，一键导入、自动配置
3. **服务闭环** — 从发现 Agent 到定制、部署、培训一条龙

---

## 2. Agent 包格式

### 2.1 单 Agent 包目录结构

```
shopping-assistant/
├── AGENTS.md              # 核心文件：YAML 元数据 + Markdown 行为指令
├── SOUL.md                # 身份定义：人格 + 行为规则
├── README.md              # 用户文档（市场展示用）
├── skills/
│   ├── price-compare/
│   │   └── SKILL.md       # 遵循 Anthropic SKILL.md 开放标准
│   └── product-search/
│       └── SKILL.md
├── workflows/
│   ├── daily-report.md
│   └── alert-rules.md
├── memory/                # 预置知识（可选）
│   ├── brand-database.md
│   └── price-ranges.md
└── assets/                # 资源文件（可选）
    ├── templates/
    └── prompts/
```

### 2.2 AGENTS.md 格式

```yaml
---
id: shopping-assistant
name: "Shopping Assistant"
version: 1.0.0
summary: "专业的电商购物助手，帮助用户比价、推荐商品、追踪价格变动"
categories: [ecommerce, research]
author:
  name: "张三"
  website: "https://example.com"
pricing:
  type: free          # free | paid
  price: 0            # USD，free 时为 0
hermes:
  minVersion: "2.0.0"
permissions: [web-search, file-read]
env:
  - name: SHOPPING_API_KEY
    required: false
    description: "可选的购物 API 密钥，用于实时价格查询"
skills:
  - name: price-compare
    path: skills/price-compare/SKILL.md
    description: "跨平台比价，支持 Amazon/eBay/Walmart"
  - name: product-search
    path: skills/product-search/SKILL.md
    description: "按需求搜索和筛选商品"
workflows:
  - name: daily-report
    path: workflows/daily-report.md
    description: "每日价格变动报告生成"
service:
  available: true
  types: [customization, deployment, training]
---

## 行为指令

你是一个专业的购物助手。当用户描述需求时：

1. 先理解用户的预算范围和偏好
2. 使用 price-compare 技能进行跨平台比价
3. 使用 product-search 技能补充搜索结果
4. 综合评分后给出 Top 3 推荐
5. 每条推荐必须包含：商品名、价格、平台、推荐理由

## 决策规则

- 如果用户预算低于任何可用选项，主动建议调整预算而非强行推荐
- 不推荐评分低于 3.5 星的商品
- 涉及大额消费（>$200）时，提醒用户查看退换政策
```

### 2.3 SOUL.md 格式

```markdown
---
name: "XiaoGou"
role: "电商购物顾问"
avatar: "assets/avatar.png"
language: ["zh-CN", "en"]
---

## 我是谁

我是一名有 8 年电商行业经验的购物顾问，曾经在多家头部电商平台担任买手。
我对性价比有近乎偏执的追求，擅长在预算范围内找到最优选择。

## 个性特征

- **热情但不浮夸**：我会为发现好deal而兴奋，但不会用过度营销的话术
- **严谨有数据支撑**：每条推荐都附带数据依据，从不说"我觉得这个好"
- **有主见但不强势**：会明确表达推荐理由，但尊重用户的最终选择
- **主动关怀**：会提醒用户注意退换政策、保修期限等容易忽略的细节

## 沟通风格

- 使用简洁的中文，避免行业黑话
- 用要点列表呈现对比信息，而非大段文字
- 价格用具体数字，不用"很便宜"、"超值"等模糊词
- 在给出推荐后，会问一句"需要我继续找更多选择吗？"

## 行为边界

### 必须做
- 每次推荐前先确认用户的预算和需求
- 始终提供至少 2 个选项供比较
- 标注信息的时效性（"此价格为 2 小时前查询"）

### 绝不做
- 不推荐我没查过实际价格的商品
- 不接受商家付费推广来影响推荐顺序
- 不在用户没有要求的情况下主动推送营销信息
- 不存储或分享用户的购买历史

### 需要确认
- 当推荐结果可能涉及个人健康/安全时，提示用户咨询专业人士
- 当价格波动剧烈（24小时内 >30%）时，提示用户可能需要等待
```

### 2.4 SOUL.md 设计原则

| 原则 | 说明 |
|------|------|
| 先身份后规则 | Agent 先理解"我是谁"，再学习"我该怎么做" |
| 正反双向约束 | 明确"必须做"和"绝不做"，减少灰度地带 |
| 可观测可审计 | 每条规则都有判断标准，不是模糊描述 |
| 渐进加载 | 名称/角色是 discovery 层，完整内容在 activation 层加载 |

### 2.5 SOUL.md 与 AGENTS.md 的分工

| 文件 | 回答的问题 | 加载时机 |
|------|-----------|----------|
| SOUL.md | "我是谁？我怎么说话？我的底线是什么？" | 每次对话（system prompt 最前面） |
| AGENTS.md | "我有什么能力？我按什么流程做事？" | 任务匹配和执行时按需加载 |

---

## 3. 团队包格式

### 3.1 目录结构

```
ecommerce-ops-team/
├── TEAM.md                 # 团队编排文件
├── README.md               # 团队文档
├── agents/
│   ├── shopping-assistant/
│   │   ├── AGENTS.md
│   │   ├── SOUL.md
│   │   ├── skills/
│   │   └── workflows/
│   ├── customer-service/
│   │   ├── AGENTS.md
│   │   ├── SOUL.md
│   │   └── skills/
│   └── data-analyst/
│       ├── AGENTS.md
│       ├── SOUL.md
│       └── skills/
└── shared/
    ├── knowledge-base.md
    └── brand-voice.md
```

### 3.2 TEAM.md 格式

```yaml
---
id: ecommerce-ops-team
name: "电商运营团队"
version: 1.0.0
summary: "完整的电商运营团队，包含购物顾问、客服、数据分析师三个角色"
categories: [ecommerce, ops]
author:
  name: "张三"
pricing:
  type: paid
  price: 29.99
hermes:
  minVersion: "2.0.0"
agents:
  - id: shopping-assistant
    path: agents/shopping-assistant
    role: "前端购物顾问，直接面向用户"
    triggers: ["用户咨询商品", "比价请求", "推荐请求"]
  - id: customer-service
    path: agents/customer-service
    role: "售后服务，处理退换货和投诉"
    triggers: ["售后问题", "退换货", "投诉"]
  - id: data-analyst
    path: agents/data-analyst
    role: "后台分析，生成运营报告"
    triggers: ["数据报告", "运营分析", "日报/周报"]
routing:
  default: shopping-assistant
  fallback: customer-service
shared:
  - path: shared/knowledge-base.md
    description: "品牌知识和产品信息"
  - path: shared/brand-voice.md
    description: "统一沟通风格指南"
---

## 团队协作规则

### 任务分发
- 用户请求先由 shopping-assistant 接收和分类
- 属于售后范畴的请求，转交 customer-service 处理
- 定时任务（日报/周报）自动交给 data-analyst

### 信息共享
- 所有 Agent 共享 shared/ 下的知识库和品牌调性
- 每次跨 Agent 转交时，必须附带上下文摘要
- customer-service 处理完投诉后，通知 data-analyst 记录到运营数据

### 冲突处理
- 当 shopping-assistant 和 customer-service 给出矛盾建议时，以 customer-service 为准
- 涉及退款/赔偿的决定，必须由 customer-service 确认
```

### 3.3 包类型校验规则

| 规则 | 单 Agent 包 | 团队包 |
|------|------------|--------|
| 必含文件 | `AGENTS.md` + `SOUL.md` + `README.md` | `TEAM.md` + `README.md` |
| skills 目录 | 必须 ≥1 个 skill | 每个 agent 必须 ≥1 个 skill |
| 识别方式 | 根目录有 `AGENTS.md` 且无 `TEAM.md` | 根目录有 `TEAM.md` |
| ZIP 扩展名 | `.hermes.zip` | `.hermes.zip` |
| 最大体积 | 25 MB | 50 MB |

---

## 4. 市场核心体验

### 4.1 发现与浏览

**页面改造：**

| 页面 | 改造内容 |
|------|----------|
| 首页 | 增加"团队包"入口、"场景推荐"板块 |
| 列表页 | 新增"包类型"筛选（单 Agent / 团队包）、"价格"筛选（免费/付费） |
| 详情页 | 新增 SOUL 预览、技能演示、团队编排图 |

**详情页信息架构：**

```
Agent 详情页
├── 头部：名称、评分、下载量、价格标签（免费/¥9.99）
├── Tab: 概览 | 技能 | 人格预览 | 服务
│   ├── 概览：README.md 渲染 + 分类标签 + 版本信息
│   ├── 技能：每个 skill 的名称、描述、触发条件
│   ├── 人格预览：SOUL.md 的"我是谁"+"个性特征"部分（不含行为边界）
│   └── 服务：定制化/部署/培训/集成 的咨询入口
├── 侧边栏
│   ├── 一键导入 Hermes 按钮（核心 CTA）
│   ├── 下载 ZIP 按钮
│   ├── 兼容性信息（Hermes >= 2.0.0）
│   ├── 权限声明
│   └── 创作者信息 + 联系方式
└── 团队包额外：Agent 关系图（谁负责什么、任务流向）
```

### 4.2 一键导入体验

**导入流程：**

```
用户点击"导入到 Hermes"
  → 检测是否安装 Hermes Agent
    → 已安装：调用 hermes://import?url=...&token=... 深链接
      → Hermes 自动下载、解压、校验、配置
      → 弹出确认："即将导入 Shopping Assistant (3 skills, 2 workflows)"
      → 用户确认 → 导入完成 → 可直接对话
    → 未安装：引导安装 Hermes → 安装后自动回到导入流程
```

**Hermes 导入协议：**

- 协议：`hermes://import?url={download_url}&token={auth_token}`
- ZIP 下载需要 auth_token（复用现有 download-tickets 机制）
- 导入后 Hermes 自动执行：
  1. 解压到 `~/.hermes/agents/{id}/`
  2. 校验 AGENTS.md frontmatter
  3. 加载 SOUL.md 到 system prompt
  4. 注册 skills 到技能发现层
  5. 如果是团队包，注册 TEAM.md 路由规则

### 4.3 定价与支付

**场景流程：**

| 场景 | 流程 |
|------|------|
| 免费包 | 直接下载/导入，无需支付 |
| 付费包 | 点击导入 → Stripe Checkout → 支付成功 → 获取 download ticket → 导入 |
| 咨询服务 | 复用现有咨询 → 下单 → 支付 → 交付流程 |

**平台抽成模型：**

| 收入来源 | 抽成比例 | 说明 |
|----------|----------|------|
| 付费 Agent 包 | 20% | 创作者得 80% |
| 咨询/服务订单 | 15% | 创作者得 85% |
| 团队包 | 20% | 包内各 Agent 创作者按比例分配 |

### 4.4 创作者工作流

```
创作者上传流程：
1. 拖拽上传 .hermes.zip
2. 系统自动校验（扩展后的双模式校验）
3. 展示校验结果：
   - 通过 → 预览 AGENTS.md / SOUL.md 解析结果
   - 警告 → 显示 risks
   - 失败 → 显示 errors，拒绝发布
4. 创作者补充定价、封面图、演示视频
5. 发布 → 自动生成详情页
```

---

## 5. 数据模型迁移

### 5.1 Prisma Schema 新增/变更

```prisma
model AgentPackage {
  id              String   @id @default(cuid())
  ownerId         String   @map("owner_id")
  name            String
  slug            String   @unique
  version         String
  summary         String
  categories      String[]
  zipFileUrl      String   @map("zip_file_url")
  zipFileName     String   @map("zip_file_name")
  zipSizeBytes    Int      @map("zip_size_bytes")
  downloadCount   Int      @default(0) @map("download_count")
  status          AgentPackageStatus @default(PENDING)
  publishedAt     DateTime? @map("published_at")

  // 新增字段
  packageType     PackageType @default(SINGLE) @map("package_type")
  soulPreview     String?  @map("soul_preview")
  behaviorDigest  String?  @map("behavior_digest")
  pricingType     PricingType @default(FREE) @map("pricing_type")
  priceCents      Int      @default(0) @map("price_cents")
  platformFeeRate Int      @default(20) @map("platform_fee_rate")

  // 团队包字段
  routingDefault  String?  @map("routing_default")
  routingFallback String?  @map("routing_fallback")

  owner           User     @relation(fields: [ownerId], references: [id])
  skills          Skill[]
  workflows       Workflow[]
  consultations   Consultation[]
  childAgents     TeamAgent[]  @relation("TeamMembers")
  parentTeam      TeamAgent?   @relation("TeamMembers")

  @@map("agent_packages")
}

model TeamAgent {
  id          String  @id @default(cuid())
  teamId      String  @map("team_id")
  agentId     String  @map("agent_id")
  role        String
  triggers    String[]
  sortOrder   Int     @default(0) @map("sort_order")

  team        AgentPackage @relation("TeamMembers", fields: [teamId], references: [id])
  agent       AgentPackage @relation("TeamMembers", fields: [agentId], references: [id])

  @@unique([teamId, agentId])
  @@map("team_agents")
}

enum PackageType {
  SINGLE
  TEAM
}

enum PricingType {
  FREE
  PAID
}
```

### 5.2 ZIP 校验管线改造

```
validateAgentZip(buffer)
  ├─ 检测到 AGENTS.md（无 TEAM.md）→ validateSingleAgentZip()
  │   - 必须有 AGENTS.md + SOUL.md + README.md
  │   - 解析 AGENTS.md 的 YAML frontmatter
  │   - 校验 frontmatter 符合 schema
  │   - 校验 SOUL.md 必须有"我是谁"段落
  │   - 校验声明的 skill 文件路径存在
  │   - 保留现有安全检查
  │
  └─ 检测到 TEAM.md → validateTeamZip()
      - 必须有 TEAM.md + README.md
      - 解析 TEAM.md 的 YAML frontmatter
      - 校验 agents/ 下每个子目录是合法单 Agent 包
      - 校验 routing.default 指向的 Agent 存在
      - 递归校验每个子 Agent 的 AGENTS.md + SOUL.md
```

### 5.3 前端改造范围

| 文件 | 改动 |
|------|------|
| `metadata-schema.ts` | 重写为 AGENTS.md YAML frontmatter schema |
| `zip-validator.ts` | 扩展为双模式校验 |
| `package-service.ts` | 新增 packageType、pricing 字段处理；团队包关联逻辑 |
| `agents/page.tsx` | 新增包类型筛选、价格筛选 |
| `agent-detail.tsx` | 新增 SOUL 预览 Tab、定价展示、一键导入按钮 |
| `creator/agents/new/page.tsx` | 支持创建团队包 |
| `api/agents/[slug]/download/route.ts` | 付费包支付校验 |
| Prisma migration | 新增 PackageType、PricingType、TeamAgent |

### 5.4 不改动的部分

| 模块 | 原因 |
|------|------|
| 认证系统 | 完全复用 |
| 支付底座（Stripe adapter） | 复用，扩展付费包场景 |
| 存储层（S3 + local） | 复用 |
| 咨询/订单系统 | 复用现有流程 |
| 管理后台 | 扩展 analytics 即可 |
