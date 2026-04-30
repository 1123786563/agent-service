import { ConsultationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/consultations/service", () => ({
  createConsultation: vi.fn()
}));

import { POST } from "@/app/api/consultations/route";
import { createConsultation } from "@/server/consultations/service";

describe("consultation route", () => {
  it("creates a consultation for a published agent package", async () => {
    vi.mocked(createConsultation).mockResolvedValue({
      id: "consultation-1",
      status: ConsultationStatus.NEW,
      buyerEmail: "buyer@example.com"
    } as never);

    const response = await POST(new Request("http://localhost/api/consultations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentSlug: "research-assistant",
        buyerEmail: "buyer@example.com",
        requirement: "Need help deploying this agent"
      })
    }));

    expect(createConsultation).toHaveBeenCalledWith({
      agentSlug: "research-assistant",
      buyerEmail: "buyer@example.com",
      requirement: "Need help deploying this agent"
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      consultation: {
        id: "consultation-1",
        status: ConsultationStatus.NEW,
        buyerEmail: "buyer@example.com"
      }
    });
  });

  it("returns not found when the package is missing", async () => {
    vi.mocked(createConsultation).mockRejectedValue(new Error("Published agent package not found"));

    const response = await POST(new Request("http://localhost/api/consultations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentSlug: "missing-agent",
        buyerEmail: "buyer@example.com",
        requirement: "Need help"
      })
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      errors: ["Published agent package not found"]
    });
  });

  it("returns validation errors for invalid input", async () => {
    vi.mocked(createConsultation).mockRejectedValue(new Error("Invalid email"));

    const response = await POST(new Request("http://localhost/api/consultations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentSlug: "research-assistant",
        buyerEmail: "not-an-email",
        requirement: "Need help"
      })
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["Invalid email"]
    });
  });
});
