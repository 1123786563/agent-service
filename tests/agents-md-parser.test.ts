import { describe, it, expect } from "vitest";
import { parseAgentsMd, safeParseAgentsMd } from "../src/server/agents/agents-md-schema";

const validFrontmatter = `---
id: my-agent
name: My Agent
version: 1.0.0
summary: A sample agent for testing the parser
categories:
  - productivity
skills:
  - name: Chat
    path: skills/chat.md
    description: Chat with the user
workflows:
  - name: Onboard
    path: workflows/onboard.md
    description: Run onboarding workflow
hermes:
  minVersion: 1.0.0
  importType: zip
author:
  name: Test Author
---
# My Agent

This is the body content of the agent.
`;

describe("parseAgentsMd", () => {
  it("parses valid AGENTS.md with frontmatter", () => {
    const result = parseAgentsMd(validFrontmatter);

    expect(result.metadata.id).toBe("my-agent");
    expect(result.metadata.name).toBe("My Agent");
    expect(result.metadata.version).toBe("1.0.0");
    expect(result.metadata.categories).toEqual(["productivity"]);
    expect(result.metadata.skills).toHaveLength(1);
    expect(result.metadata.skills[0].name).toBe("Chat");
    expect(result.content.trim()).toBe("# My Agent\n\nThis is the body content of the agent.");
  });

  it("throws on missing required fields", () => {
    const md = `---
id: bad-agent
---
`;

    expect(() => parseAgentsMd(md)).toThrow();
  });

  it("throws on invalid id format", () => {
    const md = `---
id: INVALID_ID
name: Bad Agent
version: 1.0.0
summary: An agent with a bad id format
categories:
  - test
skills:
  - name: Skill
    path: skills/test.md
    description: A skill
workflows:
  - name: Workflow
    path: workflows/test.md
    description: A workflow
hermes:
  minVersion: 1.0.0
  importType: zip
author:
  name: Author
---
`;
    expect(() => parseAgentsMd(md)).toThrow();
  });
});

describe("safeParseAgentsMd", () => {
  it("returns success for valid input", () => {
    const result = safeParseAgentsMd(validFrontmatter);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.id).toBe("my-agent");
      expect(result.data.content).toContain("# My Agent");
    }
  });

  it("returns error for invalid input without throwing", () => {
    const md = `---
id: bad
---
`;
    const result = safeParseAgentsMd(md);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
