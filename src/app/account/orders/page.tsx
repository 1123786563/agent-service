import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { CompleteOrderButton } from "@/components/complete-order-button";
import { DisputeOrderButton } from "@/components/dispute-order-button";
import { OrderStatusPill } from "@/components/order-status-pill";
import { getCurrentUser } from "@/server/auth/session";
import { logout } from "@/app/account/actions";
import { prisma } from "@/server/db";

export default async function AccountOrdersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const orders = await prisma.serviceOrder.findMany({
    where: {
      buyerEmail: user.email.toLowerCase()
    },
    include: {
      consultation: {
        include: {
          agentPackage: true
        }
      },
      provider: true,
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
          <p className="eyebrow">Buyer orders</p>
          <h1>我的订单</h1>
          <p className="lede">查看服务订单状态，并为待支付订单发起支付。</p>
        </div>
        <form action={logout}>
          <button className="button secondary" type="submit">退出登录</button>
        </form>
      </div>

      <div className="list">
        {orders.length === 0 ? (
          <article className="panel empty-panel">
            <h2>暂无订单</h2>
            <p className="muted">从支持服务的智能体详情页提交咨询后，订单会出现在这里。</p>
          </article>
        ) : null}
        {orders.map((order) => (
          <article className="panel" key={order.id}>
            <div className="section-header">
              <div>
                <h2>{order.title}</h2>
                <p className="muted">
                  {order.consultation.agentPackage.name} · 服务商：{order.provider.email}
                </p>
              </div>
              <OrderStatusPill status={order.status} />
            </div>
            <p>{order.scope}</p>
            <div className="amenity-grid" style={{ marginTop: 8 }}>
              <div className="amenity-item">
                <span className="amenity-icon">💰</span>
                <span>{order.currency} {order.priceCents}</span>
              </div>
              <div className="amenity-item">
                <span className="amenity-icon">💳</span>
                <span>支付状态：{order.paymentStatus}</span>
              </div>
            </div>

            {order.status === ServiceOrderStatus.PENDING_PAYMENT &&
            (order.paymentStatus === PaymentStatus.UNPAID || order.paymentStatus === PaymentStatus.FAILED) ? (
              <section style={{ marginTop: 12 }}>
                {order.paymentStatus === PaymentStatus.FAILED ? (
                  <p className="feedback-error">上一次支付失败，请重新发起支付。</p>
                ) : null}
                <div className="actions">
                  <form action={`/api/orders/${order.id}/pay`} method="post">
                    <button className="button" type="submit">去支付</button>
                  </form>
                  <CancelOrderButton orderId={order.id} />
                </div>
              </section>
            ) : null}

            {order.deliveries[0] ? (
              <section style={{ marginTop: 12 }}>
                <h3>交付物</h3>
                {order.deliveries[0].note ? <p>{order.deliveries[0].note}</p> : null}
                <div className="actions">
                  <a
                    className="button secondary"
                    href={`/api/orders/${order.id}/deliveries/${order.deliveries[0].id}/download`}
                  >
                    下载交付物
                  </a>
                  {order.status === ServiceOrderStatus.DELIVERED ? (
                    <CompleteOrderButton orderId={order.id} />
                  ) : null}
                  {order.status === ServiceOrderStatus.IN_PROGRESS || order.status === ServiceOrderStatus.DELIVERED ? (
                    <DisputeOrderButton orderId={order.id} />
                  ) : null}
                </div>
              </section>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
