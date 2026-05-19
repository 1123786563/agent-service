import { describe, expect, it } from "vitest";
import { generateOpenApiSpec } from "@/lib/moderation/openapi-spec";

describe("generateOpenApiSpec", () => {
  const spec = generateOpenApiSpec();

  it("produces a valid OpenAPI 3.1 spec", () => {
    expect(spec).toHaveProperty("openapi", "3.1.0");
    expect(spec).toHaveProperty("info.title", "Content Moderation API");
    expect(spec).toHaveProperty("info.version", "1.0.0");
    expect(spec).toHaveProperty("servers");
    expect((spec as any).servers[0].url).toBe("/api/v1");
  });

  it("includes security schemes", () => {
    const components = (spec as any).components;
    expect(components.securitySchemes.BearerAuth).toBeDefined();
    expect(components.securitySchemes.BearerAuth.type).toBe("http");
    expect(components.securitySchemes.BearerAuth.scheme).toBe("bearer");
  });

  it("includes all core endpoints", () => {
    const paths = Object.keys((spec as any).paths);
    expect(paths).toContain("/moderation/analyze-text");
    expect(paths).toContain("/moderation/analyze-image");
    expect(paths).toContain("/moderation/analyze-images");
    expect(paths).toContain("/moderation/queue");
    expect(paths).toContain("/moderation/analytics");
    expect(paths).toContain("/moderation/events");
    expect(paths).toContain("/moderation/health");
    expect(paths).toContain("/moderation/webhooks");
    expect(paths).toContain("/moderation/webhooks/{id}");
    expect(paths).toContain("/moderation/usage");
  });

  it("includes all request/response schemas", () => {
    const schemas = Object.keys((spec as any).components.schemas);
    expect(schemas).toContain("TextAnalysisRequest");
    expect(schemas).toContain("TextAnalysisResponse");
    expect(schemas).toContain("TextAnalysisResult");
    expect(schemas).toContain("FlaggedPhrase");
    expect(schemas).toContain("ImageAnalysisResult");
    expect(schemas).toContain("QueueItem");
    expect(schemas).toContain("QueueActionRequest");
    expect(schemas).toContain("DashboardMetrics");
    expect(schemas).toContain("WebhookRegistration");
    expect(schemas).toContain("WebhookResponse");
    expect(schemas).toContain("ApiKeyResponse");
    expect(schemas).toContain("Error");
  });

  it("has POST method for analyze-text", () => {
    const path = (spec as any).paths["/moderation/analyze-text"];
    expect(path.post).toBeDefined();
    expect(path.post.security).toEqual([{ BearerAuth: [] }]);
    expect(path.post.requestBody.required).toBe(true);
  });

  it("has GET and POST methods for queue", () => {
    const path = (spec as any).paths["/moderation/queue"];
    expect(path.get).toBeDefined();
    expect(path.post).toBeDefined();
  });

  it("has query parameters for analytics", () => {
    const path = (spec as any).paths["/moderation/analytics"];
    const params = path.get.parameters;
    expect(params.some((p: any) => p.name === "view")).toBe(true);
    expect(params.some((p: any) => p.name === "period")).toBe(true);
  });

  it("describes 401 and 429 error responses", () => {
    const textPath = (spec as any).paths["/moderation/analyze-text"];
    expect(textPath.post.responses["401"]).toBeDefined();
    expect(textPath.post.responses["429"]).toBeDefined();
  });

  it("includes webhook event types in the schema", () => {
    const reg = (spec as any).components.schemas.WebhookRegistration;
    const events = reg.properties.events.items;
    expect(events.enum).toContain("ITEM_FLAGGED");
    expect(events.enum).toContain("ITEM_RESOLVED");
    expect(events.enum).toContain("ITEM_ESCALATED");
    expect(events.enum).toContain("ITEM_ASSIGNED");
    expect(events.enum).toContain("ALERT_TRIGGERED");
  });
});
