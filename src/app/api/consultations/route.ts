import { createConsultation } from "@/server/consultations/service";
import { getCurrentUser } from "@/server/auth/session";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({
      errors: ["Request body must be valid JSON"]
    }, {
      status: 400
    });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({
      errors: ["Request body must be an object"]
    }, {
      status: 400
    });
  }

  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const { agentSlug, requirement } = payload as {
    agentSlug?: string;
    requirement?: string;
  };

  try {
    const consultation = await createConsultation({
      agentSlug: agentSlug ?? "",
      buyerEmail: user.email.toLowerCase(),
      requirement: requirement ?? ""
    });

    return Response.json({
      consultation: {
        id: consultation.id,
        status: consultation.status,
        buyerEmail: consultation.buyerEmail
      }
    }, {
      status: 201
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create consultation";
    const status = message === "Published agent package not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
