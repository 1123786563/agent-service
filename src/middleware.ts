import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimiter, RATE_LIMIT_WEBHOOK, RATE_LIMIT_EXEMPT_PATHS, RATE_LIMIT_DEFAULT, rateLimitKey } from "@/server/rate-limit";

const CSRF_EXEMPT_PATHS = [
  "/api/payments/webhook",
  "/api/auth/consume",
  "/api/auth/callback/google",
  "/api/auth/callback/github",
  "/api/auth/google",
  "/api/auth/github",
];

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  ...(process.env.NODE_ENV === "production"
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
    : {}),
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function rateLimitResponse(retryAfterMs: number, remaining: number): NextResponse {
  const response = new NextResponse(
    JSON.stringify({ errors: ["Rate limited"] }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    }
  );
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  return withSecurityHeaders(response);
}

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const isApi = pathname.startsWith("/api/");

  if (!isApi) {
    const response = NextResponse.next();
    return withSecurityHeaders(response);
  }

  // Exempt health checks and webhooks from rate limiting
  if (RATE_LIMIT_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const response = NextResponse.next();
    return withSecurityHeaders(response);
  }

  // All API routes: apply rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isWebhook = pathname === "/api/payments/webhook";
  const key = rateLimitKey("ip", isWebhook ? `webhook:${ip}` : ip);
  const config = isWebhook ? RATE_LIMIT_WEBHOOK : RATE_LIMIT_DEFAULT;
  const rateLimitResult = await rateLimiter.check(key, config);

  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.retryAfterMs, rateLimitResult.remaining);
  }

  // CSRF verification on state-changing routes
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);

  if (isStateChanging) {
    // Exempt paths validated by signature/state — skip CSRF only
    if (CSRF_EXEMPT_PATHS.includes(pathname)) {
      const response = NextResponse.next();
      response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      return withSecurityHeaders(response);
    }

    const origin = request.headers.get("origin");
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const appHostname = new URL(appUrl).hostname;

    if (!origin) {
      if (process.env.NODE_ENV !== "production") {
        const response = NextResponse.next();
        response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
        return withSecurityHeaders(response);
      }
      return withSecurityHeaders(new NextResponse(
        JSON.stringify({ errors: ["CSRF origin verification failed"] }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ));
    }

    const originHostname = new URL(origin).hostname;
    if (
      originHostname === appHostname ||
      originHostname.endsWith("." + appHostname)
    ) {
      const response = NextResponse.next();
      response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(new NextResponse(
      JSON.stringify({ errors: ["CSRF origin verification failed"] }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    ));
  }

  // Non-mutating API routes: just security headers
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
