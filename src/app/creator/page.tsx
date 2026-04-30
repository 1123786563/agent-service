import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WhitelistStatus } from "@prisma/client";
import { PackageStatusPill } from "@/components/package-status-pill";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function CreatorPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return (
      <section className="panel">
        <h1>创作者工作台</h1>
        <p className="lede">你的邮箱尚未进入白名单，暂时不能上传智能体 ZIP。</p>
      </section>
    );
  }

  const packages = await prisma.agentPackage.findMany({
    where: {
      ownerId: user.id
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>创作者工作台</h1>
          <p className="lede">上传 ZIP 后，平台会校验 agent.json、skill 路径和工作流引用。</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/creator/consultations">咨询列表</Link>
          <Link className="button secondary" href="/creator/orders">订单列表</Link>
          <Link className="button" href="/creator/agents/new">上传智能体</Link>
        </div>
      </div>

      <div className="grid">
        {packages.map((agentPackage) => (
          <article className="panel" key={agentPackage.id}>
            <PackageStatusPill status={agentPackage.status} />
            <h2>{agentPackage.name}</h2>
            <p>{agentPackage.summary}</p>
            <Link href={`/agents/${agentPackage.slug}`}>查看详情</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
