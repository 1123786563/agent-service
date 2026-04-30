import { getLoginStatusMessage } from "@/server/auth/magic-link";

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
    <section className="panel">
      <h1>登录</h1>
      <p className="lede">输入邮箱获取魔法链接。开发者上传权限由白名单控制。</p>
      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          style={{
            margin: "0 0 16px",
            color: feedback.tone === "error" ? "#b91c1c" : "#0f766e",
            fontWeight: 600
          }}
        >
          {feedback.message}
        </p>
      ) : null}
      <form method="post" action="/api/auth/request-link" className="form">
        <label>
          邮箱
          <input name="email" type="email" required />
        </label>
        <button className="button" type="submit">发送登录链接</button>
      </form>
    </section>
  );
}
