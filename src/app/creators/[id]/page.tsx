import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentPackageStatus } from "@prisma/client";
import { AgentCard } from "@/components/agent-card";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function CreatorPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creator = await prisma.user.findUnique({
    where: {
      id
    },
    include: {
      packages: {
        where: {
          status: AgentPackageStatus.PUBLISHED
        },
        include: {
          skills: true,
          workflows: true
        },
        orderBy: {
          publishedAt: "desc"
        }
      },
      providerOrders: {
        where: {
          status: "COMPLETED"
        },
        select: {
          id: true
        }
      }
    }
  });

  if (!creator) {
    notFound();
  }

  const totalDownloads = creator.packages.reduce((sum, agentPackage) => sum + agentPackage.downloadCount, 0);

  return (
    <section>
      <div className="panel">
        <p className="eyebrow">Creator</p>
        <h1>{creator.email}</h1>
        <p className="lede">查看这位创作者已发布的智能体包、累计下载和已完成服务订单。</p>
        <div className="actions">
          <span className="status-pill">{creator.packages.length} published</span>
          <span className="status-pill">{totalDownloads} downloads</span>
          <span className="status-pill">{creator.providerOrders.length} completed orders</span>
        </div>
      </div>

      <div className="section-header" style={{ marginTop: 24 }}>
        <div>
          <h2>已发布智能体</h2>
          <p className="muted">浏览该创作者公开可下载的 ZIP 包。</p>
        </div>
        <Link className="button secondary" href="/agents">返回市场</Link>
      </div>

      <div className="grid">
        {creator.packages.map((agentPackage) => (
          <AgentCard key={agentPackage.id} agentPackage={agentPackage} />
        ))}
      </div>
    </section>
  );
}
