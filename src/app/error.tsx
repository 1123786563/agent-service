"use client";

import React from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="page-hero">
      <p className="eyebrow">Runtime error</p>
      <h1>出了点问题</h1>
      <p className="muted">
        {error.message || "页面加载时发生错误，请稍后重试。"}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button className="button" onClick={reset}>重试</button>
        <Link className="button secondary" href="/">返回首页</Link>
      </div>
    </section>
  );
}
