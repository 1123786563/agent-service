import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";

const registerSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(8, "Password must be at least 8 characters")
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    return Response.json({ errors: messages }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return Response.json({ errors: ["An account with this email already exists"] }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash }
  });

  await createSession(user.id);

  return Response.json({ ok: true, user: { id: user.id, email: user.email } }, { status: 201 });
}
