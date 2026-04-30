import React from "react";
import { notFound } from "next/navigation";
import { AgentDetail } from "@/components/agent-detail";
import { getPublishedAgentPackageBySlug } from "@/server/agents/package-service";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agentPackage = await getPublishedAgentPackageBySlug(slug);

  if (!agentPackage) {
    notFound();
  }

  return <AgentDetail agentPackage={agentPackage} />;
}
