import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsultationStatus, PaymentStatus, ServiceOrderStatus, WhitelistStatus } from "@prisma/client";
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
  const [consultationCount, activeOrderCount, unsettledOrders] = await Promise.all([
    prisma.consultation.count({
      where: {
        providerId: user.id,
        status: {
          in: [ConsultationStatus.NEW, ConsultationStatus.IN_DISCUSSION, ConsultationStatus.SCOPED]
        }
      }
    }),
    prisma.serviceOrder.count({
      where: {
        providerId: user.id,
        status: {
          in: [ServiceOrderStatus.IN_PROGRESS, ServiceOrderStatus.DELIVERED, ServiceOrderStatus.DISPUTED]
        }
      }
    }),
    prisma.serviceOrder.findMany({
      where: {
        providerId: user.id,
        status: ServiceOrderStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        settledAt: null
      },
      select: {
        priceCents: true
      }
    })
  ]);
  const totalDownloads = packages.reduce((sum, agentPackage) => sum + agentPackage.downloadCount, 0);
  const unsettledRevenueCents = unsettledOrders.reduce((sum, order) => sum + order.priceCents, 0);

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

      <div className="grid" style={{ marginBottom: 24 }}>
        <article className="panel">
          <p className="eyebrow">Packages</p>
          <h2>{packages.length}</h2>
          <p className="muted">已发布/已上传智能体</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Downloads</p>
          <h2>{totalDownloads}</h2>
          <p className="muted">累计下载</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Consultations</p>
          <h2>{consultationCount}</h2>
          <p className="muted">待处理咨询</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Orders</p>
          <h2>{activeOrderCount}</h2>
          <p className="muted">进行中 / 待验收 / 争议</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Unsettled</p>
          <h2>{unsettledRevenueCents}</h2>
          <p className="muted">待结算金额（分）</p>
        </article>
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
