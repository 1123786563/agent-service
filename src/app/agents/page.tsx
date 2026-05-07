import React from "react";
import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { AgentsFilterForm } from "@/components/agents-filter-form";
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

const categoryIcons: Record<string, string> = {
  research: "R", ops: "O", writing: "W", rag: "K",
  deploy: "D", data: "DA", workflow: "F",
};

export default async function AgentsPage({ searchParams }: { searchParams?: Promise<AgentsSearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const query = getFirstParam(resolvedSearchParams?.q) ?? "";
  const category = getFirstParam(resolvedSearchParams?.category) ?? "";
  const sort = getFirstParam(resolvedSearchParams?.sort) ?? "newest";
  const serviceOnly = getFirstParam(resolvedSearchParams?.service) === "1";
  const normalizedSort =
    sort === "downloads" || sort === "consultations" || sort === "conversion" || sort === "name" ? sort : "newest";

  let packages;
  try {
    packages = await listPublishedAgentPackages({
      query,
      category,
      sort: normalizedSort
    });
  } catch {
    return (
      <section>
        <div className="market-hero">
          <div>
            <p className="eyebrow">Marketplace</p>
            <h1>智能体市场</h1>
            <p className="lede">浏览已通过结构校验的 Hermes-agent ZIP 包。</p>
          </div>
        </div>
        <section className="panel empty-panel">
          <h2>暂时无法加载</h2>
          <p className="muted">服务正在启动中，请稍后刷新页面重试。</p>
        </section>
      </section>
    );
  }

  const visiblePackages = serviceOnly
    ? packages.filter((agentPackage) => isAgentPackageServiceAvailable(agentPackage.metadataJson))
    : packages;
  const availableCategories = [...new Set([
    ...packages.flatMap((agentPackage) => agentPackage.categories),
    ...(category ? [category] : [])
  ])].sort();

  function buildAgentsUrl(overrides: Record<string, string> = {}) {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (category) sp.set("category", category);
    if (normalizedSort !== "newest" || overrides.sort) sp.set("sort", overrides.sort ?? normalizedSort);
    for (const [key, value] of Object.entries(overrides)) {
      if (key === "sort") continue;
      if (value) sp.set(key, value);
    }
    const qs = sp.toString();
    return `/agents${qs ? `?${qs}` : ""}`;
  }

  return (
    <section>
      <div className="market-hero">
        <div>
          <p className="eyebrow">Marketplace</p>
          <h1>智能体市场</h1>
          <p className="lede">浏览已通过结构校验的 Hermes-agent ZIP 包。</p>
        </div>
        <span className="status-pill">{visiblePackages.length} results</span>
      </div>

      <nav className="category-strip-nav" aria-label="Category filters">
        <Link className={`category-chip${!category ? " active" : ""}`} href="/agents">All</Link>
        {availableCategories.map((cat) => (
          <Link
            key={cat}
            className={`category-chip${category === cat ? " active" : ""}`}
            href={buildAgentsUrl({ category: cat })}
          >
            <span>{categoryIcons[cat.toLowerCase()] ?? "P"}</span>
            {cat}
          </Link>
        ))}
        <Link
          className={`category-chip${serviceOnly ? " active" : ""}`}
          href={serviceOnly ? buildAgentsUrl() : buildAgentsUrl({ service: "1" })}
        >
          <span>S</span>
          Service ready
        </Link>
      </nav>

      <AgentsFilterForm
        query={query}
        category={category}
        normalizedSort={normalizedSort}
        availableCategories={availableCategories}
        serviceOnly={serviceOnly}
      />

      <div className="section-header" style={{ marginTop: 24 }}>
        <div>
          <h2>快速转化</h2>
          <p className="muted">优先查看支持定制、部署或培训服务的智能体。</p>
        </div>
        {serviceOnly ? (
          <Link className="button secondary" href={buildAgentsUrl()}>查看全部</Link>
        ) : (
          <Link className="button secondary" href={buildAgentsUrl({ service: "1" })}>
            仅看可提供服务
          </Link>
        )}
      </div>

      {visiblePackages.length === 0 ? (
        <section className="panel empty-panel">
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
