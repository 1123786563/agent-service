import { sendDevLoginEmail } from "./dev-mailer";
import { sendResendLoginEmail } from "./resend-mailer";

export async function sendLoginEmail(email: string, loginUrl: string) {
  if (process.env.NODE_ENV === "production" && process.env.RESEND_API_KEY) {
    return sendResendLoginEmail(email, loginUrl);
  }

  if (process.env.RESEND_API_KEY) {
    try {
      return await sendResendLoginEmail(email, loginUrl);
    } catch {
      console.warn("Resend failed, falling back to dev mailer");
    }
  }

  return sendDevLoginEmail(email, loginUrl);
}
