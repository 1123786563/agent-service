import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel">
      <h1>页面未找到</h1>
      <p className="muted">
        你访问的页面不存在，可能已被移动或删除。
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <Link className="button" href="/">返回首页</Link>
      </div>
    </section>
  );
}
