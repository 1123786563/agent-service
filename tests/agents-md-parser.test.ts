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
