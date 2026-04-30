import React from "react";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { activateCreatorWhitelist } from "../actions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function WhitelistPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/login");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <h1>白名单管理</h1>
          <p className="lede">添加创作者邮箱后，系统会把账号标记为可上传状态。</p>
        </div>
      </div>

      <form action={activateCreatorWhitelist} className="form panel">
        <label>
          创作者邮箱
          <input name="email" type="email" required />
        </label>
        <button className="button" type="submit">加入白名单</button>
      </form>

      <div className="list">
        {users.map((listedUser) => (
          <article className="panel" key={listedUser.id}>
            <strong>{listedUser.email}</strong>
            <p className="muted">{listedUser.role} · {listedUser.whitelistStatus}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
