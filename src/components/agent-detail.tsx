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

type DetailMetadata = {
  hermes?: {
    minVersion?: string;
    importType?: string;
  };
  permissions?: string[];
  env?: Array<{
    name?: string;
    required?: boolean;
    description?: string;
  }>;
  service?: {
    available?: boolean;
    types?: string[];
  };
  examples?: Array<{
    title?: string;
    input?: string;
    output?: string;
    path?: string;
  }>;
  inputs?: string[];
  outputs?: string[];
  assets?: Array<{
    name?: string;
    path?: string;
    type?: string;
  }>;
};

function readMetadata(value: AgentPackage["metadataJson"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as DetailMetadata;
  }

  return value as DetailMetadata;
}

function formatServiceType(value: string) {
  const labels: Record<string, string> = {
    customization: "定制",
    deployment: "部署",
    training: "培训",
    integration: "集成"
  };

  return labels[value] ?? value;
}

export function AgentDetail({ agentPackage }: AgentDetailProps) {
  const validation = agentPackage.validationResult as { risks?: string[] };
  const completeness = getAgentPackageCompleteness(agentPackage);
  const conversion = getAgentPackageConversionMetrics(agentPackage);
  const metadata = readMetadata(agentPackage.metadataJson);
  const serviceTypes = metadata.service?.available ? metadata.service.types ?? [] : [];
  const permissions = metadata.permissions ?? [];
  const envVars = metadata.env ?? [];
  const examples = metadata.examples ?? [];
  const inputs = metadata.inputs ?? [];
  const outputs = metadata.outputs ?? [];
  const assets = metadata.assets ?? [];

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
        <h2>场景、输入和产出</h2>
        <div className="spec-grid">
          <div>
            <h3>服务类型</h3>
            <p className="muted">
              {serviceTypes.length ? serviceTypes.map(formatServiceType).join("、") : "该包未声明可购买服务"}
            </p>
          </div>
          <div>
            <h3>输入</h3>
            {inputs.length ? (
              <ul>
                {inputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p className="muted">metadata 未声明输入说明，请查看 README。</p>
            )}
          </div>
          <div>
            <h3>产出</h3>
            {outputs.length ? (
              <ul>
                {outputs.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p className="muted">metadata 未声明产出说明，请查看 README。</p>
            )}
          </div>
        </div>
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
          Hermes 要求：最低版本 {metadata.hermes?.minVersion ?? "未声明"} · 导入类型：
          {metadata.hermes?.importType ?? "未声明"}
        </p>
        <p className="muted">
          完整度检查：摘要 {completeness.checks.summary ? "OK" : "缺失"} · 分类 {completeness.checks.categories ? "OK" : "缺失"} ·
          Skill 描述 {completeness.checks.skillDescriptions ? "OK" : "缺失"} ·
          流程描述 {completeness.checks.workflowDescriptions ? "OK" : "缺失"} ·
          作者/服务 {completeness.checks.authorAndService ? "OK" : "缺失"}
        </p>
        <p className="muted">风险标记：{validation.risks?.length ? validation.risks.join(", ") : "未发现基础风险标记"}</p>
      </section>

      <section className="panel">
        <h2>权限和环境变量</h2>
        <div className="spec-grid">
          <div>
            <h3>权限</h3>
            {permissions.length ? (
              <ul>
                {permissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}
              </ul>
            ) : (
              <p className="muted">未声明额外权限。</p>
            )}
          </div>
          <div>
            <h3>环境变量</h3>
            {envVars.length ? (
              <div className="list">
                {envVars.map((item) => (
                  <div key={item.name}>
                    <code>{item.name}</code>
                    <p className="muted">
                      {item.required ? "必填" : "可选"} · {item.description ?? "未提供说明"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">未声明环境变量。</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>结果示例和资产</h2>
        {examples.length ? (
          <div className="list">
            {examples.map((example, index) => (
              <article key={`${example.title ?? "example"}-${index}`}>
                <h3>{example.title ?? `示例 ${index + 1}`}</h3>
                {example.path ? <p><code>{example.path}</code></p> : null}
                {example.input ? <p className="muted">输入：{example.input}</p> : null}
                {example.output ? <p className="muted">产出：{example.output}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">metadata 未声明结构化结果示例；ZIP 内如有 examples/ 目录，请下载后查看。</p>
        )}
        {assets.length ? (
          <div className="list" style={{ marginTop: 14 }}>
            {assets.map((asset) => (
              <p key={asset.path ?? asset.name}>
                {asset.name ?? "资产"} · <code>{asset.path ?? "未声明路径"}</code>
                {asset.type ? ` · ${asset.type}` : ""}
              </p>
            ))}
          </div>
        ) : (
          <p className="muted">未声明封面或示例资产。</p>
        )}
      </section>

      <section className="page-hero" id="consultation">
        <p className="eyebrow">Creator service</p>
        <h2>咨询服务</h2>
        <p className="muted">如果你需要定制、部署或培训支持，可以直接提交需求，平台后续会生成服务订单。</p>
        <ConsultationForm agentSlug={agentPackage.slug} />
      </section>
    </article>
  );
}
