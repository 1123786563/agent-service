import JSZip from "jszip";

export function createValidAgentsMd(): string {
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

export async function createSingleAgentZip(overrides: Record<string, string | null> = {}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("AGENTS.md", createValidAgentsMd());
  zip.file("SOUL.md", createValidSoulMd());
  zip.file("README.md", "# Research Assistant\n\n导入 Hermes-agent 后运行默认工作流。");
  zip.file("skills/web-research/SKILL.md", "# Web Research\n\n检索并整理资料。");
  zip.file("workflows/main.json", JSON.stringify({ steps: ["web-research"] }));

  for (const [path, content] of Object.entries(overrides)) {
    if (content === null) {
      zip.remove(path);
    } else {
      zip.file(path, content);
    }
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export async function createTeamZip(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "TEAM.md",
    `---
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
`
  );

  zip.file(
    "agents/shopper/AGENTS.md",
    `---
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
`
  );

  zip.file(
    "agents/shopper/SOUL.md",
    `---
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
`
  );

  zip.file("agents/shopper/skills/compare/SKILL.md", "# Compare\n\n比价技能。");

  zip.file(
    "agents/support/AGENTS.md",
    `---
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
`
  );

  zip.file(
    "agents/support/SOUL.md",
    `---
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
`
  );

  zip.file("agents/support/skills/refund/SKILL.md", "# Refund\n\n退款技能。");
  zip.file("README.md", "# 电商团队\n\n多 Agent 团队包。");

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
