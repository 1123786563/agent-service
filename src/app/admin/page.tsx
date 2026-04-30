import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { archiveAgentPackage } from "./actions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/login");
  }

  const packages = await prisma.agentPackage.findMany({
    include: { owner: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>管理后台</h1>
          <p className="lede">管理白名单、查看 ZIP 风险结果、下架异常智能体。</p>
        </div>
        <Link className="button secondary" href="/admin/whitelist">白名单</Link>
      </div>
      <div className="list">
        {packages.map((agentPackage) => (
          <article className="panel" key={agentPackage.id}>
            <h2>{agentPackage.name}</h2>
            <p className="muted">{agentPackage.owner.email} · {agentPackage.status}</p>
            <pre>{JSON.stringify(agentPackage.validationResult, null, 2)}</pre>
            <form action={archiveAgentPackage}>
              <input type="hidden" name="packageId" value={agentPackage.id} />
              <button className="button secondary" type="submit">下架</button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
