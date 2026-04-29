import Link from "next/link";

export default function HomePage() {
  return (
    <section className="hero">
      <p className="eyebrow">Hermes-agent marketplace</p>
      <h1>发现、检查并下载可导入 Hermes-agent 的智能体包</h1>
      <p className="lede">
        第一版聚焦白名单创作者发布 ZIP、平台校验 metadata、用户查看详情并下载。
      </p>
      <div className="actions">
        <Link className="button" href="/agents">浏览智能体</Link>
        <Link className="button secondary" href="/creator">上传智能体</Link>
      </div>
    </section>
  );
}
