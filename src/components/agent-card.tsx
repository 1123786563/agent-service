import React from "react";
import Link from "next/link";
import type { AgentPackage, Skill } from "@prisma/client";

type AgentCardProps = {
  agentPackage: AgentPackage & { skills: Skill[] };
};

export function AgentCard({ agentPackage }: AgentCardProps) {
  return (
    <article className="panel agent-card">
      <p className="eyebrow">{agentPackage.categories.join(" / ")}</p>
      <h2>{agentPackage.name}</h2>
      <p>{agentPackage.summary}</p>
      <p className="muted">
        {agentPackage.skills.length} skills · v{agentPackage.version} · {agentPackage.downloadCount} downloads
      </p>
      <Link className="button secondary" href={`/agents/${agentPackage.slug}`}>查看详情</Link>
    </article>
  );
}
