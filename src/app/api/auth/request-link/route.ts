import { redirect } from "next/navigation";
import { isAuthFlowError, requestMagicLink } from "@/server/auth/magic-link";
import { rateLimiter, RATE_LIMIT_AUTH } from "@/server/rate-limit";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const normalizedEmail = email.trim().toLowerCase();
  const authLimit = rateLimiter.check(`auth:${normalizedEmail}`, RATE_LIMIT_AUTH);
  if (!authLimit.allowed) {
    redirect("/login?error=rate_limited");
    return;
  }
  try {
    await requestMagicLink(email);
  } catch (error) {
    if (isAuthFlowError(error)) {
      redirect(`/login?error=${error.code}`);
    }

    throw error;
  }

  redirect("/login?sent=1");
}
