import React from "react";
import Link from "next/link";

const serviceTypes = [
  {
    title: "定制",
    body: "围绕现有智能体调整 prompt、skill、workflow 和输出格式。",
    icon: "🎨",
    letter: "C"
  },
  {
    title: "部署",
    body: "协助配置运行环境、权限、密钥和团队工作区导入流程。",
    icon: "🚀",
    letter: "D"
  },
  {
    title: "培训",
    body: "为团队讲解智能体使用边界、输入规范和验收方法。",
    icon: "📖",
    letter: "T"
  },
  {
    title: "集成",
    body: "把智能体接入内部文档、数据源或已有操作流程。",
    icon: "🔗",
    letter: "I"
  }
];

const flowSteps = [
  "提交咨询",
  "确认范围",
  "生成订单",
  "完成支付",
  "上传交付",
  "确认完成"
];

export default function ServicesPage() {
  return (
    <section className="stack">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Services</p>
          <h1>购买智能体相关轻服务</h1>
          <p className="lede">从智能体详情页提交需求，服务商确认范围后生成订单，支付完成后在站内交付。</p>
        </div>
        <div className="actions">
          <Link className="button" href="/agents?service=1">查看可服务智能体</Link>
          <Link className="button secondary" href="/docs">导入说明</Link>
        </div>
      </div>

      <div className="experience-grid">
        {serviceTypes.map((item) => (
          <article className="listing-card" key={item.title}>
            <div className="experience-card-art">
              <span className="guest-badge">NEW</span>
              <span className="listing-art" style={{ position: "static", aspectRatio: "auto", background: "transparent", borderRadius: 0 }}>
                <span style={{ fontSize: 40 }}>{item.icon}</span>
              </span>
            </div>
            <div className="listing-body">
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="panel">
        <h2>交易流程</h2>
        <div className="flow-list">
          {flowSteps.map((step, index) => (
            <span key={step}>
              <span style={{ color: "var(--accent)", fontWeight: 700, marginRight: 6 }}>{index + 1}</span>
              {step}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}
