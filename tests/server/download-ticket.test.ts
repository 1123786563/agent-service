import { afterEach, describe, expect, it, vi } from "vitest";
import { createDownloadTicket, verifyAndConsumeDownloadTicket, verifyDownloadTicket } from "@/server/storage/download-tickets";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("download tickets", () => {
  it("verifies a valid ticket for the expected audience", () => {
    const ticket = createDownloadTicket({
      resourceType: "agent_zip",
      resourceId: "pkg-1",
      objectKey: "agents/demo.zip",
      actorScope: "anonymous",
      audience: "agent-download",
      resourceVersion: "v1"
    }, {
      now: new Date("2026-05-03T00:00:00.000Z"),
      ttlSeconds: 60
    });

    const payload = verifyDownloadTicket(ticket, {
      audience: "agent-download",
      now: new Date("2026-05-03T00:00:30.000Z")
    });

    expect(payload.resourceId).toBe("pkg-1");
    expect(payload.objectKey).toBe("agents/demo.zip");
  });

  it("rejects an expired ticket", () => {
    const ticket = createDownloadTicket({
      resourceType: "delivery_asset",
      resourceId: "delivery-1",
      objectKey: "deliveries/handoff.txt",
      actorScope: "buyer",
      actorId: "buyer-1",
      audience: "delivery-download",
      resourceVersion: "v1"
    }, {
      now: new Date("2026-05-03T00:00:00.000Z"),
      ttlSeconds: 10
    });

    expect(() =>
      verifyDownloadTicket(ticket, {
        audience: "delivery-download",
        actorId: "buyer-1",
        now: new Date("2026-05-03T00:00:11.000Z")
      })
    ).toThrow("Download ticket expired");
  });

  it("rejects a ticket used on the wrong audience", () => {
    const ticket = createDownloadTicket({
      resourceType: "agent_zip",
      resourceId: "pkg-1",
      objectKey: "agents/demo.zip",
      actorScope: "anonymous",
      audience: "agent-download",
      resourceVersion: "v1"
    });

    expect(() => verifyDownloadTicket(ticket, { audience: "delivery-download" })).toThrow(
      "Download ticket audience mismatch"
    );
  });

  it("verifies tickets signed by the previous key during rotation", () => {
    process.env.DOWNLOAD_TICKET_ACTIVE_KEY_ID = "old-key";
    process.env.DOWNLOAD_TICKET_SECRET = "old-secret";
    const ticket = createDownloadTicket({
      resourceType: "agent_zip",
      resourceId: "pkg-1",
      objectKey: "agents/demo.zip",
      actorScope: "anonymous",
      audience: "agent-download",
      resourceVersion: "v1"
    });

    process.env.DOWNLOAD_TICKET_ACTIVE_KEY_ID = "new-key";
    process.env.DOWNLOAD_TICKET_SECRET = "new-secret";
    process.env.DOWNLOAD_TICKET_PREVIOUS_KEY_ID = "old-key";
    process.env.DOWNLOAD_TICKET_PREVIOUS_SECRET = "old-secret";

    expect(verifyDownloadTicket(ticket, { audience: "agent-download" }).keyId).toBe("old-key");
  });

  it("persists single-use tickets and rejects replay", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("unique constraint"));
    const ticket = createDownloadTicket({
      resourceType: "delivery_asset",
      resourceId: "delivery-1",
      objectKey: "deliveries/handoff.txt",
      actorScope: "buyer",
      actorId: "buyer-1",
      audience: "delivery-download",
      resourceVersion: "v1"
    }, {
      singleUse: true,
      now: new Date("2026-05-03T00:00:00.000Z")
    });

    await expect(verifyAndConsumeDownloadTicket(ticket, {
      audience: "delivery-download",
      actorId: "buyer-1",
      now: new Date("2026-05-03T00:00:30.000Z")
    }, { create })).resolves.toMatchObject({
      resourceId: "delivery-1",
      singleUse: true
    });
    await expect(verifyAndConsumeDownloadTicket(ticket, {
      audience: "delivery-download",
      actorId: "buyer-1",
      now: new Date("2026-05-03T00:00:30.000Z")
    }, { create })).rejects.toThrow("Download ticket already used");
  });
});
