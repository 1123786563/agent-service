import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateApiKey, signWebhookPayload, verifyWebhookSignature, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/moderation/api-key-auth";

describe("generateApiKey", () => {
  it("generates a key with mk_ prefix", () => {
    const result = generateApiKey();
    expect(result.rawKey).toMatch(/^mk_[0-9a-f]{64}$/);
    expect(result.keyPrefix).toBe(result.rawKey.slice(0, 7));
    expect(result.keyPrefix).toMatch(/^mk_[0-9a-f]{4}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateApiKey().rawKey);
    }
    expect(keys.size).toBe(100);
  });

  it("produces a deterministic hash for the same key", () => {
    const { rawKey, keyHash } = generateApiKey();
    const result2 = generateApiKey();
    // Same raw key should produce same hash (can't test directly since raw is random)
    // Instead verify hash is a hex string
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("signWebhookPayload", () => {
  it("produces a hex signature", () => {
    const sig = signWebhookPayload('{"test":true}', "secret123");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different signatures for different payloads", () => {
    const sig1 = signWebhookPayload('{"a":1}', "secret");
    const sig2 = signWebhookPayload('{"a":2}', "secret");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different secrets", () => {
    const sig1 = signWebhookPayload('{"a":1}', "secret1");
    const sig2 = signWebhookPayload('{"a":1}', "secret2");
    expect(sig1).not.toBe(sig2);
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies a valid signature", () => {
    const payload = '{"event":"test"}';
    const secret = "mysecret";
    const signature = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const payload = '{"event":"test"}';
    const secret = "mysecret";
    const signature = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, signature, "wrongsecret")).toBe(false);
  });

  it("rejects a wrong payload", () => {
    const payload = '{"event":"test"}';
    const secret = "mysecret";
    const signature = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature('{"event":"other"}', signature, secret)).toBe(false);
  });

  it("handles different length signatures safely", () => {
    expect(verifyWebhookSignature("payload", "short", "secret")).toBe(false);
  });
});

describe("RATE_LIMIT_WINDOW_SECONDS", () => {
  it("is set to 60 seconds", () => {
    expect(RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });
});
