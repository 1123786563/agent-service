import React from "react";
import { AgentCard } from "@/components/agent-card";
import { listPublishedAgentPackages } from "@/server/agents/package-service";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const packages = await listPublishedAgentPackages();

  return (
    <section>
      <h1>智能体市场</h1>
      <p className="lede">浏览已通过结构校验的 Hermes-agent ZIP 包。</p>
      <div className="grid">
        {packages.map((agentPackage) => (
          <AgentCard key={agentPackage.id} agentPackage={agentPackage} />
        ))}
      </div>
    </section>
  );
}
