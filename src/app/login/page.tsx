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
    <section className="page-hero">
      <p className="eyebrow">Account access</p>
      <h1>登录</h1>
      <p className="lede">输入邮箱获取魔法链接。开发者上传权限由白名单控制。</p>
      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={feedback.tone === "error" ? "feedback-error" : "feedback-success"}
        >
          {feedback.message}
        </p>
      ) : null}
      <LoginForm />
    </section>
  );
}
