import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ModerationClient,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NetworkError,
  ServerError,
} from "../src/index";

function mockFetch(status: number, body: any, headers?: Record<string, string>) {
  const originalFetch = globalThis.fetch;
  const mock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: () => Promise.resolve(body),
  });
  globalThis.fetch = mock;
  return { mock, restore: () => { globalThis.fetch = originalFetch; } };
}

describe("ModerationClient", () => {
  const config = {
    apiKey: "mk_testkey123",
    baseUrl: "http://localhost:3000/api/v1",
    timeout: 5000,
    maxRetries: 1,
    retryBaseDelay: 10,
  };

  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  describe("analyzeText", () => {
    it("sends POST request with correct auth header", async () => {
      const { mock, restore: r } = mockFetch(200, {
        data: { toxicityScore: 0.1, recommendation: "approve", confidence: "high" },
      });
      restore = r;

      const client = new ModerationClient(config);
      await client.analyzeText({ text: "Hello world" });

      expect(mock).toHaveBeenCalledTimes(1);
      const [url, init] = mock.mock.calls[0];
      expect(url).toContain("/moderation/analyze-text");
      expect(init.headers.Authorization).toBe("Bearer mk_testkey123");
      expect(init.method).toBe("POST");
    });

    it("returns the API response data", async () => {
      const { restore: r } = mockFetch(200, {
        data: { toxicityScore: 0.8, recommendation: "reject", confidence: "high" },
      });
      restore = r;

      const client = new ModerationClient(config);
      const result = await client.analyzeText({ text: "bad content" });
      expect(result.data.recommendation).toBe("reject");
    });
  });

  describe("error handling", () => {
    it("throws AuthenticationError on 401", async () => {
      const { restore: r } = mockFetch(401, { errors: ["Invalid key"] });
      restore = r;

      const client = new ModerationClient(config);
      await expect(client.analyzeText({ text: "test" })).rejects.toThrow(AuthenticationError);
    });

    it("throws ValidationError on 400", async () => {
      const { restore: r } = mockFetch(400, { errors: ["Text is required"] });
      restore = r;

      const client = new ModerationClient(config);
      await expect(client.analyzeText({ text: "test" })).rejects.toThrow(ValidationError);
    });

    it("throws RateLimitError on 429 after retries exhausted", async () => {
      const { restore: r } = mockFetch(429, { errors: ["Rate limited"] }, { "Retry-After": "30" });
      restore = r;

      const client = new ModerationClient({ ...config, maxRetries: 0 });
      await expect(client.analyzeText({ text: "test" })).rejects.toThrow(RateLimitError);
    });

    it("throws ServerError on 500 after retries exhausted", async () => {
      const { restore: r } = mockFetch(500, { errors: ["Internal error"] });
      restore = r;

      const client = new ModerationClient({ ...config, maxRetries: 0 });
      await expect(client.analyzeText({ text: "test" })).rejects.toThrow(ServerError);
    });

    it("throws NetworkError when fetch fails", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
      restore = () => { globalThis.fetch = originalFetch; };

      const client = new ModerationClient({ ...config, maxRetries: 0 });
      await expect(client.analyzeText({ text: "test" })).rejects.toThrow(NetworkError);
    });
  });

  describe("retry logic", () => {
    it("retries on 500 then succeeds", async () => {
      const originalFetch = globalThis.fetch;
      const mock = vi.fn()
        .mockResolvedValueOnce({
          ok: false, status: 500, headers: new Headers(),
          json: () => Promise.resolve({ errors: ["fail"] }),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200, headers: new Headers(),
          json: () => Promise.resolve({ data: { toxicityScore: 0.1 } }),
        });
      globalThis.fetch = mock;
      restore = () => { globalThis.fetch = originalFetch; };

      const client = new ModerationClient({ ...config, maxRetries: 2, retryBaseDelay: 10 });
      const result = await client.analyzeText({ text: "test" });
      expect(mock).toHaveBeenCalledTimes(2);
      expect(result.data.toxicityScore).toBe(0.1);
    });
  });

  describe("interceptors", () => {
    it("applies request interceptor", async () => {
      const { restore: r } = mockFetch(200, { data: {} });
      restore = r;

      const client = new ModerationClient(config);
      const remove = client.addRequestInterceptor((init) => {
        init.headers = { ...init.headers, "X-Custom": "test" };
        return init;
      });

      await client.getHealth();
      const [url, init] = (globalThis.fetch as any).mock.calls[0];
      expect(init.headers["X-Custom"]).toBe("test");

      remove();
    });

    it("removes interceptor when cleanup function is called", async () => {
      const { mock, restore: r } = mockFetch(200, { data: {} });
      restore = r;

      const client = new ModerationClient(config);
      const remove = client.addRequestInterceptor((init) => {
        init.headers = { ...init.headers, "X-Custom": "test" };
        return init;
      });

      remove();
      await client.getHealth();

      const [url, init] = mock.mock.calls[0];
      expect(init.headers["X-Custom"]).toBeUndefined();
    });
  });

  describe("queue methods", () => {
    it("listQueue sends GET with query params", async () => {
      const { restore: r } = mockFetch(200, { data: [] });
      restore = r;

      const client = new ModerationClient(config);
      await client.listQueue({ limit: 10, offset: 5 });

      const [url] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
    });

    it("resolveItem sends correct action", async () => {
      const { restore: r } = mockFetch(200, { data: { id: "item1", status: "RESOLVED" } });
      restore = r;

      const client = new ModerationClient(config);
      const result = await client.resolveItem("item1", "approved");
      expect(result.data.status).toBe("RESOLVED");
    });
  });

  describe("analytics", () => {
    it("getAnalytics sends correct query params", async () => {
      const { restore: r } = mockFetch(200, { data: { realtime: {}, period: {} } });
      restore = r;

      const client = new ModerationClient(config);
      await client.getAnalytics({ view: "dashboard", period: 7 });

      const [url] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toContain("view=dashboard");
      expect(url).toContain("period=7");
    });
  });

  describe("webhooks", () => {
    it("registerWebhook sends POST with correct body", async () => {
      const { restore: r } = mockFetch(201, { data: { id: "wh1", url: "https://example.com/hook", events: ["ITEM_FLAGGED"], secret: "whsec_abc" } });
      restore = r;

      const client = new ModerationClient(config);
      const result = await client.registerWebhook({
        url: "https://example.com/hook",
        events: ["ITEM_FLAGGED"],
      });

      expect(result.data.events).toContain("ITEM_FLAGGED");
    });

    it("deleteWebhook sends DELETE request", async () => {
      const { restore: r } = mockFetch(200, { data: { deleted: true } });
      restore = r;

      const client = new ModerationClient(config);
      const result = await client.deleteWebhook("wh1");
      expect(result.data.deleted).toBe(true);

      const [url, init] = (globalThis.fetch as any).mock.calls[0];
      expect(init.method).toBe("DELETE");
      expect(url).toContain("/moderation/webhooks/wh1");
    });
  });

  describe("usage", () => {
    it("getUsage returns quota and tier info", async () => {
      const { restore: r } = mockFetch(200, {
        data: {
          usage: { totalRequests: 42, lastUsed: "2026-01-15", endpointBreakdown: [] },
          quota: { remaining: 58, limit: 100, windowSeconds: 60 },
          tier: "STANDARD",
        },
      });
      restore = r;

      const client = new ModerationClient(config);
      const result = await client.getUsage(30);
      expect(result.data.tier).toBe("STANDARD");
      expect(result.data.quota.remaining).toBe(58);
    });
  });
});
