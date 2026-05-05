"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { createSessionTokenHash, SESSION_COOKIE } from "@/server/auth/session";

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const tokenHash = createSessionTokenHash(token);
    await prisma.session.deleteMany({ where: { tokenHash } });
    cookieStore.delete(SESSION_COOKIE);
  }

  redirect("/");
}
