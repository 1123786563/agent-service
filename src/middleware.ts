import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimiter, RATE_LIMIT_WEBHOOK } from "@/server/rate-limit";

const CSRF_EXEMPT_PATHS = [
  "/api/payments/webhook",
  "/api/auth/consume",
];

export function middleware(request: NextRequest) {
  // Only check POST requests
  if (request.method !== "POST") {
    return NextResponse.next();
  }

  const { pathname } = new URL(request.url);

  // 1. Rate limiting on ALL routes (including webhook)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isWebhook = pathname === "/api/payments/webhook";
  const rateLimitResult = rateLimiter.check(
    isWebhook ? `webhook:${ip}` : `ip:${ip}`,
    isWebhook ? RATE_LIMIT_WEBHOOK : undefined
  );

  if (!rateLimitResult.allowed) {
    return new NextResponse(
      JSON.stringify({ errors: ["Rate limited"] }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(rateLimitResult.retryAfterMs / 1000)),
        },
      }
    );
  }

  // Exempt paths validated by signature/state — skip CSRF only
  if (CSRF_EXEMPT_PATHS.includes(pathname)) {
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    return response;
  }

  // 2. CSRF Origin verification (non-exempt routes)
  const origin = request.headers.get("origin");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const appHostname = new URL(appUrl).hostname;

  // Missing Origin header
  if (!origin) {
    if (process.env.NODE_ENV !== "production") {
      const response = NextResponse.next();
      response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      return response;
    }
    return new NextResponse(
      JSON.stringify({ errors: ["CSRF origin verification failed"] }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Origin matching: exact hostname or subdomain
  const originHostname = new URL(origin).hostname;
  if (
    originHostname === appHostname ||
    originHostname.endsWith("." + appHostname)
  ) {
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    return response;
  }

  return new NextResponse(
    JSON.stringify({ errors: ["CSRF origin verification failed"] }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
