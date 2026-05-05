import { z } from "zod";

export async function register() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const isStripe = process.env.PAYMENT_PROVIDER === "stripe";

  const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().min(1),
    DOWNLOAD_TICKET_SECRET: z.string().min(1),
    ADMIN_EMAILS: z.string().min(1),
    ...(isStripe
      ? {
          STRIPE_SECRET_KEY: z.string().min(1),
          STRIPE_WEBHOOK_SECRET: z.string().min(1),
        }
      : {}),
  });

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join("."));
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }
}
