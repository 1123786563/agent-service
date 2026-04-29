# Hermes-agent 智能体市场与轻服务交易设计

日期：2026-04-29

## 目标

建设一个面向 Hermes-agent 生态的智能体及服务网站。第一版同时验证两条核心价值链：

- 开发者可以发布可下载的智能体 ZIP 包，用户可以浏览、理解、下载并导入 Hermes-agent。
- 用户可以围绕智能体发起服务咨询，平台自营或白名单服务商可以确认范围、生成订单、收款并交付。

第一版采用“智能体市场 + 轻服务交易闭环”的路线，避免一开始做成完整外包平台或复杂电商系统。

## 范围

### 第一版包含

- 公开智能体市场：首页、列表页、详情页、文档页。
- 智能体详情页：场景和结果优先，同时展示 skill、执行流程、安装说明和信任信息。
- 开发者轻账号：邮箱魔法链接登录。
- 白名单发布：只有受邀开发者/服务商可以上传 ZIP。
- ZIP 校验：结构校验、metadata 校验、基础风险提示。
- 用户下载：匿名用户可以下载已发布 ZIP。
- 服务咨询：用户从详情页发起定制、部署、培训等服务咨询。
- 服务订单：平台自营或白名单服务商确认范围后生成订单。
- 在线支付：用户确认订单后全额支付。
- 站内交付：服务商上传交付物，用户确认完成。
- 管理后台：白名单、智能体、订单、支付和交付异常处理。

### 第一版不包含

- 公开开发者注册。
- 复杂推荐系统。
- 站内即时聊天。
- 托管结算和服务商自动分账。
- 自动退款、仲裁和完整争议系统。
- 里程碑交付。
- 评价体系。
- Hermes-agent 一键导入协议或 CLI 安装命令。

## 角色

### 匿名用户

- 浏览公开市场。
- 查看智能体详情页。
- 下载已发布 ZIP。
- 发起服务咨询。

### 普通邮箱用户

- 查看自己的咨询和订单。
- 完成订单支付。
- 查看交付物并确认完成。

### 白名单开发者/服务商

- 通过邮箱魔法链接登录。
- 上传智能体 ZIP。
- 管理自己发布的智能体。
- 查看并处理咨询。
- 生成或协助生成服务订单。
- 上传服务交付物。

### 管理员

- 管理白名单。
- 查看 ZIP 校验和风险提示。
- 下架智能体。
- 监管咨询、订单、支付和交付状态。
- 人工处理异常订单和争议。

## 页面与模块

### 公开市场

- 首页：精选智能体、热门服务场景、分类入口。
- 智能体列表页：分类、标签、搜索、排序。
- 智能体详情页：场景和结果优先，固定展示下载、导入、skill、流程、信任信息和服务咨询入口。
- 服务入口页：解释可购买的服务类型，例如定制、部署、培训、集成。
- 文档页：说明如何下载 ZIP、检查权限、导入 Hermes-agent。

### 创作者工作台

- 我的智能体：查看已上传包、状态、版本和详情页。
- 上传 ZIP：白名单校验、结构校验、metadata 预览、提交发布。
- 咨询列表：查看用户需求、补充范围、进入订单生成。
- 订单列表：查看支付和交付状态。
- 交付物管理：上传文件或链接，补充交付说明。

### 管理后台

- 白名单管理。
- 智能体抽检、风险复核和下架。
- ZIP 风险提示查看。
- 咨询和订单监管。
- 支付回调和异常状态处理。
- 交付物访问和异常订单处理。

## 智能体详情页结构

详情页采用“场景和结果优先”的结构。

第一屏展示：

- 智能体名称。
- 一句话价值说明。
- 适用场景。
- 预期产出。
- 下载 ZIP 按钮。
- Hermes-agent 导入说明入口。
- 白名单认证、作者、版本等信任信息。
- 服务咨询入口。

后续模块展示：

- 结果示例。
- Skill 列表。
- 执行流程。
- 输入输出说明。
- 环境变量和权限。
- 版本历史。
- 风险提示。
- 作者和服务信息。

## ZIP 包规范

第一版把 ZIP 定义成“可下载、可校验、可导入 Hermes-agent 的智能体发行包”。平台不执行上传包内代码，只解析文本 metadata、展示内容并提供下载。

建议 ZIP 根目录结构：

```text
agent.zip
├── agent.json
├── README.md
├── skills/
│   ├── skill-a/
│   │   └── SKILL.md
│   └── skill-b/
│       └── SKILL.md
├── workflows/
│   └── main.json
├── examples/
│   ├── input.md
│   └── output.md
└── assets/
    └── cover.png
```

`agent.json` 是核心 metadata：

```json
{
  "id": "research-assistant",
  "name": "Research Assistant",
  "version": "1.0.0",
  "summary": "帮助用户完成资料调研、摘要和报告初稿。",
  "categories": ["research", "writing"],
  "skills": [
    {
      "name": "web-research",
      "path": "skills/web-research/SKILL.md",
      "description": "检索、筛选和整理资料"
    }
  ],
  "workflows": [
    {
      "name": "default",
      "path": "workflows/main.json",
      "description": "从用户问题到研究报告的默认流程"
    }
  ],
  "hermes": {
    "minVersion": "0.1.0",
    "importType": "zip"
  },
  "permissions": ["network.optional", "filesystem.read"],
  "env": [
    {
      "name": "OPENAI_API_KEY",
      "required": true,
      "description": "用于调用模型"
    }
  ],
  "author": {
    "name": "作者名",
    "website": "https://example.com"
  },
  "service": {
    "available": true,
    "types": ["customization", "deployment", "training"]
  }
}
```

## ZIP 校验

必须拒绝：

- 缺少 `agent.json` 或 `README.md`。
- `agent.json` 不是合法 JSON。
- metadata 路径引用不存在。
- ZIP 内包含绝对路径或 `../` 路径。
- 文件数量或总大小超过限制。
- 包含明显危险文件类型且无法解释用途。

允许但标记风险：

- 声明网络权限。
- 声明写文件权限。
- 需要多个环境变量。
- README 中包含外部下载链接。
- 包含脚本文件。

如果 metadata 缺失关键字段，上传失败。如果只是缺少封面图、示例等非关键内容，允许发布但降低完整度评分。

## 核心业务流

### 智能体发布下载

```text
白名单开发者登录
→ 上传 ZIP
→ 平台校验结构、metadata 和风险
→ 生成预览
→ 提交发布
→ 详情页公开
→ 用户下载 ZIP
→ 用户导入 Hermes-agent
```

智能体状态：

```text
draft → validating → published
        ↘ rejected
published → archived
```

### 服务交易

```text
用户发起咨询
→ 平台自营或白名单服务商沟通范围
→ 生成订单
→ 用户全额支付
→ 服务商交付
→ 用户确认完成
```

咨询状态：

```text
new → in_discussion → scoped → order_created
new / in_discussion → closed
```

订单状态：

```text
pending_payment → paid → in_progress → delivered → completed
pending_payment → cancelled
paid / in_progress / delivered → disputed
```

`paid` 表示支付回调已确认但服务尚未开始的短暂或后台状态。正常情况下，支付成功后订单自动进入 `in_progress`。交付物上传后进入 `delivered`。用户确认后进入 `completed`。如果用户长期不确认，第一版由管理员手动完成，不做自动确认规则。

## 技术架构

第一版建议采用单体 Web 应用，避免过早拆成微服务。

```text
Web App
├── Public Marketplace
├── Creator Dashboard
├── Admin Dashboard
├── Auth / Magic Link
├── Agent Package Validation
├── Consultation & Order
├── Payment Webhook
└── Delivery Management
```

核心外部依赖：

- Postgres：用户、智能体、订单、状态。
- 对象存储：ZIP 包、封面图、交付物文件。
- 支付服务：全额支付、支付回调。
- 邮件服务：魔法链接、订单通知、交付通知。

具体技术栈可以后续在实施计划中确定。推荐方向是优先选择开发效率高、生态成熟、支付和对象存储接入简单的组合，例如 Next.js + Postgres + 对象存储 + Stripe。

## 数据模型

### User

- `id`
- `email`
- `role`
- `whitelist_status`
- `created_at`

### AgentPackage

- `id`
- `owner_id`
- `name`
- `slug`
- `version`
- `summary`
- `metadata_json`
- `zip_file_url`
- `cover_url`
- `status`
- `validation_result`
- `published_at`

### Skill

- `id`
- `agent_package_id`
- `name`
- `path`
- `description`

### Workflow

- `id`
- `agent_package_id`
- `name`
- `path`
- `description`

### Consultation

- `id`
- `user_email`
- `agent_package_id`
- `provider_id`
- `requirement`
- `status`
- `scoped_summary`
- `created_at`

### ServiceOrder

- `id`
- `consultation_id`
- `buyer_email`
- `provider_id`
- `title`
- `scope`
- `price`
- `currency`
- `status`
- `payment_status`
- `delivery_status`

### Delivery

- `id`
- `service_order_id`
- `provider_id`
- `file_url`
- `note`
- `submitted_at`
- `accepted_at`

`agent.json` 原始内容保存在 `metadata_json`，同时把搜索和展示常用字段拆出来入库。

## 安全与异常处理

### 安全原则

- 平台不执行上传包内代码。
- 上传包只做结构、metadata 和基础风险校验。
- 交付物默认私有，只有买家、服务商和管理员可以访问。
- 支付状态以支付服务回调为准，后台保留人工修正入口。
- 公开页面明确展示风险提示：智能体由第三方提供，导入前请检查权限、环境变量和说明。

### 权限

```text
匿名用户：浏览、下载、发起咨询
普通邮箱用户：查看自己的咨询和订单
白名单开发者/服务商：上传 ZIP、处理咨询、上传交付物
管理员：管理白名单、下架智能体、处理异常订单
```

### 支付异常

- 支付成功但回调延迟：订单保持 `pending_payment`，允许用户刷新或后台同步。
- 支付成功但订单状态更新失败：管理员后台显示异常待处理。
- 支付失败：订单仍为 `pending_payment`，用户可重试或取消。
- 退款和争议：第一版不做自动流程，进入 `disputed` 后管理员人工处理。

### 交付异常

- 服务商未交付：管理员介入。
- 用户不确认：管理员手动完成。
- 交付物需要修改：订单保持 `delivered` 或回到 `in_progress`，由管理员或服务商补充交付。
- 交付物访问：只有买家、服务商、管理员可访问。

## 建设阶段

### Phase 1：智能体市场最小闭环

- 公开市场骨架。
- 轻账号。
- 白名单。
- ZIP 上传和校验。
- metadata 解析。
- 详情页生成。
- ZIP 下载。

目标：证明开发者能发布，用户能下载并导入 Hermes-agent。

### Phase 2：服务咨询和支付闭环

- 咨询入口。
- 咨询列表。
- 服务商或平台确认服务范围。
- 订单生成。
- 用户全额支付。
- 支付回调。
- 订单进入进行中。

目标：验证用户愿意为智能体相关服务付费。

### Phase 3：服务交付闭环

- 服务商上传交付物。
- 用户查看交付物。
- 用户确认完成。
- 邮件通知。
- 后台异常处理。

目标：把服务从收款推进到交付完成。

### Phase 4：运营增强

- 搜索筛选。
- 分类标签。
- 完整度评分。
- 下载统计。
- 服务订单看板。
- 智能体导入文档优化。

目标：提高发现效率、运营效率和用户信任。

## MVP 成功标准

- 至少 10 个可下载智能体。
- 至少 3 个白名单开发者或服务商。
- 用户能完成 ZIP 下载并导入 Hermes-agent。
- 至少 1 笔服务订单从咨询走到支付和交付确认。

## 验收标准

### 智能体市场

- 白名单开发者可以通过邮箱魔法链接登录。
- 非白名单用户不能上传 ZIP。
- 合法 ZIP 可以通过校验并生成详情页。
- 非法 ZIP 会给出明确错误原因。
- 详情页展示场景、结果、skill、流程、安装和信任信息。
- 匿名用户可以下载已发布 ZIP。
- 管理员可以下架智能体。

### 服务交易

- 用户可以从智能体详情页发起服务咨询。
- 服务商或平台可以查看咨询并生成订单。
- 用户可以完成全额支付。
- 支付回调能正确更新订单状态。
- 服务商可以上传交付物。
- 用户可以查看交付物并确认完成。
- 管理员可以处理异常订单。

## 测试策略

### 单元测试

- `agent.json` schema 校验。
- ZIP 路径和文件结构校验。
- 状态机转换。
- 权限判断。

### 集成测试

- 上传 ZIP → 发布 → 下载。
- 咨询 → 订单 → 支付回调 → 交付 → 完成。
- 魔法链接登录。
- 对象存储上传下载。

### 端到端测试

- 开发者发布一个智能体。
- 用户下载并查看导入说明。
- 用户发起服务咨询并完成订单。

## 后续迭代路线

- V1.1：搜索筛选、下载统计、智能体完整度评分。
- V1.2：开发者主页、服务商主页、案例展示。
- V1.3：评价体系、推荐排序、收藏。
- V1.4：一键导入 Hermes-agent、CLI install。
- V1.5：托管支付、退款规则、争议处理、服务商结算。
