import React from "react";
import { getLoginStatusMessage } from "@/server/auth/magic-link";
import { LoginForm } from "./login-form";

type LoginSearchParams = Record<string, string | string[] | undefined>;
type LoginFeedback = {
  tone: "success" | "error";
  message: string;
};

function getFirstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getLoginFeedback(searchParams?: LoginSearchParams | null): LoginFeedback | null {
  if (getFirstSearchParamValue(searchParams?.sent) === "1") {
    return {
      tone: "success",
      message: getLoginStatusMessage("sent")
    };
  }

  const error = getFirstSearchParamValue(searchParams?.error);
  if (error === "invalid-email" || error === "invalid-token" || error === "missing-token") {
    return {
      tone: "error",
      message: getLoginStatusMessage(error)
    };
  }

  return null;
}

export default async function LoginPage(props: {
  searchParams?: Promise<LoginSearchParams>;
}) {
  const feedback = getLoginFeedback(await props.searchParams);

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow" style={{ marginBottom: 8 }}>Account access</p>
        <h1 style={{ marginBottom: 6 }}>登录</h1>
        <p className="muted" style={{ marginBottom: 24 }}>输入邮箱获取魔法链接。开发者上传权限由白名单控制。</p>
        {feedback ? (
          <p
            role={feedback.tone === "error" ? "alert" : "status"}
            className={feedback.tone === "error" ? "feedback-error" : "feedback-success"}
          >
            {feedback.message}
          </p>
        ) : null}
        <LoginForm />
      </div>
    </div>
  );
}
