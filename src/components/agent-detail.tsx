import React from "react";
import Link from "next/link";
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
  const rating = (4.72 + Math.min(24, completeness.score) / 100).toFixed(2);

  return (
    <article className="detail">
      {/* ── Detail hero: title + photo grid + reservation card ── */}
      <section className="detail-hero">
        <div className="detail-title">
          <div>
            <p className="eyebrow">Hermes-agent ZIP</p>
            <h1>{agentPackage.name}</h1>
            <p className="lede">{agentPackage.summary}</p>
          </div>
          <div className="detail-photo-grid" aria-hidden="true">
            <div className="detail-photo-main" />
            <div className="detail-photo-side" />
          </div>
        </div>
        <aside className="reservation-card" aria-label="Download and service summary">
          <div className="reservation-price">
            <strong>★ {rating}</strong>
            <span className="muted">{conversion.downloads} downloads</span>
          </div>
          <a className="button" href={`/api/agents/${agentPackage.slug}/download`}>下载 ZIP</a>
          <div className="reservation-breakdown">
            <span><span>咨询</span><b>{conversion.consultations}</b></span>
            <span><span>订单</span><b>{conversion.orders}</b></span>
            <span><span>完成</span><b>{conversion.completedOrders}</b></span>
            <span><span>服务类型</span><b>{serviceTypes.length ? serviceTypes.map(formatServiceType).join(" / ") : "未声明"}</b></span>
          </div>
        </aside>
      </section>

      {/* ── Rating display card ── */}
      <section className="rating-display-card" aria-label="Package validation score">
        <strong>{completeness.score}%</strong>
        <h2>Validated package score</h2>
        <p className="muted">摘要、分类、Skill 描述、Workflow 描述和服务声明会共同影响详情页完整度。</p>
      </section>

      {/* ── Host card ── */}
      <section className="panel">
        <h2>创作者信息</h2>
        <div className="host-card">
          <div className="host-avatar">{agentPackage.owner.email.slice(0, 1).toUpperCase()}</div>
          <div>
            <h3>{agentPackage.owner.email}</h3>
            <p className="muted">版本 {agentPackage.version} · 完整度 {completeness.score}%</p>
            <p className="muted">
              下载 {conversion.downloads} · 咨询 {conversion.consultations} · 订单 {conversion.orders} · 完成 {conversion.completedOrders}
            </p>
            <div className="actions" style={{ marginTop: 8 }}>
              <Link className="surface-link" href={`/creators/${agentPackage.owner.id}`}>查看创作者公开页</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Amenity-style: Service types, inputs, outputs ── */}
      <section className="panel">
        <h2>这个智能体提供什么</h2>
        <div className="amenity-grid">
          {serviceTypes.map((type) => (
            <div className="amenity-item" key={type}>
              <span className="amenity-icon">
                {type === "customization" ? "🎨" : type === "deployment" ? "🚀" : type === "training" ? "📖" : "🔗"}
              </span>
              {formatServiceType(type)}
            </div>
          ))}
          {inputs.map((input) => (
            <div className="amenity-item" key={input}>
              <span className="amenity-icon">📥</span>
              {input}
            </div>
          ))}
          {outputs.map((output) => (
            <div className="amenity-item" key={output}>
              <span className="amenity-icon">📤</span>
              {output}
            </div>
          ))}
          {serviceTypes.length === 0 && inputs.length === 0 && outputs.length === 0 && (
            <p className="muted">该包未声明可购买服务或输入输出说明，请查看 README。</p>
          )}
        </div>
      </section>

      {/* ── Skills ── */}
      <section className="panel">
        <h2>Skill</h2>
        <div className="amenity-grid">
          {agentPackage.skills.map((skill) => (
            <div className="amenity-item" key={skill.id}>
              <span className="amenity-icon">⚡</span>
              <div>
                <strong>{skill.name}</strong>
                <p className="muted" style={{ margin: 0 }}>{skill.description}</p>
                <code>{skill.path}</code>
              </div>
            </div>
          ))}
          {agentPackage.skills.length === 0 && <p className="muted">未声明 Skill。</p>}
        </div>
      </section>

      {/* ── Workflows ── */}
      <section className="panel">
        <h2>执行流程</h2>
        <div className="amenity-grid">
          {agentPackage.workflows.map((workflow) => (
            <div className="amenity-item" key={workflow.id}>
              <span className="amenity-icon">🔄</span>
              <div>
                <strong>{workflow.name}</strong>
                <p className="muted" style={{ margin: 0 }}>{workflow.description}</p>
                <code>{workflow.path}</code>
              </div>
            </div>
          ))}
          {agentPackage.workflows.length === 0 && <p className="muted">未声明 Workflow。</p>}
        </div>
      </section>

      {/* ── Install & risk ── */}
      <section className="panel">
        <h2>安装和风险提示</h2>
        <ol>
          <li>下载 ZIP。</li>
          <li>在导入 Hermes-agent 前检查 README、权限和环境变量。</li>
          <li>确认配置后导入 Hermes-agent。</li>
        </ol>
        <div className="amenity-grid" style={{ marginTop: 16 }}>
          <div className="amenity-item">
            <span className="amenity-icon">📦</span>
            <span>最低版本 {metadata.hermes?.minVersion ?? "未声明"}</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">📥</span>
            <span>导入类型 {metadata.hermes?.importType ?? "未声明"}</span>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          完整度：摘要 {completeness.checks.summary ? "OK" : "缺失"} · 分类 {completeness.checks.categories ? "OK" : "缺失"} ·
          Skill 描述 {completeness.checks.skillDescriptions ? "OK" : "缺失"} ·
          流程描述 {completeness.checks.workflowDescriptions ? "OK" : "缺失"} ·
          作者/服务 {completeness.checks.authorAndService ? "OK" : "缺失"}
        </p>
        <p className="muted">风险标记：{validation.risks?.length ? validation.risks.join(", ") : "未发现基础风险标记"}</p>
      </section>

      {/* ── Permissions & env vars ── */}
      <section className="panel">
        <h2>权限和环境变量</h2>
        <div className="amenity-grid">
          <div>
            <h3>权限</h3>
            {permissions.length ? (
              <div className="amenity-grid">
                {permissions.map((permission) => (
                  <div className="amenity-item" key={permission}>
                    <span className="amenity-icon">🔐</span>
                    <code>{permission}</code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">未声明额外权限。</p>
            )}
          </div>
          <div>
            <h3>环境变量</h3>
            {envVars.length ? (
              <div className="amenity-grid">
                {envVars.map((item) => (
                  <div className="amenity-item" key={item.name}>
                    <span className="amenity-icon">🔑</span>
                    <div>
                      <code>{item.name}</code>
                      <p className="muted" style={{ margin: 0 }}>
                        {item.required ? "必填" : "可选"} · {item.description ?? "未提供说明"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">未声明环境变量。</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Examples & assets ── */}
      <section className="panel">
        <h2>结果示例和资产</h2>
        {examples.length ? (
          <div className="reviews-grid">
            {examples.map((example, index) => (
              <div className="review-card" key={`${example.title ?? "example"}-${index}`}>
                <div className="review-author">
                  <div className="review-avatar">{index + 1}</div>
                  <strong>{example.title ?? `示例 ${index + 1}`}</strong>
                </div>
                {example.path ? <p><code>{example.path}</code></p> : null}
                {example.input ? <p className="muted">输入：{example.input}</p> : null}
                {example.output ? <p className="muted">产出：{example.output}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">metadata 未声明结构化结果示例；ZIP 内如有 examples/ 目录，请下载后查看。</p>
        )}
        {assets.length ? (
          <div className="amenity-grid" style={{ marginTop: 14 }}>
            {assets.map((asset) => (
              <div className="amenity-item" key={asset.path ?? asset.name}>
                <span className="amenity-icon">📎</span>
                <span>{asset.name ?? "资产"} · <code>{asset.path ?? "未声明路径"}</code>{asset.type ? ` · ${asset.type}` : ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">未声明封面或示例资产。</p>
        )}
      </section>

      {/* ── Consultation form ── */}
      <section className="page-hero" id="consultation">
        <p className="eyebrow">Creator service</p>
        <h2>咨询服务</h2>
        <p className="muted">如果你需要定制、部署或培训支持，可以直接提交需求，平台后续会生成服务订单。</p>
        <ConsultationForm agentSlug={agentPackage.slug} />
      </section>
    </article>
  );
}
