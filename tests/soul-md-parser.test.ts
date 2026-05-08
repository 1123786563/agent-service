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
