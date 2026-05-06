import React from "react";
import Link from "next/link";

const checklist = [
  "先阅读 README.md，确认智能体解决的问题和运行入口。",
  "检查 agent.json 中声明的 permissions、env 和 workflows。",
  "只在可信工作区导入第三方 ZIP，避免直接授予写文件或网络权限。",
  "导入后先用示例输入做一次小范围验证，再接入真实业务数据。"
];

export default function DocsPage() {
  return (
    <section className="stack">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Hermes-agent docs</p>
          <h1>下载、检查并导入智能体 ZIP</h1>
          <p className="lede">面向使用者的基础导入说明，帮助你在导入前理解包结构、权限和环境变量。</p>
        </div>
        <div className="actions">
          <Link className="button" href="/agents">浏览智能体</Link>
          <Link className="button secondary" href="/services">查看轻服务</Link>
        </div>
      </div>

      <section className="panel">
        <h2>ZIP 包结构</h2>
        <pre className="code-block">{`agent.zip
├── agent.json
├── README.md
├── skills/
├── workflows/
├── examples/
└── assets/`}</pre>
        <p className="muted">
          平台只解析 metadata、README、skill 和 workflow 路径，不执行上传包内代码。
        </p>
      </section>

      <section className="panel">
        <h2>导入前检查</h2>
        <div className="list">
          {checklist.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>常见风险</h2>
        <div className="spec-grid">
          <div>
            <h3>网络权限</h3>
            <p className="muted">确认外部服务、API key 和数据发送范围符合你的安全要求。</p>
          </div>
          <div>
            <h3>文件写入</h3>
            <p className="muted">优先在隔离目录试运行，避免覆盖现有项目文件。</p>
          </div>
          <div>
            <h3>环境变量</h3>
            <p className="muted">只提供最小必要凭证，并为测试和生产使用不同密钥。</p>
          </div>
        </div>
      </section>
    </section>
  );
}
