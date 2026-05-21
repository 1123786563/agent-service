import { getCurrentSession } from "@/server/auth/session";
import { deleteSessionByToken } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/session";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getCurrentSession();

  if (session) {
    await deleteSessionByToken(session.token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
