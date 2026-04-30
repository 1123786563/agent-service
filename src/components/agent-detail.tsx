import React from "react";
import type { AgentPackage, Skill, User, Workflow } from "@prisma/client";
import { ConsultationForm } from "./consultation-form";
import { getAgentPackageCompleteness, getAgentPackageConversionMetrics } from "@/server/agents/package-service";

type AgentDetailProps = {
  agentPackage: AgentPackage & {
    skills: Skill[];
    workflows: Workflow[];
    owner: User;
    consultations?: Array<{ orders?: Array<{ status?: string }> }>;
  };
};

export function AgentDetail({ agentPackage }: AgentDetailProps) {
  const validation = agentPackage.validationResult as { risks?: string[] };
  const completeness = getAgentPackageCompleteness(agentPackage);
  const conversion = getAgentPackageConversionMetrics(agentPackage);

  return (
    <article className="detail">
      <section className="detail-hero panel">
        <div>
          <p className="eyebrow">Hermes-agent ZIP</p>
          <h1>{agentPackage.name}</h1>
          <p className="lede">{agentPackage.summary}</p>
          <p className="muted">
            作者：<a href={`/creators/${agentPackage.owner.id}`}>{agentPackage.owner.email}</a> ·
            版本：{agentPackage.version} · 完整度：{completeness.score}%
          </p>
          <p className="muted">
            下载：{conversion.downloads} · 咨询：{conversion.consultations} · 订单：{conversion.orders} · 完成：
            {conversion.completedOrders}
          </p>
        </div>
        <a className="button" href={`/api/agents/${agentPackage.slug}/download`}>下载 ZIP</a>
      </section>

      <section className="panel">
        <h2>Skill</h2>
        <div className="list">
          {agentPackage.skills.map((skill) => (
            <div key={skill.id}>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <code>{skill.path}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>执行流程</h2>
        <div className="list">
          {agentPackage.workflows.map((workflow) => (
            <div key={workflow.id}>
              <h3>{workflow.name}</h3>
              <p>{workflow.description}</p>
              <code>{workflow.path}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>安装和风险提示</h2>
        <ol>
          <li>下载 ZIP。</li>
          <li>在导入 Hermes-agent 前检查 README、权限和环境变量。</li>
          <li>确认配置后导入 Hermes-agent。</li>
        </ol>
        <p className="muted">
          完整度检查：摘要 {completeness.checks.summary ? "OK" : "缺失"} · 分类 {completeness.checks.categories ? "OK" : "缺失"} ·
          Skill 描述 {completeness.checks.skillDescriptions ? "OK" : "缺失"} ·
          流程描述 {completeness.checks.workflowDescriptions ? "OK" : "缺失"} ·
          作者/服务 {completeness.checks.authorAndService ? "OK" : "缺失"}
        </p>
        <p className="muted">风险标记：{validation.risks?.length ? validation.risks.join(", ") : "未发现基础风险标记"}</p>
      </section>

      <section className="panel" id="consultation">
        <h2>咨询服务</h2>
        <p className="muted">如果你需要定制、部署或培训支持，可以直接提交需求，平台后续会生成服务订单。</p>
        <ConsultationForm agentSlug={agentPackage.slug} />
      </section>
    </article>
  );
}
