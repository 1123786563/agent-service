import { redirect } from "next/navigation";
import { consumeMagicLink, isAuthFlowError } from "@/server/auth/magic-link";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    redirect("/login?error=missing-token");
  }

  try {
    await consumeMagicLink(token);
  } catch (error) {
    if (isAuthFlowError(error)) {
      redirect(`/login?error=${error.code}`);
    }

    throw error;
  }

  redirect("/creator");
}
