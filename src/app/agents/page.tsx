import React from "react";
import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { isAgentPackageServiceAvailable, listPublishedAgentPackages } from "@/server/agents/package-service";

export const dynamic = "force-dynamic";

type AgentsSearchParams = {
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  service?: string | string[];
};

function getFirstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AgentsPage({ searchParams }: { searchParams?: Promise<AgentsSearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const query = getFirstParam(resolvedSearchParams?.q) ?? "";
  const category = getFirstParam(resolvedSearchParams?.category) ?? "";
  const sort = getFirstParam(resolvedSearchParams?.sort) ?? "newest";
  const serviceOnly = getFirstParam(resolvedSearchParams?.service) === "1";
  const normalizedSort =
    sort === "downloads" || sort === "consultations" || sort === "conversion" || sort === "name" ? sort : "newest";
  const packages = await listPublishedAgentPackages({
    query,
    category,
    sort: normalizedSort
  });
  const visiblePackages = serviceOnly
    ? packages.filter((agentPackage) => isAgentPackageServiceAvailable(agentPackage.metadataJson))
    : packages;
  const availableCategories = [...new Set(packages.flatMap((agentPackage) => agentPackage.categories))].sort();

  return (
    <section>
      <div className="section-header">
        <div>
          <h1>智能体市场</h1>
          <p className="lede">浏览已通过结构校验的 Hermes-agent ZIP 包。</p>
        </div>
        <p className="muted">{visiblePackages.length} results</p>
      </div>

      <form className="panel filters" method="get">
        <label>
          搜索
          <input defaultValue={query} name="q" placeholder="名称、摘要、slug、分类" type="search" />
        </label>
        <label>
          分类
          <select defaultValue={category} name="category">
            <option value="">全部</option>
            {availableCategories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          排序
          <select defaultValue={normalizedSort} name="sort">
            <option value="newest">最新发布</option>
            <option value="downloads">下载量</option>
            <option value="consultations">咨询热度</option>
            <option value="conversion">综合转化</option>
            <option value="name">名称</option>
          </select>
        </label>
        <label>
          <input defaultChecked={serviceOnly} name="service" type="checkbox" value="1" />
          仅看可提供服务
        </label>
        <button className="button" type="submit">筛选</button>
      </form>

      <div className="section-header" style={{ marginTop: 24 }}>
        <div>
          <h2>快速转化</h2>
          <p className="muted">优先查看支持定制、部署或培训服务的智能体。</p>
        </div>
        {serviceOnly ? (
          <Link className="button secondary" href={`/agents?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&sort=${encodeURIComponent(normalizedSort)}`}>查看全部</Link>
        ) : (
          <Link
            className="button secondary"
            href={`/agents?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&sort=${encodeURIComponent(normalizedSort)}&service=1`}
          >
            仅看可提供服务
          </Link>
        )}
      </div>

      {visiblePackages.length === 0 ? (
        <section className="panel">
          <h2>没有匹配结果</h2>
          <p className="muted">调整关键词、分类或排序后再试。</p>
        </section>
      ) : null}

      <div className="grid">
        {visiblePackages.map((agentPackage) => (
          <AgentCard key={agentPackage.id} agentPackage={agentPackage} />
        ))}
      </div>
    </section>
  );
}
