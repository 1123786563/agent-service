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
  const [publishedPackages, packageAggregates, consultationCount, orderCount, completedOrderCount] = await Promise.all([
    prisma.agentPackage.count({
      where: {
        status: "PUBLISHED"
      }
    }),
    prisma.agentPackage.aggregate({
      _sum: {
        downloadCount: true
      }
    }),
    prisma.consultation.count(),
    prisma.serviceOrder.count(),
    prisma.serviceOrder.count({
      where: {
        status: "COMPLETED"
      }
    })
  ]);
  const consultations = await prisma.consultation.findMany({
    include: {
      agentPackage: true,
      provider: true
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  const orders = await prisma.serviceOrder.findMany({
    include: {
      provider: true,
      consultation: {
        include: {
          agentPackage: true
        }
      },
      deliveries: {
        orderBy: {
          submittedAt: "desc"
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 10
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
      <div className="grid">
        <article className="panel">
          <p className="eyebrow">Published</p>
          <h2>{publishedPackages}</h2>
          <p className="muted">已发布智能体</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Downloads</p>
          <h2>{packageAggregates._sum.downloadCount ?? 0}</h2>
          <p className="muted">累计下载</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Consultations</p>
          <h2>{consultationCount}</h2>
          <p className="muted">累计咨询</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Orders</p>
          <h2>{orderCount}</h2>
          <p className="muted">累计订单</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Completed</p>
          <h2>{completedOrderCount}</h2>
          <p className="muted">已完成订单</p>
        </article>
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

      <div className="section-header" style={{ marginTop: 32 }}>
        <div>
          <h2>最近咨询</h2>
          <p className="muted">查看咨询状态、买家邮箱和对应服务商。</p>
        </div>
      </div>
      <div className="list">
        {consultations.map((consultation) => (
          <article className="panel" key={consultation.id}>
            <h3>{consultation.agentPackage.name}</h3>
            <p className="muted">
              买家：{consultation.buyerEmail} · 服务商：{consultation.provider.email}
            </p>
            <p>{consultation.requirement}</p>
            <p className="muted">状态：{consultation.status}</p>
          </article>
        ))}
      </div>

      <div className="section-header" style={{ marginTop: 32 }}>
        <div>
          <h2>最近订单</h2>
          <p className="muted">查看订单、支付和服务执行状态，便于人工处理异常。</p>
        </div>
      </div>
      <div className="list">
        {orders.map((order) => (
          <article className="panel" key={order.id}>
            <h3>{order.title}</h3>
            <p className="muted">
              买家：{order.buyerEmail} · 服务商：{order.provider.email}
            </p>
            <p>{order.consultation.agentPackage.name}</p>
            <p className="muted">
              订单状态：{order.status} · 支付状态：{order.paymentStatus}
            </p>
            {order.deliveries[0] ? (
              <p className="muted">
                最近交付：{order.deliveries[0].fileName} · 提交：
                {order.deliveries[0].submittedAt.toLocaleString("zh-CN")} · 验收：
                {order.deliveries[0].acceptedAt
                  ? order.deliveries[0].acceptedAt.toLocaleString("zh-CN")
                  : "待验收"}
              </p>
            ) : (
              <p className="muted">最近交付：暂无</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
