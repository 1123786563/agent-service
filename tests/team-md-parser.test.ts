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
    const noRouting = `---
id: no-routing-team
name: "No Routing"
version: 1.0.0
summary: "缺少路由定义的团队包，应该校验失败"
categories: [test]
author:
  name: "Test"
hermes:
  minVersion: "1.0.0"
agents:
  - id: agent-a
    path: agents/a
    role: "Agent A"
    triggers: ["any"]
  - id: agent-b
    path: agents/b
    role: "Agent B"
    triggers: ["any"]
---

Rules.
`;
    expect(() => parseTeamMd(noRouting)).toThrow();
  });
});
