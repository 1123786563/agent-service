import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1, "Password is required")
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    return Response.json({ errors: messages }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user?.passwordHash) {
    return Response.json({ errors: ["Invalid email or password"] }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return Response.json({ errors: ["Invalid email or password"] }, { status: 401 });
  }

  await createSession(user.id);

  return Response.json({ ok: true, user: { id: user.id, email: user.email } });
}
