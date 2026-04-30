import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getAgentPackageConversionMetrics } from "@/server/agents/package-service";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/login");
  }

  const [packages, consultationCount, orderCount, completedOrderCount] = await Promise.all([
    prisma.agentPackage.findMany({
      where: {
        status: "PUBLISHED"
      },
      include: {
        owner: true,
        consultations: {
          include: {
            orders: {
              select: {
                status: true
              }
            }
          }
        }
      },
      orderBy: {
        downloadCount: "desc"
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
  const creatorRows = await prisma.user.findMany({
    where: {
      role: UserRole.CREATOR
    },
    include: {
      packages: {
        where: {
          status: "PUBLISHED"
        },
        include: {
          consultations: {
            include: {
              orders: {
                select: {
                  status: true
                }
              }
            }
          }
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

  const totalDownloads = packages.reduce((sum, agentPackage) => sum + agentPackage.downloadCount, 0);
  const packageRows = packages
    .map((agentPackage) => ({
      agentPackage,
      metrics: getAgentPackageConversionMetrics(agentPackage)
    }))
    .sort((left, right) => right.metrics.conversionScore - left.metrics.conversionScore || right.metrics.downloads - left.metrics.downloads);
  const creatorRowsWithMetrics = creatorRows
    .map((creator) => {
      const totals = creator.packages.reduce((accumulator, agentPackage) => {
        const metrics = getAgentPackageConversionMetrics(agentPackage);

        return {
          downloads: accumulator.downloads + metrics.downloads,
          consultations: accumulator.consultations + metrics.consultations,
          orders: accumulator.orders + metrics.orders,
          completedOrders: accumulator.completedOrders + metrics.completedOrders
        };
      }, {
        downloads: 0,
        consultations: 0,
        orders: 0,
        completedOrders: 0
      });

      return {
        id: creator.id,
        email: creator.email,
        publishedPackages: creator.packages.length,
        completedProviderOrders: creator.providerOrders.length,
        ...totals
      };
    })
    .sort((left, right) => {
      return (
        right.completedProviderOrders - left.completedProviderOrders ||
        right.consultations - left.consultations ||
        right.downloads - left.downloads
      );
    });

  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <h1>运营分析</h1>
          <p className="lede">按漏斗和榜单查看下载、咨询、下单和完成情况。</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button secondary" href="/admin">返回概览</Link>
          <Link className="button secondary" href="/admin/whitelist">白名单</Link>
        </div>
      </div>

      <div className="grid">
        <article className="panel">
          <p className="eyebrow">Funnel</p>
          <h2>{totalDownloads}</h2>
          <p className="muted">累计下载</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Consult</p>
          <h2>{consultationCount}</h2>
          <p className="muted">咨询率 {toPercent(consultationCount, totalDownloads)}%</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Order</p>
          <h2>{orderCount}</h2>
          <p className="muted">下单率 {toPercent(orderCount, consultationCount)}%</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Complete</p>
          <h2>{completedOrderCount}</h2>
          <p className="muted">完成率 {toPercent(completedOrderCount, orderCount)}%</p>
        </article>
      </div>

      <div className="section-header" style={{ marginTop: 32 }}>
        <div>
          <h2>漏斗明细</h2>
          <p className="muted">聚合整个市场的下载、咨询、订单和交付完成情况。</p>
        </div>
      </div>
      <div className="grid">
          <article className="panel">
            <h3>下载到咨询</h3>
            <p className="muted">{`${totalDownloads} -> ${consultationCount}`}</p>
            <p className="muted">转化率 {toPercent(consultationCount, totalDownloads)}%</p>
          </article>
          <article className="panel">
            <h3>咨询到订单</h3>
            <p className="muted">{`${consultationCount} -> ${orderCount}`}</p>
            <p className="muted">转化率 {toPercent(orderCount, consultationCount)}%</p>
          </article>
          <article className="panel">
            <h3>订单到完成</h3>
            <p className="muted">{`${orderCount} -> ${completedOrderCount}`}</p>
            <p className="muted">转化率 {toPercent(completedOrderCount, orderCount)}%</p>
          </article>
      </div>

      <div className="section-header" style={{ marginTop: 32 }}>
        <div>
          <h2>高转化智能体</h2>
          <p className="muted">按综合分、下载和订单完成情况排序。</p>
        </div>
      </div>
      <div className="list">
        {packageRows.map(({ agentPackage, metrics }) => (
          <article className="panel" key={agentPackage.id}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <div>
                <h3>{agentPackage.name}</h3>
                <p className="muted">{agentPackage.owner.email}</p>
              </div>
              <Link className="button secondary" href={`/agents/${agentPackage.slug}`}>查看详情</Link>
            </div>
            <p className="muted">
              下载：{metrics.downloads} · 咨询：{metrics.consultations} · 订单：{metrics.orders} · 完成：
              {metrics.completedOrders}
            </p>
            <p className="muted">
              咨询率：{metrics.consultationRate}% · 完成率：{metrics.completionRate}% · 综合分：
              {metrics.conversionScore}
            </p>
          </article>
        ))}
      </div>

      <div className="section-header" style={{ marginTop: 32 }}>
        <div>
          <h2>创作者效率</h2>
          <p className="muted">按已完成订单、咨询量和下载量查看当前服务商表现。</p>
        </div>
      </div>
      <div className="list">
        {creatorRowsWithMetrics.map((creator) => (
          <article className="panel" key={creator.id}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <div>
                <h3>{creator.email}</h3>
                <p className="muted">已发布：{creator.publishedPackages}</p>
              </div>
              <Link className="button secondary" href={`/creators/${creator.id}`}>公开页</Link>
            </div>
            <p className="muted">
              下载：{creator.downloads} · 咨询：{creator.consultations} · 订单：{creator.orders} · 完成：
              {creator.completedOrders}
            </p>
            <p className="muted">服务商完成单：{creator.completedProviderOrders}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
