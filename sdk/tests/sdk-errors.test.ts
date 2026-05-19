import { describe, expect, it } from "vitest";
import {
  ModerationError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  ServerError,
  NetworkError,
} from "../src/errors";

describe("Error hierarchy", () => {
  it("ModerationError has correct properties", () => {
    const err = new ModerationError("test", 400, { errors: ["a"] });
    expect(err.name).toBe("ModerationError");
    expect(err.message).toBe("test");
    expect(err.statusCode).toBe(400);
    expect(err.body).toEqual({ errors: ["a"] });
  });

  it("AuthenticationError has status 401", () => {
    const err = new AuthenticationError();
    expect(err.name).toBe("AuthenticationError");
    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("Authentication");
  });

  it("RateLimitError has retryAfterSeconds", () => {
    const err = new RateLimitError(30);
    expect(err.name).toBe("RateLimitError");
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.message).toContain("30");
  });

  it("RateLimitError accepts custom message", () => {
    const err = new RateLimitError(60, "Custom rate limit message");
    expect(err.message).toBe("Custom rate limit message");
  });

  it("ValidationError joins errors", () => {
    const err = new ValidationError(["field1", "field2"]);
    expect(err.name).toBe("ValidationError");
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain("field1");
    expect(err.message).toContain("field2");
    expect(err.body?.errors).toEqual(["field1", "field2"]);
  });

  it("NotFoundError includes resource name", () => {
    const err = new NotFoundError("Webhook");
    expect(err.name).toBe("NotFoundError");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Webhook");
  });

  it("ServerError defaults to 500", () => {
    const err = new ServerError();
    expect(err.name).toBe("ServerError");
    expect(err.statusCode).toBe(500);
  });

  it("NetworkError preserves cause", () => {
    const cause = new Error("connection refused");
    const err = new NetworkError("Network failed", cause);
    expect(err.name).toBe("NetworkError");
    expect(err.cause).toBe(cause);
  });

  it("all errors are instanceof ModerationError", () => {
    expect(new AuthenticationError()).toBeInstanceOf(ModerationError);
    expect(new RateLimitError(30)).toBeInstanceOf(ModerationError);
    expect(new ValidationError(["a"])).toBeInstanceOf(ModerationError);
    expect(new NotFoundError("X")).toBeInstanceOf(ModerationError);
    expect(new ServerError()).toBeInstanceOf(ModerationError);
    expect(new NetworkError("x")).toBeInstanceOf(ModerationError);
  });

  it("all errors are instanceof Error", () => {
    expect(new AuthenticationError()).toBeInstanceOf(Error);
    expect(new RateLimitError(30)).toBeInstanceOf(Error);
    expect(new ValidationError(["a"])).toBeInstanceOf(Error);
    expect(new NotFoundError("X")).toBeInstanceOf(Error);
    expect(new ServerError()).toBeInstanceOf(Error);
    expect(new NetworkError("x")).toBeInstanceOf(Error);
  });
});
