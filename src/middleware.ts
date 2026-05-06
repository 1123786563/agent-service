import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimiter, RATE_LIMIT_WEBHOOK } from "@/server/rate-limit";

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

export function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const isApi = pathname.startsWith("/api/");

  // For non-API routes, just add security headers
  if (!isApi) {
    const response = NextResponse.next();
    return withSecurityHeaders(response);
  }

  // --- API route handling ---

  // Security headers on all API responses too
  let response: NextResponse;

  // CSRF + Rate limiting on all state-changing API routes
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);

  if (isStateChanging) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const isWebhook = pathname === "/api/payments/webhook";
    const rateLimitResult = rateLimiter.check(
      isWebhook ? `webhook:${ip}` : `ip:${ip}`,
      isWebhook ? RATE_LIMIT_WEBHOOK : undefined
    );

    if (!rateLimitResult.allowed) {
      return withSecurityHeaders(new NextResponse(
        JSON.stringify({ errors: ["Rate limited"] }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rateLimitResult.retryAfterMs / 1000)),
          },
        }
      ));
    }

    // Exempt paths validated by signature/state — skip CSRF only
    if (CSRF_EXEMPT_PATHS.includes(pathname)) {
      response = NextResponse.next();
      response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      return withSecurityHeaders(response);
    }

    // CSRF Origin verification (non-exempt routes)
    const origin = request.headers.get("origin");
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const appHostname = new URL(appUrl).hostname;

    if (!origin) {
      if (process.env.NODE_ENV !== "production") {
        response = NextResponse.next();
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
      response = NextResponse.next();
      response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(new NextResponse(
      JSON.stringify({ errors: ["CSRF origin verification failed"] }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    ));
  }

  // Non-POST API routes: just security headers
  response = NextResponse.next();
  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
