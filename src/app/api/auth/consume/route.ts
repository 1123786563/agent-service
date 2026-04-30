import { redirect } from "next/navigation";
import { consumeMagicLink } from "@/server/auth/magic-link";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    redirect("/login?error=missing-token");
  }

  await consumeMagicLink(token);
  redirect("/creator");
}
