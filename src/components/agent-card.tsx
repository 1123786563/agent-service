import React from "react";
import Link from "next/link";
import type { AgentPackage, Skill } from "@prisma/client";
import {
  getAgentPackageCompleteness,
  getAgentPackageConversionMetrics,
  isAgentPackageServiceAvailable
} from "@/server/agents/package-service";

type AgentCardProps = {
  agentPackage: AgentPackage & {
    skills: Skill[];
    workflows?: Array<{ description: string }>;
    consultations?: Array<{ orders?: Array<{ status?: string }> }>;
  };
};

function getAgentTone(categories: string[]) {
  const value = categories.join(" ").toLowerCase();

  if (value.includes("research") || value.includes("rag") || value.includes("data")) {
    return "research";
  }

  if (value.includes("ops") || value.includes("deploy") || value.includes("workflow")) {
    return "ops";
  }

  return "writing";
}

export function AgentCard({ agentPackage }: AgentCardProps) {
  const completeness = getAgentPackageCompleteness({
    summary: agentPackage.summary,
    categories: agentPackage.categories,
    skills: agentPackage.skills,
    workflows: agentPackage.workflows ?? [],
    metadataJson: agentPackage.metadataJson
  });
  const serviceAvailable = isAgentPackageServiceAvailable(agentPackage.metadataJson);
  const conversion = getAgentPackageConversionMetrics(agentPackage);
  const rating = (4.72 + Math.min(24, completeness.score) / 100).toFixed(2);

  return (
    <article className="agent-card" data-tone={getAgentTone(agentPackage.categories)}>
      <Link className="agent-card-photo" href={`/agents/${agentPackage.slug}`} aria-label={`查看 ${agentPackage.name}`}>
        <span className="guest-badge">{serviceAvailable ? "Service ready" : "Verified package"}</span>
        <span className="heart-button" aria-hidden="true">♥</span>
        <span className="agent-card-initial">{agentPackage.name.slice(0, 1)}</span>
        <span className="carousel-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </Link>
      <div className="agent-card-body">
        <div className="agent-card-meta">
          <span>{agentPackage.categories.join(" / ") || "Hermes-agent ZIP"}</span>
          <b>★ {rating}</b>
        </div>
        <h2>{agentPackage.name}</h2>
        <p>{agentPackage.summary}</p>
        <p>
          {agentPackage.skills.length} skills · v{agentPackage.version} · {agentPackage.downloadCount} downloads
        </p>
        <p>
          咨询 {conversion.consultations} · 订单 {conversion.orders} · 完成 {conversion.completedOrders} · 完整度 {completeness.score}%
        </p>
        {serviceAvailable ? <p>支持定制/部署服务</p> : null}
        <div className="agent-card-actions">
          <Link className="button secondary" href={`/agents/${agentPackage.slug}`}>查看详情</Link>
        {serviceAvailable ? (
          <Link className="button" href={`/agents/${agentPackage.slug}#consultation`}>咨询服务</Link>
        ) : null}
        </div>
      </div>
    </article>
  );
}
