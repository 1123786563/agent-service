import React from "react";
import type { AgentPackage, Skill, User, Workflow } from "@prisma/client";
import { ConsultationForm } from "./consultation-form";

type AgentDetailProps = {
  agentPackage: AgentPackage & {
    skills: Skill[];
    workflows: Workflow[];
    owner: User;
  };
};

export function AgentDetail({ agentPackage }: AgentDetailProps) {
  const validation = agentPackage.validationResult as { risks?: string[] };

  return (
    <article className="detail">
      <section className="detail-hero panel">
        <div>
          <p className="eyebrow">Hermes-agent ZIP</p>
          <h1>{agentPackage.name}</h1>
          <p className="lede">{agentPackage.summary}</p>
          <p className="muted">作者：{agentPackage.owner.email} · 版本：{agentPackage.version}</p>
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
        <p className="muted">风险标记：{validation.risks?.length ? validation.risks.join(", ") : "未发现基础风险标记"}</p>
      </section>

      <section className="panel">
        <h2>咨询服务</h2>
        <p className="muted">如果你需要定制、部署或培训支持，可以直接提交需求，平台后续会生成服务订单。</p>
        <ConsultationForm agentSlug={agentPackage.slug} />
      </section>
    </article>
  );
}
