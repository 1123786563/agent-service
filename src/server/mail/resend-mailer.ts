import { Resend } from "resend";

export async function sendResendLoginEmail(email: string, loginUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required for production email");
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: "Your login link",
    text: `Click the link below to log in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.`
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
