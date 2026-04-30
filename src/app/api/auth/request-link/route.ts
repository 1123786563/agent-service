import { redirect } from "next/navigation";
import { requestMagicLink } from "@/server/auth/magic-link";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  await requestMagicLink(email);
  redirect("/login?sent=1");
}
