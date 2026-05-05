import { PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaymentEvent } from "@/server/payments/ledger";

describe("payment ledger", () => {
  const store = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates repeated provider event ids", async () => {
    store.findUnique.mockResolvedValue({
      id: "ledger-1"
    });

    await expect(recordPaymentEvent({
      orderId: "order-1",
      provider: "dev",
      providerEventId: "evt_1",
      amountMinor: 2500,
      currency: "USD",
      paymentStatus: PaymentStatus.PAID,
      rawPayload: {
        type: "payment.succeeded"
      }
    }, store)).resolves.toEqual({
      duplicate: true,
      id: "ledger-1"
    });

    expect(store.create).not.toHaveBeenCalled();
  });

  it("persists a non-duplicate provider event with a digest", async () => {
    store.findUnique.mockResolvedValue(null);
    store.create.mockResolvedValue({
      id: "ledger-2",
      providerEventId: "evt_2"
    });

    const result = await recordPaymentEvent({
      orderId: "order-1",
      provider: "dev",
      providerEventId: "evt_2",
      amountMinor: 2500,
      currency: "USD",
      paymentStatus: PaymentStatus.CANCELLED,
      rawPayload: {
        type: "payment.cancelled"
      }
    }, store);

    expect(result).toEqual({
      duplicate: false,
      id: "ledger-2"
    });
    expect(store.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order-1",
        providerEventId: "evt_2",
        paymentStatus: PaymentStatus.CANCELLED,
        amountMinor: 2500,
        currency: "USD",
        rawEventDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    });
  });
});
