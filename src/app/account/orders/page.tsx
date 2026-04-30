import React from "react";
import { redirect } from "next/navigation";
import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { CompleteOrderButton } from "@/components/complete-order-button";
import { OrderStatusPill } from "@/components/order-status-pill";
import { getCurrentUser } from "@/server/auth/session";
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
      <div className="section-header">
        <div>
          <h1>我的订单</h1>
          <p className="lede">查看服务订单状态，并为待支付订单发起支付。</p>
        </div>
      </div>

      <div className="list">
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
            <p className="muted">
              {order.currency} {order.priceCents} · 支付状态：{order.paymentStatus}
            </p>

            {order.status === ServiceOrderStatus.PENDING_PAYMENT && order.paymentStatus === PaymentStatus.UNPAID ? (
              <form action={`/api/orders/${order.id}/pay`} method="post">
                <button className="button" type="submit">去支付</button>
              </form>
            ) : null}

            {order.deliveries[0] ? (
              <section>
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
                </div>
              </section>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
