import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { recordAuditLog } from "@/server/audit/service";
import { rateLimiter } from "@/server/rate-limit";

const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_IP_LIMIT = 20; // per-IP to prevent enumeration
const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;

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

  // IP-based rate limit to prevent email enumeration (before user lookup)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipLimit = rateLimiter.check(`login_ip:${ip}`, { windowMs: LOGIN_IP_WINDOW_MS, maxRequests: LOGIN_IP_LIMIT });
  if (!ipLimit.allowed) {
    return Response.json({ errors: ["Too many login attempts. Try again later."] }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user?.passwordHash) {
    return Response.json({ errors: ["Invalid email or password"] }, { status: 401 });
  }

  // Check account lockout (per-user, only counts failures)
  const lockoutKey = `login_fail:${user.id}`;
  const lockoutResult = rateLimiter.check(lockoutKey, { windowMs: LOGIN_FAILURE_WINDOW_MS, maxRequests: LOGIN_FAILURE_LIMIT });
  if (!lockoutResult.allowed) {
    return Response.json({ errors: ["Account temporarily locked — too many failed attempts. Try again later."] }, { status: 429 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    // Note: rateLimiter.check already incremented the counter
    await recordAuditLog({
      actorRole: "ANONYMOUS",
      action: "auth.login.failed",
      targetType: "User",
      targetId: user.id,
      afterSnapshot: { email: normalizedEmail }
    });
    return Response.json({ errors: ["Invalid email or password"] }, { status: 401 });
  }

  // Successful login: reset the failure counter
  rateLimiter.reset(lockoutKey);

  await createSession(user.id);
  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: "auth.login.success",
    targetType: "User",
    targetId: user.id
  });

  return Response.json({ ok: true, user: { id: user.id, email: user.email } });
}
