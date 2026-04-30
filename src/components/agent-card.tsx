import React from "react";
import Link from "next/link";
import type { AgentPackage, Skill } from "@prisma/client";
import { getAgentPackageCompleteness } from "@/server/agents/package-service";

type AgentCardProps = {
  agentPackage: AgentPackage & {
    skills: Skill[];
    workflows?: Array<{ description: string }>;
  };
};

export function AgentCard({ agentPackage }: AgentCardProps) {
  const completeness = getAgentPackageCompleteness({
    summary: agentPackage.summary,
    categories: agentPackage.categories,
    skills: agentPackage.skills,
    workflows: agentPackage.workflows ?? [],
    metadataJson: agentPackage.metadataJson
  });

  return (
    <article className="panel agent-card">
      <p className="eyebrow">{agentPackage.categories.join(" / ")}</p>
      <h2>{agentPackage.name}</h2>
      <p>{agentPackage.summary}</p>
      <p className="muted">
        {agentPackage.skills.length} skills · v{agentPackage.version} · {agentPackage.downloadCount} downloads
      </p>
      <p className="muted">完整度 {completeness.score}%</p>
      <Link className="button secondary" href={`/agents/${agentPackage.slug}`}>查看详情</Link>
    </article>
  );
}
