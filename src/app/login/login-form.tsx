"use client";

import React, { useState } from "react";

export function LoginForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;

    try {
      const data = new FormData();
      data.append("email", email);
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        body: data,
        redirect: "manual",
      });

      if (res.status === 303 || res.status === 302 || res.status === 301) {
        const location = res.headers.get("location") || "/login?sent=1";
        window.location.href = location;
      } else if (res.ok) {
        window.location.href = "/login?sent=1";
      } else {
        setStatus("error");
        setErrorMessage("发送失败，请稍后重试。");
      }
    } catch {
      setStatus("error");
      setErrorMessage("网络错误，请检查连接后重试。");
    }
  }

  return (
    <>
      {status === "error" && errorMessage ? (
        <p role="alert" style={{ margin: "0 0 16px", color: "#b91c1c", fontWeight: 600 }}>
          {errorMessage}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="form">
        <label>
          邮箱
          <input name="email" type="email" required disabled={status === "loading"} />
        </label>
        <button className="button" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "发送中…" : "发送登录链接"}
        </button>
      </form>
    </>
  );
}
