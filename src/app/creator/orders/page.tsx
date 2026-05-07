import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WhitelistStatus } from "@prisma/client";
import { DisputeOrderButton } from "@/components/dispute-order-button";
import { OrderStatusPill } from "@/components/order-status-pill";
import { SettlementStatusPill } from "@/components/settlement-status-pill";
import { UploadDeliveryForm } from "@/components/upload-delivery-form";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function CreatorOrdersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return (
      <section className="page-hero">
        <p className="eyebrow">Creator orders</p>
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
      },
      settlementLine: {
        include: {
          settlementBatch: true
        }
      },
      deliveries: {
        orderBy: {
          submittedAt: "desc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return (
    <section>
      <div className="market-hero">
        <div>
          <p className="eyebrow">Creator orders</p>
          <h1>订单列表</h1>
          <p className="lede">查看当前创作者名下的服务订单和支付状态。</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button secondary" href="/creator">返回工作台</Link>
          <Link className="button secondary" href="/creator/consultations">查看咨询</Link>
        </div>
      </div>

      <div className="list">
        {orders.length === 0 ? (
          <article className="panel empty-panel">
            <h2>暂无订单</h2>
            <p className="muted">从咨询生成的服务订单会进入这里。</p>
          </article>
        ) : null}
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
            <div className="amenity-grid" style={{ marginTop: 8 }}>
              <div className="amenity-item">
                <span className="amenity-icon">USD</span>
                <span>{order.currency} {order.priceCents}</span>
              </div>
              <div className="amenity-item">
                <span className="amenity-icon">PAY</span>
                <span>支付状态：{order.paymentStatus}</span>
              </div>
            </div>
            {order.status === "COMPLETED" ? (
              <div className="inline-status" style={{ marginTop: 12 }}>
                {order.settlementLine ? <SettlementStatusPill status={order.settlementLine.status} /> : <span className="status-pill">待结算</span>}
                <p className="muted">
                  结算状态：
                  {order.settlementLine?.status === "SETTLED"
                    ? `已结算 · ${(order.settlementLine.settledAt ?? order.settledAt)?.toLocaleString("zh-CN")}`
                    : order.settlementLine?.status === "LOCKED"
                      ? `结算处理中 · ${order.settlementLine.settlementBatch?.payoutReference ?? "待出款"}`
                      : "待结算"}
                </p>
              </div>
            ) : null}
            {order.deliveries[0] ? (
              <p className="muted" style={{ marginTop: 8 }}>最近交付：{order.deliveries[0].fileName}</p>
            ) : null}
            {order.status === "IN_PROGRESS" || order.status === "DELIVERED" ? (
              <div className="actions">
                <DisputeOrderButton orderId={order.id} />
              </div>
            ) : null}
            {order.status === "IN_PROGRESS" ? (
              <section style={{ marginTop: 12 }}>
                <h3>上传交付物</h3>
                <UploadDeliveryForm orderId={order.id} />
              </section>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
