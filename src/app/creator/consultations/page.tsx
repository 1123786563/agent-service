import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WhitelistStatus, ConsultationStatus } from "@prisma/client";
import { ConsultationStatusPill } from "@/components/consultation-status-pill";
import { createConsultationOrderAction } from "../actions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function CreatorConsultationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return (
      <section className="panel">
        <h1>咨询列表</h1>
        <p className="lede">你的邮箱尚未进入白名单，暂时不能处理咨询请求。</p>
      </section>
    );
  }

  const consultations = await prisma.consultation.findMany({
    where: {
      providerId: user.id
    },
    include: {
      agentPackage: true,
      orders: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>咨询列表</h1>
          <p className="lede">梳理用户需求、确认服务范围，并从咨询直接生成订单。</p>
        </div>
        <Link className="button secondary" href="/creator/orders">查看订单</Link>
      </div>

      <div className="list">
        {consultations.map((consultation) => (
          <article className="panel" key={consultation.id}>
            <div className="section-header">
              <div>
                <h2>{consultation.agentPackage.name}</h2>
                <p className="muted">{consultation.buyerEmail}</p>
              </div>
              <ConsultationStatusPill status={consultation.status} />
            </div>
            <p>{consultation.requirement}</p>
            <p className="muted">创建时间：{consultation.createdAt.toLocaleString("zh-CN")}</p>

            {consultation.status === ConsultationStatus.ORDER_CREATED || consultation.orders.length > 0 ? (
              <p className="muted">该咨询已生成订单。</p>
            ) : (
              <form action={createConsultationOrderAction} className="form">
                <input name="consultationId" type="hidden" value={consultation.id} />
                <label>
                  订单标题
                  <input
                    defaultValue={`${consultation.agentPackage.name} 服务订单`}
                    name="title"
                    required
                    type="text"
                  />
                </label>
                <label>
                  范围摘要
                  <textarea
                    className="textarea"
                    defaultValue={consultation.scopedSummary ?? consultation.requirement}
                    name="scopedSummary"
                    required
                    rows={4}
                  />
                </label>
                <div className="inline-fields">
                  <label>
                    报价（分）
                    <input min="1" name="priceCents" required step="1" type="number" />
                  </label>
                  <label>
                    币种
                    <input defaultValue="USD" maxLength={3} name="currency" required type="text" />
                  </label>
                </div>
                <button className="button" type="submit">生成订单</button>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
