import { redirect } from "next/navigation";
import { isAuthFlowError, requestMagicLink } from "@/server/auth/magic-link";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
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
