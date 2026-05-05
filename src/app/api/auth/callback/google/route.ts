import { handleGoogleCallback } from "@/server/auth/oauth-google";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    redirect("/login?error=oauth_denied");
  }

  if (!code || !state) {
    redirect("/login?error=oauth_failed");
  }

  try {
    await handleGoogleCallback(code, state);
  } catch {
    redirect("/login?error=oauth_failed");
  }

  redirect("/");
}
