import React from "react";
import Link from "next/link";

const serviceTypes = [
  {
    title: "定制",
    body: "围绕现有智能体调整 prompt、skill、workflow 和输出格式。"
  },
  {
    title: "部署",
    body: "协助配置运行环境、权限、密钥和团队工作区导入流程。"
  },
  {
    title: "培训",
    body: "为团队讲解智能体使用边界、输入规范和验收方法。"
  },
  {
    title: "集成",
    body: "把智能体接入内部文档、数据源或已有操作流程。"
  }
];

export default function ServicesPage() {
  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <p className="eyebrow">Services</p>
          <h1>购买智能体相关轻服务</h1>
          <p className="lede">从智能体详情页提交需求，服务商确认范围后生成订单，支付完成后在站内交付。</p>
        </div>
        <Link className="button" href="/agents?service=1">查看可服务智能体</Link>
      </div>

      <div className="grid">
        {serviceTypes.map((item) => (
          <article className="panel" key={item.title}>
            <h2>{item.title}</h2>
            <p className="muted">{item.body}</p>
          </article>
        ))}
      </div>

      <section className="panel">
        <h2>交易流程</h2>
        <div className="flow-list">
          <span>提交咨询</span>
          <span>确认范围</span>
          <span>生成订单</span>
          <span>完成支付</span>
          <span>上传交付</span>
          <span>确认完成</span>
        </div>
      </section>
    </section>
  );
}
