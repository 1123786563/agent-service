import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WhitelistStatus } from "@prisma/client";
import { OrderStatusPill } from "@/components/order-status-pill";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function CreatorOrdersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return (
      <section className="panel">
        <h1>订单列表</h1>
        <p className="lede">你的邮箱尚未进入白名单，暂时不能处理服务订单。</p>
      </section>
    );
  }

  const orders = await prisma.serviceOrder.findMany({
    where: {
      providerId: user.id
    },
    include: {
      consultation: {
        include: {
          agentPackage: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>订单列表</h1>
          <p className="lede">查看当前创作者名下的服务订单和支付状态。</p>
        </div>
        <Link className="button secondary" href="/creator/consultations">查看咨询</Link>
      </div>

      <div className="list">
        {orders.map((order) => (
          <article className="panel" key={order.id}>
            <div className="section-header">
              <div>
                <h2>{order.title}</h2>
                <p className="muted">{order.consultation.agentPackage.name} · {order.buyerEmail}</p>
              </div>
              <OrderStatusPill status={order.status} />
            </div>
            <p>{order.scope}</p>
            <p className="muted">
              {order.currency} {order.priceCents} · 支付状态：{order.paymentStatus}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
