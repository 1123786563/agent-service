# Hermes Agent Store 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 hermes-agent-marketplace 从 agent.json 格式迁移到 AGENTS.md + SOUL.md 格式，新增团队包、付费包和一键导入功能。

**Architecture:** 在现有 Next.js + Prisma + Stripe 架构上，重写 ZIP 校验管线支持双模式（单 Agent / 团队包），用 YAML frontmatter 替代 JSON 元数据，扩展 Prisma 模型和前端页面。

**Tech Stack:** Next.js 15, React 19, Prisma 5, Zod, JSZip, Stripe, gray-matter（新增）, Vitest

---

## File Structure

```
新增文件:
├── src/server/agents/agents-md-parser.ts     # AGENTS.md YAML frontmatter 解析器
├── src/server/agents/soul-md-parser.ts       # SOUL.md 解析器
├── src/server/agents/team-md-parser.ts       # TEAM.md 解析器
├── src/server/agents/single-validator.ts     # 单 Agent ZIP 校验
├── src/server/agents/team-validator.ts       # 团队包 ZIP 校验
├── src/server/agents/pricing-service.ts      # 付费包定价与支付校验
├── src/server/agents/import-service.ts       # 一键导入 token 生成
├── tests/agents-md-parser.test.ts
├── tests/soul-md-parser.test.ts
├── tests/team-md-parser.test.ts
├── tests/single-validator.test.ts
├── tests/team-validator.test.ts
├── tests/pricing-service.test.ts

修改文件:
├── prisma/schema.prisma                      # 新增 PackageType, PricingType, TeamAgent
├── src/server/agents/metadata-schema.ts      # 重写为 AGENTS.md schema
├── src/server/agents/zip-validator.ts        # 重写为双模式分发器
├── src/server/agents/package-service.ts      # 扩展新字段和团队包逻辑
├── src/server/storage/download-authorization.ts  # 新增付费包校验
├── src/app/api/agents/[slug]/download/route.ts   # 付费包支付拦截
├── src/components/agent-detail.tsx            # 新增 SOUL 预览、定价、一键导入
├── src/components/agent-card.tsx              # 新增包类型/价格标签
├── src/app/agents/page.tsx                   # 新增包类型和价格筛选
├── src/app/creator/agents/new/page.tsx       # 更新上传说明
├── src/components/upload-agent-form.tsx       # 支持团队包上传提示
├── src/test/fixtures.ts                      # 重写为 AGENTS.md + SOUL.md 格式
```

---

## Phase 1: 格式解析层

### Task 1: 安装依赖并创建 AGENTS.md 解析器

**Files:**
- Modify: `package.json`（添加 gray-matter 依赖）
- Create: `src/server/agents/agents-md-parser.ts`
- Create: `tests/agents-md-parser.test.ts`

- [ ] **Step 1: 安装 gray-matter**

```bash
cd /Users/yongjunwu/trea/saas-idea
npm install gray-matter
```

Run: `npm install gray-matter`
Expected: 安装成功，package.json 中出现 gray-matter

- [ ] **Step 2: 创建 AGENTS.md Zod schema**

Create `src/server/agents/agents-md-schema.ts`:

```ts
import { z } from "zod";

const safeRelativePath = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("/"), "Path must be relative")
  .refine((v) => !v.includes(".."), "Path cannot include parent traversal");

const skillSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500),
});

const workflowSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500),
});

const envSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  required: z.boolean(),
  description: z.string().min(1).max(300),
});

export const agentsMdFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  summary: z.string().min(10).max(300),
  categories: z.array(z.string().min(1).max(40)).min(1).max(8),
  author: z.object({
    name: z.string().min(1).max(120),
    website: z.string().url().optional(),
  }),
  pricing: z.object({
    type: z.enum(["free", "paid"]),
    price: z.number().min(0).default(0),
  }).default({ type: "free", price: 0 }),
  hermes: z.object({
    minVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  permissions: z.array(z.string().min(1).max(80)).default([]),
  env: z.array(envSchema).default([]),
  skills: z.array(skillSchema).min(1).max(30),
  workflows: z.array(workflowSchema).min(1).max(20),
  service: z
    .object({
      available: z.boolean(),
      types: z.array(z.enum(["customization", "deployment", "training", "integration"])).default([]),
    })
    .default({ available: false, types: [] }),
});

export type AgentsMdFrontmatter = z.infer<typeof agentsMdFrontmatterSchema>;

export type ParsedAgentsMd = {
  frontmatter: AgentsMdFrontmatter;
  behaviorInstructions: string;
};

export function parseAgentsMd(rawContent: string): ParsedAgentsMd {
  const matter = require("gray-matter");
  const parsed = matter(rawContent);

  const frontmatter = agentsMdFrontmatterSchema.parse(parsed.data);

  return {
    frontmatter,
    behaviorInstructions: (parsed.content as string).trim(),
  };
}
```

- [ ] **Step 3: 写 AGENTS.md 解析器测试**

Create `tests/agents-md-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAgentsMd } from "@/server/agents/agents-md-schema";

const validAgentsMd = `---
id: shopping-assistant
name: "Shopping Assistant"
version: 1.0.0
summary: "专业的电商购物助手，帮助用户比价和推荐商品"
categories: [ecommerce, research]
author:
  name: "张三"
  website: "https://example.com"
pricing:
  type: free
  price: 0
hermes:
  minVersion: "2.0.0"
permissions: [web-search, file-read]
env:
  - name: API_KEY
    required: false
    description: "可选 API 密钥"
skills:
  - name: price-compare
    path: skills/price-compare/SKILL.md
    description: "跨平台比价"
  - name: product-search
    path: skills/product-search/SKILL.md
    description: "搜索和筛选商品"
workflows:
  - name: daily-report
    path: workflows/daily-report.md
    description: "每日价格报告"
service:
  available: true
  types: [customization, deployment]
---

## 行为指令

你是一个专业的购物助手。

1. 先理解用户预算
2. 使用 price-compare 技能比价
3. 给出 Top 3 推荐
`;

describe("parseAgentsMd", () => {
  it("parses a valid AGENTS.md with frontmatter and body", () => {
    const result = parseAgentsMd(validAgentsMd);

    expect(result.frontmatter.id).toBe("shopping-assistant");
    expect(result.frontmatter.name).toBe("Shopping Assistant");
    expect(result.frontmatter.version).toBe("1.0.0");
    expect(result.frontmatter.categories).toEqual(["ecommerce", "research"]);
    expect(result.frontmatter.skills).toHaveLength(2);
    expect(result.frontmatter.skills[0].name).toBe("price-compare");
    expect(result.frontmatter.workflows).toHaveLength(1);
    expect(result.frontmatter.pricing.type).toBe("free");
    expect(result.frontmatter.pricing.price).toBe(0);
    expect(result.frontmatter.service.available).toBe(true);
    expect(result.frontmatter.service.types).toEqual(["customization", "deployment"]);
    expect(result.behaviorInstructions).toContain("购物助手");
    expect(result.behaviorInstructions).toContain("price-compare");
  });

  it("applies defaults for optional fields", () => {
    const minimal = `---
id: minimal-agent
name: "Minimal"
version: 1.0.0
summary: "一个最小的智能体，仅包含必填字段用于校验测试"
categories: [test]
author:
  name: "Test"
hermes:
  minVersion: "1.0.0"
skills:
  - name: basic
    path: skills/basic/SKILL.md
    description: "基础技能"
workflows: []
---

Do the thing.
`;
    const result = parseAgentsMd(minimal);

    expect(result.frontmatter.pricing.type).toBe("free");
    expect(result.frontmatter.pricing.price).toBe(0);
    expect(result.frontmatter.permissions).toEqual([]);
    expect(result.frontmatter.env).toEqual([]);
    expect(result.frontmatter.service.available).toBe(false);
  });

  it("throws on missing required fields", () => {
    const invalid = `---
id: bad-agent
name: "Bad"
---

Missing lots of fields.
`;
    expect(() => parseAgentsMd(invalid)).toThrow();
  });

  it("throws on invalid id format", () => {
    const badId = `---
id: "INVALID ID!"
name: "Bad ID"
version: 1.0.0
summary: "测试无效 ID 格式的智能体包校验逻辑是否正常拦截"
categories: [test]
author:
  name: "Test"
hermes:
  minVersion: "1.0.0"
skills:
  - name: basic
    path: skills/basic/SKILL.md
    description: "基础技能"
workflows: []
---

Content.
`;
    expect(() => parseAgentsMd(badId)).toThrow();
  });

  it("parses paid pricing", () => {
    const paid = `---
id: paid-agent
name: "Paid Agent"
version: 1.0.0
summary: "一个付费的智能体包，用于测试定价功能是否正常工作"
categories: [test]
author:
  name: "Test"
pricing:
  type: paid
  price: 9.99
hermes:
  minVersion: "1.0.0"
skills:
  - name: basic
    path: skills/basic/SKILL.md
    description: "基础技能"
workflows: []
---

Content.
`;
    const result = parseAgentsMd(paid);
    expect(result.frontmatter.pricing.type).toBe("paid");
    expect(result.frontmatter.pricing.price).toBe(9.99);
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/agents-md-parser.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/server/agents/agents-md-schema.ts tests/agents-md-parser.test.ts
git commit -m "feat: add AGENTS.md parser with YAML frontmatter schema"
```

---

### Task 2: 创建 SOUL.md 解析器

**Files:**
- Create: `src/server/agents/soul-md-schema.ts`
- Create: `tests/soul-md-parser.test.ts`

- [ ] **Step 1: 写 SOUL.md 解析器和 schema**

Create `src/server/agents/soul-md-schema.ts`:

```ts
import { z } from "zod";

export const soulMdFrontmatterSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  avatar: z.string().optional(),
  language: z.array(z.string()).min(1).default(["en"]),
});

export type SoulMdFrontmatter = z.infer<typeof soulMdFrontmatterSchema>;

export type ParsedSoulMd = {
  frontmatter: SoulMdFrontmatter;
  identity: string;
  personality: string;
  communicationStyle: string;
  boundaries: {
    mustDo: string[];
    neverDo: string[];
    needsConfirmation: string[];
  };
};

function extractSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const startIdx = lines.findIndex((line) => line.trim().match(new RegExp(`^##\\s+${heading}`, "i")));
  if (startIdx === -1) return "";

  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("## ")) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines.join("\n").trim();
}

function extractListSection(content: string, subheading: string): string[] {
  const section = extractSection(content, subheading);
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => line.length > 0);
}

export function parseSoulMd(rawContent: string): ParsedSoulMd {
  const matter = require("gray-matter");
  const parsed = matter(rawContent);

  const frontmatter = soulMdFrontmatterSchema.parse(parsed.data);
  const body = parsed.content as string;

  return {
    frontmatter,
    identity: extractSection(body, "我是谁"),
    personality: extractSection(body, "个性特征"),
    communicationStyle: extractSection(body, "沟通风格"),
    boundaries: {
      mustDo: extractListSection(body, "必须做"),
      neverDo: extractListSection(body, "绝不做"),
      needsConfirmation: extractListSection(body, "需要确认"),
    },
  };
}
```

- [ ] **Step 2: 写 SOUL.md 解析器测试**

Create `tests/soul-md-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSoulMd } from "@/server/agents/soul-md-schema";

const validSoulMd = `---
name: "XiaoGou"
role: "电商购物顾问"
language: ["zh-CN", "en"]
---

## 我是谁

我是一名有 8 年电商行业经验的购物顾问。

## 个性特征

- **热情但不浮夸**：我会为发现好 deal 而兴奋
- **严谨有数据支撑**：每条推荐都附带数据依据

## 沟通风格

- 使用简洁的中文
- 用要点列表呈现对比信息

## 行为边界

### 必须做
- 每次推荐前先确认用户预算
- 始终提供至少 2 个选项

### 绝不做
- 不推荐没查过实际价格的商品
- 不接受付费推广影响推荐顺序

### 需要确认
- 涉及健康安全时提示咨询专业人士
- 价格波动剧烈时提示等待
`;

describe("parseSoulMd", () => {
  it("parses a valid SOUL.md", () => {
    const result = parseSoulMd(validSoulMd);

    expect(result.frontmatter.name).toBe("XiaoGou");
    expect(result.frontmatter.role).toBe("电商购物顾问");
    expect(result.frontmatter.language).toEqual(["zh-CN", "en"]);
    expect(result.identity).toContain("8 年电商");
    expect(result.personality).toContain("热情但不浮夸");
    expect(result.communicationStyle).toContain("要点列表");
    expect(result.boundaries.mustDo).toHaveLength(2);
    expect(result.boundaries.mustDo[0]).toContain("确认用户预算");
    expect(result.boundaries.neverDo).toHaveLength(2);
    expect(result.boundaries.neverDo[0]).toContain("没查过实际价格");
    expect(result.boundaries.needsConfirmation).toHaveLength(2);
  });

  it("applies default language when missing", () => {
    const noLang = `---
name: "Bot"
role: "Helper"
---

## 我是谁

I am a helper bot.
`;
    const result = parseSoulMd(noLang);
    expect(result.frontmatter.language).toEqual(["en"]);
  });

  it("returns empty arrays when boundary sections are absent", () => {
    const noBoundaries = `---
name: "Simple"
role: "Bot"
---

## 我是谁

I am simple.

## 个性特征

Just a bot.
`;
    const result = parseSoulMd(noBoundaries);
    expect(result.boundaries.mustDo).toEqual([]);
    expect(result.boundaries.neverDo).toEqual([]);
    expect(result.boundaries.needsConfirmation).toEqual([]);
  });

  it("throws on missing required fields", () => {
    const empty = `---
name: ""
---

No role.
`;
    expect(() => parseSoulMd(empty)).toThrow();
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/soul-md-parser.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/agents/soul-md-schema.ts tests/soul-md-parser.test.ts
git commit -m "feat: add SOUL.md parser with identity and boundary extraction"
```

---

### Task 3: 创建 TEAM.md 解析器

**Files:**
- Create: `src/server/agents/team-md-schema.ts`
- Create: `tests/team-md-parser.test.ts`

- [ ] **Step 1: 写 TEAM.md 解析器和 schema**

Create `src/server/agents/team-md-schema.ts`:

```ts
import { z } from "zod";

const agentEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  path: z.string().min(1),
  role: z.string().min(1).max(200),
  triggers: z.array(z.string().min(1)),
});

export const teamMdFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  summary: z.string().min(10).max(300),
  categories: z.array(z.string().min(1).max(40)).min(1).max(8),
  author: z.object({
    name: z.string().min(1).max(120),
    website: z.string().url().optional(),
  }),
  pricing: z.object({
    type: z.enum(["free", "paid"]),
    price: z.number().min(0).default(0),
  }).default({ type: "free", price: 0 }),
  hermes: z.object({
    minVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  agents: z.array(agentEntrySchema).min(2).max(20),
  routing: z.object({
    default: z.string(),
    fallback: z.string(),
  }),
  shared: z.array(z.object({
    path: z.string().min(1),
    description: z.string().min(1).max(300),
  })).default([]),
});

export type TeamMdFrontmatter = z.infer<typeof teamMdFrontmatterSchema>;

export type ParsedTeamMd = {
  frontmatter: TeamMdFrontmatter;
  collaborationRules: string;
};

export function parseTeamMd(rawContent: string): ParsedTeamMd {
  const matter = require("gray-matter");
  const parsed = matter(rawContent);

  const frontmatter = teamMdFrontmatterSchema.parse(parsed.data);

  return {
    frontmatter,
    collaborationRules: (parsed.content as string).trim(),
  };
}
```

- [ ] **Step 2: 写 TEAM.md 解析器测试**

Create `tests/team-md-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTeamMd } from "@/server/agents/team-md-schema";

const validTeamMd = `---
id: ecommerce-ops-team
name: "电商运营团队"
version: 1.0.0
summary: "完整的电商运营团队，包含购物顾问、客服、数据分析师"
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
    role: "前端购物顾问"
    triggers: ["用户咨询商品", "比价请求"]
  - id: customer-service
    path: agents/customer-service
    role: "售后服务"
    triggers: ["售后问题", "退换货"]
  - id: data-analyst
    path: agents/data-analyst
    role: "后台分析"
    triggers: ["数据报告", "运营分析"]
routing:
  default: shopping-assistant
  fallback: customer-service
shared:
  - path: shared/knowledge-base.md
    description: "品牌知识"
---

## 团队协作规则

用户请求先由 shopping-assistant 接收。
`;

describe("parseTeamMd", () => {
  it("parses a valid TEAM.md", () => {
    const result = parseTeamMd(validTeamMd);

    expect(result.frontmatter.id).toBe("ecommerce-ops-team");
    expect(result.frontmatter.agents).toHaveLength(3);
    expect(result.frontmatter.agents[0].id).toBe("shopping-assistant");
    expect(result.frontmatter.routing.default).toBe("shopping-assistant");
    expect(result.frontmatter.routing.fallback).toBe("customer-service");
    expect(result.frontmatter.pricing.type).toBe("paid");
    expect(result.frontmatter.pricing.price).toBe(29.99);
    expect(result.collaborationRules).toContain("shopping-assistant");
  });

  it("throws when agents has fewer than 2 entries", () => {
    const single = `---
id: solo-team
name: "Solo"
version: 1.0.0
summary: "只有一个 Agent 的团队，应该校验失败因为不符合最低数量要求"
categories: [test]
author:
  name: "Test"
hermes:
  minVersion: "1.0.0"
agents:
  - id: solo
    path: agents/solo
    role: "Only one"
    triggers: ["any"]
routing:
  default: solo
  fallback: solo
---

Rules.
`;
    expect(() => parseTeamMd(single)).toThrow();
  });

  it("throws on missing routing", () => {
    const noRouting = validTeamMd.replace(/routing:\n(\s+.*\n)+/g, "");
    expect(() => parseTeamMd(noRouting)).toThrow();
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/team-md-parser.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/agents/team-md-schema.ts tests/team-md-parser.test.ts
git commit -m "feat: add TEAM.md parser for multi-agent packages"
```

---

## Phase 2: Prisma Schema 迁移

### Task 4: 扩展 Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 在 schema.prisma 底部新增枚举和模型**

在 `prisma/schema.prisma` 文件末尾追加：

```prisma
enum PackageType {
  SINGLE
  TEAM
}

enum PricingType {
  FREE
  PAID
}

model TeamAgent {
  id          String  @id @default(cuid())
  teamId      String  @map("team_id")
  agentId     String  @map("agent_id")
  role        String
  triggers    String[]
  sortOrder   Int     @default(0) @map("sort_order")

  team        AgentPackage @relation("TeamMembers", fields: [teamId], references: [id], onDelete: Cascade)
  agent       AgentPackage @relation("TeamMembers", fields: [agentId], references: [id], onDelete: Cascade)

  @@unique([teamId, agentId])
  @@map("team_agents")
}
```

- [ ] **Step 2: 在 AgentPackage 模型中新增字段**

在 `AgentPackage` 模型的 `publishedAt` 字段后、`createdAt` 字段前，新增：

```prisma
  packageType       PackageType  @default(SINGLE) @map("package_type")
  pricingType       PricingType  @default(FREE) @map("pricing_type")
  priceCents        Int          @default(0) @map("price_cents")
  platformFeeRate   Int          @default(20) @map("platform_fee_rate")
  soulPreview       String?      @map("soul_preview")
  behaviorDigest    String?      @map("behavior_digest")
  routingDefault    String?      @map("routing_default")
  routingFallback   String?      @map("routing_fallback")
```

在 `AgentPackage` 模型的 relations 部分末尾新增：

```prisma
  childAgents       TeamAgent[]  @relation("TeamMembers")
  parentTeam        TeamAgent?   @relation("TeamMembers")
```

- [ ] **Step 3: 运行迁移**

```bash
npx prisma migrate dev --name add_package_type_pricing_team
```

Expected: Migration created and applied successfully

- [ ] **Step 4: 重新生成 Prisma client**

```bash
npx prisma generate
```

Expected: Prisma client generated

- [ ] **Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: add PackageType, PricingType enums and TeamAgent model"
```

---

## Phase 3: ZIP 校验管线重写

### Task 5: 重写 ZIP 校验为双模式

**Files:**
- Create: `src/server/agents/single-validator.ts`
- Create: `src/server/agents/team-validator.ts`
- Modify: `src/server/agents/zip-validator.ts`
- Modify: `src/test/fixtures.ts`
- Create: `tests/single-validator.test.ts`
- Create: `tests/team-validator.test.ts`

- [ ] **Step 1: 重写 test fixtures 为 AGENTS.md + SOUL.md 格式**

Replace the entire content of `src/test/fixtures.ts`:

```ts
import JSZip from "jszip";

export function createValidAgentsMd(overrides: Record<string, string> = {}): string {
  return `---
id: research-assistant
name: "Research Assistant"
version: 1.0.0
summary: "帮助用户完成资料调研、摘要和报告初稿。"
categories: [research, writing]
author:
  name: "测试作者"
  website: "https://example.com"
pricing:
  type: free
  price: 0
hermes:
  minVersion: "2.0.0"
permissions: [network.optional]
env:
  - name: OPENAI_API_KEY
    required: true
    description: "用于调用模型"
skills:
  - name: web-research
    path: skills/web-research/SKILL.md
    description: "检索、筛选和整理资料"
workflows:
  - name: default
    path: workflows/main.json
    description: "从用户问题到研究报告的默认流程"
service:
  available: true
  types: [customization]
---

## 行为指令

1. 理解用户的研究问题
2. 使用 web-research 技能检索资料
3. 整理成结构化的研究报告
`;
}

export function createValidSoulMd(): string {
  return `---
name: "ResearchBot"
role: "研究助手"
language: ["zh-CN"]
---

## 我是谁

我是一名专业的研究助手，擅长资料检索和报告撰写。

## 个性特征

- **严谨**：每个结论都要求有来源支撑
- **高效**：用最短时间给出最有价值的信息

## 沟通风格

- 使用简洁的中文
- 用结构化列表呈现信息

## 行为边界

### 必须做
- 标注所有信息来源

### 绝不做
- 不编造不存在的来源

### 需要确认
- 当研究结果存在矛盾时提示用户
`;
}

export async function createSingleAgentZip(overrides: Record<string, string> = {}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("AGENTS.md", createValidAgentsMd());
  zip.file("SOUL.md", createValidSoulMd());
  zip.file("README.md", "# Research Assistant\n\n导入 Hermes-agent 后运行默认工作流。");
  zip.file("skills/web-research/SKILL.md", "# Web Research\n\n检索并整理资料。");
  zip.file("workflows/main.json", JSON.stringify({ steps: ["web-research"] }));

  for (const [path, content] of Object.entries(overrides)) {
    zip.file(path, content);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export async function createTeamZip(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("TEAM.md", `---
id: ecommerce-team
name: "电商团队"
version: 1.0.0
summary: "完整的电商运营团队，包含购物顾问和客服两个角色协同工作"
categories: [ecommerce]
author:
  name: "测试作者"
hermes:
  minVersion: "2.0.0"
agents:
  - id: shopper
    path: agents/shopper
    role: "购物顾问"
    triggers: ["比价", "推荐"]
  - id: support
    path: agents/support
    role: "客服"
    triggers: ["售后", "退换货"]
routing:
  default: shopper
  fallback: support
---

## 团队协作规则

购物顾问接待，售后转客服。
`);

  zip.file("agents/shopper/AGENTS.md", `---
id: shopper
name: "购物顾问"
version: 1.0.0
summary: "帮助用户比价和推荐商品的购物顾问智能体"
categories: [ecommerce]
author:
  name: "测试作者"
hermes:
  minVersion: "2.0.0"
skills:
  - name: compare
    path: skills/compare/SKILL.md
    description: "比价"
workflows: []
---

比价并推荐。
`);

  zip.file("agents/shopper/SOUL.md", `---
name: "ShopperBot"
role: "购物顾问"
---

## 我是谁

我是购物顾问。

## 个性特征

- 专业

## 沟通风格

- 简洁

## 行为边界

### 必须做
- 比较价格

### 绝不做
- 不编造价格

### 需要确认
- 价格波动大时提示
`);

  zip.file("agents/shopper/skills/compare/SKILL.md", "# Compare\n\n比价技能。");
  zip.file("agents/support/AGENTS.md", `---
id: support
name: "客服"
version: 1.0.0
summary: "处理售后问题和退换货的客服智能体"
categories: [ecommerce]
author:
  name: "测试作者"
hermes:
  minVersion: "2.0.0"
skills:
  - name: refund
    path: skills/refund/SKILL.md
    description: "处理退款"
workflows: []
---

处理售后。
`);

  zip.file("agents/support/SOUL.md", `---
name: "SupportBot"
role: "客服"
---

## 我是谁

我是客服。

## 个性特征

- 耐心

## 沟通风格

- 礼貌

## 行为边界

### 必须做
- 记录问题

### 绝不做
- 不承诺赔偿金额

### 需要确认
- 涉及退款时确认金额
`);

  zip.file("agents/support/skills/refund/SKILL.md", "# Refund\n\n退款技能。");
  zip.file("README.md", "# 电商团队\n\n多 Agent 团队包。");

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
```

- [ ] **Step 2: 创建单 Agent 校验器**

Create `src/server/agents/single-validator.ts`:

```ts
import JSZip from "jszip";
import { parseAgentsMd } from "./agents-md-schema";
import { parseSoulMd } from "./soul-md-schema";
import type { ParsedAgentsMd } from "./agents-md-schema";
import type { ParsedSoulMd } from "./soul-md-schema";

export type SingleValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  agentsMd?: ParsedAgentsMd;
  soulMd?: ParsedSoulMd;
};

const REQUIRED_FILES = ["AGENTS.md", "SOUL.md", "README.md"];
const DANGEROUS_EXTENSIONS = [".exe", ".dmg", ".pkg", ".bat", ".cmd", ".ps1"];
const SCRIPT_EXTENSIONS = [".sh", ".js", ".ts", ".py", ".rb"];

export async function validateSingleAgentZip(buffer: Buffer): Promise<SingleValidationResult> {
  const errors: string[] = [];
  const risks: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { ok: false, errors: ["Invalid ZIP archive"], risks, fileNames: [], agentsMd: undefined, soulMd: undefined };
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  for (const [fileName, entry] of Object.entries(zip.files)) {
    const lowerName = fileName.toLowerCase();
    if (DANGEROUS_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      errors.push(`Dangerous file type: ${fileName}`);
    }
    if (SCRIPT_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      risks.push(`script.file:${fileName}`);
    }
  }

  for (const requiredFile of REQUIRED_FILES) {
    if (!zip.file(requiredFile)) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  let agentsMd: ParsedAgentsMd | undefined;
  const agentsMdFile = zip.file("AGENTS.md");
  if (agentsMdFile) {
    try {
      const rawContent = await agentsMdFile.async("string");
      agentsMd = parseAgentsMd(rawContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AGENTS.md error";
      errors.push(`AGENTS.md error: ${message}`);
    }
  }

  let soulMd: ParsedSoulMd | undefined;
  const soulMdFile = zip.file("SOUL.md");
  if (soulMdFile) {
    try {
      const rawContent = await soulMdFile.async("string");
      soulMd = parseSoulMd(rawContent);
      if (!soulMd.identity) {
        errors.push('SOUL.md must contain a "## 我是谁" section');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SOUL.md error";
      errors.push(`SOUL.md error: ${message}`);
    }
  }

  if (agentsMd) {
    for (const skill of agentsMd.frontmatter.skills) {
      if (!zip.file(skill.path)) {
        errors.push(`Referenced skill file not found: ${skill.path}`);
      }
    }
    for (const workflow of agentsMd.frontmatter.workflows) {
      if (!zip.file(workflow.path)) {
        errors.push(`Referenced workflow file not found: ${workflow.path}`);
      }
    }
    for (const permission of agentsMd.frontmatter.permissions) {
      if (permission.includes("network")) risks.push("network.permission");
      if (permission.includes("filesystem.write")) risks.push("filesystem.write.permission");
    }
    if (agentsMd.frontmatter.env.length >= 3) risks.push("multiple.env.vars");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    risks: [...new Set(risks)],
    fileNames,
    agentsMd,
    soulMd,
  };
}
```

- [ ] **Step 3: 创建团队包校验器**

Create `src/server/agents/team-validator.ts`:

```ts
import JSZip from "jszip";
import { parseTeamMd } from "./team-md-schema";
import { parseAgentsMd } from "./agents-md-schema";
import { parseSoulMd } from "./soul-md-schema";
import type { ParsedTeamMd } from "./team-md-schema";
import type { ParsedAgentsMd } from "./agents-md-schema";
import type { ParsedSoulMd } from "./soul-md-schema";

export type TeamValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  teamMd?: ParsedTeamMd;
  agentResults: Array<{
    path: string;
    agentsMd?: ParsedAgentsMd;
    soulMd?: ParsedSoulMd;
    errors: string[];
  }>;
};

const REQUIRED_FILES = ["TEAM.md", "README.md"];

export async function validateTeamZip(buffer: Buffer): Promise<TeamValidationResult> {
  const errors: string[] = [];
  const risks: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { ok: false, errors: ["Invalid ZIP archive"], risks, fileNames: [], agentResults: [] };
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  for (const requiredFile of REQUIRED_FILES) {
    if (!zip.file(requiredFile)) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  let teamMd: ParsedTeamMd | undefined;
  const teamMdFile = zip.file("TEAM.md");
  if (teamMdFile) {
    try {
      const rawContent = await teamMdFile.async("string");
      teamMd = parseTeamMd(rawContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown TEAM.md error";
      errors.push(`TEAM.md error: ${message}`);
    }
  }

  if (teamMd) {
    const agentIds = teamMd.frontmatter.agents.map((a) => a.id);
    if (!agentIds.includes(teamMd.frontmatter.routing.default)) {
      errors.push(`routing.default "${teamMd.frontmatter.routing.default}" not found in agents list`);
    }
    if (!agentIds.includes(teamMd.frontmatter.routing.fallback)) {
      errors.push(`routing.fallback "${teamMd.frontmatter.routing.fallback}" not found in agents list`);
    }
  }

  const agentResults: TeamValidationResult["agentResults"] = [];
  if (teamMd) {
    for (const agentEntry of teamMd.frontmatter.agents) {
      const agentPath = agentEntry.path.replace(/\/$/, "");
      const result: TeamValidationResult["agentResults"][0] = { path: agentPath, errors: [] };

      const agentsMdFile = zip.file(`${agentPath}/AGENTS.md`);
      const soulMdFile = zip.file(`${agentPath}/SOUL.md`);

      if (!agentsMdFile) {
        result.errors.push(`${agentPath}/AGENTS.md not found`);
      } else {
        try {
          const raw = await agentsMdFile.async("string");
          result.agentsMd = parseAgentsMd(raw);
          for (const skill of result.agentsMd.frontmatter.skills) {
            if (!zip.file(`${agentPath}/${skill.path}`)) {
              result.errors.push(`Agent ${agentEntry.id}: skill file not found: ${agentPath}/${skill.path}`);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          result.errors.push(`${agentPath}/AGENTS.md error: ${message}`);
        }
      }

      if (!soulMdFile) {
        result.errors.push(`${agentPath}/SOUL.md not found`);
      } else {
        try {
          const raw = await soulMdFile.async("string");
          result.soulMd = parseSoulMd(raw);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          result.errors.push(`${agentPath}/SOUL.md error: ${message}`);
        }
      }

      agentResults.push(result);
      for (const err of result.errors) errors.push(err);
    }
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    risks: [...new Set(risks)],
    fileNames,
    teamMd,
    agentResults,
  };
}
```

- [ ] **Step 4: 重写 zip-validator.ts 为双模式分发器**

Replace the entire content of `src/server/agents/zip-validator.ts`:

```ts
import JSZip from "jszip";
import { validateSingleAgentZip, type SingleValidationResult } from "./single-validator";
import { validateTeamZip, type TeamValidationResult } from "./team-validator";

export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_TEAM_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_COUNT = 250;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

export type ZipValidationResult =
  | ({ packageType: "single" } & SingleValidationResult)
  | ({ packageType: "team" } & TeamValidationResult);

export async function validateAgentZip(buffer: Buffer): Promise<ZipValidationResult> {
  const maxBytes = MAX_ZIP_BYTES;
  if (buffer.byteLength > maxBytes) {
    return {
      packageType: "single",
      ok: false,
      errors: [`ZIP exceeds ${maxBytes} bytes`],
      risks: [],
      fileNames: [],
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      packageType: "single",
      ok: false,
      errors: ["Uploaded file is not a readable ZIP archive"],
      risks: [],
      fileNames: [],
    };
  }

  const hasTeamMd = Boolean(zip.file("TEAM.md"));

  if (hasTeamMd) {
    return { packageType: "team", ...(await validateTeamZip(buffer)) };
  }

  return { packageType: "single", ...(await validateSingleAgentZip(buffer)) };
}
```

- [ ] **Step 5: 写 single-validator 测试**

Create `tests/single-validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSingleAgentZip } from "@/test/fixtures";
import { validateSingleAgentZip } from "@/server/agents/single-validator";

describe("validateSingleAgentZip", () => {
  it("passes a valid single agent ZIP", async () => {
    const buffer = await createSingleAgentZip();
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.agentsMd).toBeDefined();
    expect(result.agentsMd!.frontmatter.id).toBe("research-assistant");
    expect(result.soulMd).toBeDefined();
    expect(result.soulMd!.frontmatter.name).toBe("ResearchBot");
  });

  it("fails when AGENTS.md is missing", async () => {
    const buffer = await createSingleAgentZip({ "AGENTS.md": null as unknown as string });
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: AGENTS.md");
  });

  it("fails when SOUL.md is missing", async () => {
    const buffer = await createSingleAgentZip({ "SOUL.md": null as unknown as string });
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: SOUL.md");
  });

  it("fails when a declared skill file is missing", async () => {
    const buffer = await createSingleAgentZip({ "skills/web-research/SKILL.md": null as unknown as string });
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Referenced skill file not found"))).toBe(true);
  });

  it("detects script files as risks", async () => {
    const buffer = await createSingleAgentZip({ "scripts/setup.sh": "#!/bin/bash\necho hi" });
    const result = await validateSingleAgentZip(buffer);

    expect(result.risks).toContain("script.file:scripts/setup.sh");
  });
});
```

- [ ] **Step 6: 运行 single-validator 测试**

```bash
npx vitest run tests/single-validator.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 7: 写 team-validator 测试**

Create `tests/team-validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createTeamZip } from "@/test/fixtures";
import { validateTeamZip } from "@/server/agents/team-validator";

describe("validateTeamZip", () => {
  it("passes a valid team ZIP", async () => {
    const buffer = await createTeamZip();
    const result = await validateTeamZip(buffer);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.teamMd).toBeDefined();
    expect(result.teamMd!.frontmatter.agents).toHaveLength(2);
    expect(result.agentResults).toHaveLength(2);
  });

  it("fails when TEAM.md is missing", async () => {
    const JSZip = require("jszip");
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    zip.remove("TEAM.md");
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateTeamZip(newBuffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: TEAM.md");
  });

  it("fails when a child agent SOUL.md is missing", async () => {
    const JSZip = require("jszip");
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    zip.remove("agents/shopper/SOUL.md");
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateTeamZip(newBuffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("agents/shopper/SOUL.md not found"))).toBe(true);
  });

  it("fails when routing.default references non-existent agent", async () => {
    const JSZip = require("jszip");
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    const teamMd = await zip.file("TEAM.md")!.async("string");
    zip.file("TEAM.md", teamMd.replace("default: shopper", "default: non-existent"));
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateTeamZip(newBuffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("routing.default"))).toBe(true);
  });
});
```

- [ ] **Step 8: 运行 team-validator 测试**

```bash
npx vitest run tests/team-validator.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 9: 运行所有测试确认无回归**

```bash
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/server/agents/single-validator.ts src/server/agents/team-validator.ts src/server/agents/zip-validator.ts src/test/fixtures.ts tests/single-validator.test.ts tests/team-validator.test.ts
git commit -m "feat: rewrite ZIP validator with dual-mode (single agent + team package)"
```

---

## Phase 4: Package Service 更新

### Task 6: 更新 Package Service 支持新格式

**Files:**
- Modify: `src/server/agents/package-service.ts`

- [ ] **Step 1: 更新 createAgentPackageFromZip 处理新格式**

在 `src/server/agents/package-service.ts` 中，修改 `createAgentPackageFromZip` 函数。关键改动点：

1. 导入新类型：在文件顶部新增：
```ts
import { validateAgentZip, type ZipValidationResult } from "./zip-validator";
```

2. 更新 `CreateAgentPackageSuccess` 类型：
```ts
export type CreateAgentPackageSuccess = {
  ok: true;
  package: AgentPackageWithRelations;
  storage: StoredZipFile;
  risks: string[];
  packageType: "single" | "team";
};
```

3. 在 `createAgentPackageFromZip` 函数中，`validation` 成功后，根据 `packageType` 提取数据：

在 `if (!validation.ok || ...) return { ok: false, ... }` 之后，`const storage = ...` 之后，`const createdPackage = ...` 之前，新增字段提取逻辑：

```ts
    const packageType = validation.packageType;
    const isPaid = packageType === "single"
      ? (validation as { packageType: "single" } & { agentsMd?: { frontmatter: { pricing: { type: string; price: number } } } }).agentsMd?.frontmatter.pricing.type === "paid"
      : (validation as { packageType: "team" } & { teamMd?: { frontmatter: { pricing: { type: string; price: number } } } }).teamMd?.frontmatter.pricing.type === "paid";
    const pricingPrice = packageType === "single"
      ? ((validation as any).agentsMd?.frontmatter.pricing.price ?? 0)
      : ((validation as any).teamMd?.frontmatter.pricing.price ?? 0);
    const soulPreview = packageType === "single"
      ? ((validation as any).soulMd?.identity?.slice(0, 200) ?? null)
      : null;
    const behaviorDigest = packageType === "single"
      ? ((validation as any).agentsMd?.behaviorInstructions?.slice(0, 500) ?? null)
      : null;
```

4. 在 `deps.packageStore.createPackage` 的 `data` 对象中新增字段：

```ts
            packageType: packageType === "single" ? "SINGLE" : "TEAM",
            pricingType: isPaid ? "PAID" : "FREE",
            priceCents: Math.round(pricingPrice * 100),
            soulPreview,
            behaviorDigest,
```

5. 在返回成功结果时新增 `packageType`：

```ts
    return {
      ok: true,
      package: createdPackage,
      storage,
      risks: validation.risks,
      packageType,
    };
```

- [ ] **Step 2: 更新 listPublishedPackages 支持包类型和价格筛选**

在 `normalizeListOptions` 和 `listPublishedPackages` 中新增参数：

```ts
export type ListPublishedPackagesOptions = {
  query?: string;
  category?: string;
  sort?: PublishedPackageSort;
  packageType?: "SINGLE" | "TEAM";
  pricingType?: "FREE" | "PAID";
};
```

在 Prisma 查询的 `where` 条件中追加：

```ts
          ...(options.packageType ? { packageType: options.packageType } : {}),
          ...(options.pricingType ? { pricingType: options.pricingType } : {}),
```

- [ ] **Step 3: Commit**

```bash
git add src/server/agents/package-service.ts
git commit -m "feat: update package service for AGENTS.md format, pricing, and team packages"
```

---

## Phase 5: API 层更新

### Task 7: 更新下载 API 支持付费包

**Files:**
- Modify: `src/server/storage/download-authorization.ts`
- Modify: `src/app/api/agents/[slug]/download/route.ts`

- [ ] **Step 1: 在 download-authorization.ts 中新增付费包校验**

在 `authorizeAgentZipDownload` 函数的 `select` 中追加 `pricingType` 和 `priceCents`：

```ts
      pricingType: true,
      priceCents: true,
```

在函数返回值中追加 `pricingType` 和 `priceCents`。

- [ ] **Step 2: 更新 download route 处理付费包**

在 `src/app/api/agents/[slug]/download/route.ts` 的 GET handler 中，`authorizeAgentZipDownload` 调用之后新增付费拦截：

```ts
  if (authorization.pricingType === "PAID") {
    const paid = url.searchParams.get("paid");
    if (paid !== "1") {
      return Response.json(
        { error: "Payment required", priceCents: authorization.priceCents },
        { status: 402 }
      );
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/server/storage/download-authorization.ts src/app/api/agents/[slug]/download/route.ts
git commit -m "feat: add paid package gate on download API"
```

---

## Phase 6: 前端更新

### Task 8: 更新 Agent 详情页

**Files:**
- Modify: `src/components/agent-detail.tsx`

- [ ] **Step 1: 在 AgentDetail 组件中新增 SOUL 预览 Tab 和定价展示**

在 `agent-detail.tsx` 的 imports 中追加：
```ts
import { useState } from "react";
```

在 `AgentDetail` 函数顶部新增 state：
```ts
  const [activeTab, setActiveTab] = useState<"overview" | "skills" | "soul" | "service">("overview");
```

在 reservation-card 的下载按钮上方新增价格展示：
```tsx
{agentPackage.pricingType === "PAID" && (
  <div className="reservation-price">
    <strong>${((agentPackage.priceCents ?? 0) / 100).toFixed(2)}</strong>
    <span className="muted">一次性购买</span>
  </div>
)}
```

在详情页的 reservation-card 中，将"下载 ZIP"按钮改为：
```tsx
{agentPackage.pricingType === "PAID" ? (
  <a className="button" href={`/api/agents/${agentPackage.slug}/download?paid=1`}>
    购买并下载 (${((agentPackage.priceCents ?? 0) / 100).toFixed(2)} USD)
  </a>
) : (
  <>
    <a className="button" href={`hermes://import?url=${encodeURIComponent(`/api/agents/${agentPackage.slug}/download`)}&token=auto`}>
      一键导入 Hermes
    </a>
    <a className="button secondary" href={`/api/agents/${agentPackage.slug}/download`}>
      下载 ZIP
    </a>
  </>
)}
```

在 Skills section 和 Workflows section 之间，新增 SOUL 预览 section：
```tsx
      {/* ── SOUL Preview ── */}
      {agentPackage.soulPreview && (
        <section className="panel">
          <h2>人格预览</h2>
          <p className="muted">这是 Agent 的身份简介，完整 SOUL.md 在导入后可见。</p>
          <blockquote>{agentPackage.soulPreview}</blockquote>
        </section>
      )}
```

在包类型信息中新增标识：
```tsx
{agentPackage.packageType === "TEAM" && (
  <div className="amenity-item">
    <span className="amenity-icon">TEAM</span>
    <span>团队包（多 Agent 协作）</span>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/agent-detail.tsx
git commit -m "feat: add SOUL preview, pricing display, and one-click import to detail page"
```

---

### Task 9: 更新 Agent 列表页和卡片

**Files:**
- Modify: `src/components/agent-card.tsx`
- Modify: `src/app/agents/page.tsx`

- [ ] **Step 1: 在 AgentCard 中新增包类型和价格标签**

在 `agent-card.tsx` 的卡片信息区域，在 `skills.length` 那行之前新增：
```tsx
        {agentPackage.packageType === "TEAM" && <span className="badge">团队包</span>}
        {agentPackage.pricingType === "PAID" && <span className="badge">${((agentPackage.priceCents ?? 0) / 100).toFixed(2)}</span>}
```

- [ ] **Step 2: 在列表页新增包类型和价格筛选**

在 `agents/page.tsx` 的 `AgentsSearchParams` 类型中追加：
```ts
  type?: string | string[];   // "SINGLE" | "TEAM"
  pricing?: string | string[]; // "FREE" | "PAID"
```

在 `getFirstParam` 之后新增：
```ts
  const packageType = getFirstParam(resolvedSearchParams?.type) ?? "";
  const pricingType = getFirstParam(resolvedSearchParams?.pricing) ?? "";
```

在 `listPublishedAgentPackages` 调用中追加参数：
```ts
    packages = await listPublishedAgentPackages({
      query,
      category,
      sort: normalizedSort,
      packageType: packageType as "SINGLE" | "TEAM" | undefined,
      pricingType: pricingType as "FREE" | "PAID" | undefined,
    });
```

在 category-strip-nav 中新增筛选 chip：
```tsx
        <Link
          className={`category-chip${packageType === "TEAM" ? " active" : ""}`}
          href={packageType ? buildAgentsUrl() : buildAgentsUrl({ type: "TEAM" })}
        >
          <span>T</span>
          Team packages
        </Link>
        <Link
          className={`category-chip${pricingType === "PAID" ? " active" : ""}`}
          href={pricingType ? buildAgentsUrl() : buildAgentsUrl({ pricing: "PAID" })}
        >
          <span>$</span>
          Paid only
        </Link>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agent-card.tsx src/app/agents/page.tsx
git commit -m "feat: add package type and pricing filters to listing page"
```

---

### Task 10: 更新创建者上传页面

**Files:**
- Modify: `src/app/creator/agents/new/page.tsx`
- Modify: `src/components/upload-agent-form.tsx`

- [ ] **Step 1: 更新上传说明文案**

在 `src/app/creator/agents/new/page.tsx` 中，将说明从 "ZIP 必须包含 agent.json 和 README.md" 改为：

```tsx
          <p className="lede">ZIP 必须包含 AGENTS.md、SOUL.md 和 README.md。团队包需要 TEAM.md。</p>
```

将检查列表更新为：
```tsx
          <div className="amenity-item">
            <span className="amenity-icon">AG</span>
            <span>单 Agent 包需要 AGENTS.md + SOUL.md + README.md</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">TM</span>
            <span>团队包需要 TEAM.md + agents/ 目录下的子 Agent</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">SK</span>
            <span>skill 和 workflow 路径必须真实存在</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">VAL</span>
            <span>平台会自动校验 AGENTS.md 元数据和 SOUL.md 身份</span>
          </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/creator/agents/new/page.tsx
git commit -m "feat: update creator upload page for AGENTS.md + SOUL.md format"
```

---

## Phase 7: 构建验证

### Task 11: 全量测试和构建验证

- [ ] **Step 1: 运行全部单元测试**

```bash
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 2: 运行 Next.js 构建**

```bash
npm run build
```

Expected: Build succeeds with no type errors

- [ ] **Step 3: 修复任何构建错误**

如果构建失败，根据错误信息修复类型或导入问题，然后重新构建。

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: Hermes Agent Store — AGENTS.md + SOUL.md format, team packages, pricing, one-click import"
```
