import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "@/app/login/page";

async function renderLoginPage(searchParams?: Record<string, string | string[] | undefined>) {
  const page = await LoginPage({
    searchParams: Promise.resolve(searchParams)
  });

  return renderToStaticMarkup(page);
}

describe("login page feedback", () => {
  it("renders a success message when the login link request succeeds", async () => {
    const html = await renderLoginPage({ sent: "1" });

    expect(html).toContain("登录链接已发送，请检查邮箱。");
    expect(html).toContain('role="status"');
  });

  it("renders an error message when the login token is invalid", async () => {
    const html = await renderLoginPage({ error: "invalid-token" });

    expect(html).toContain("登录链接无效或已过期，请重新获取。");
    expect(html).toContain('role="alert"');
  });

  it("renders an error message when the login token is missing", async () => {
    const html = await renderLoginPage({ error: "missing-token" });

    expect(html).toContain("登录链接缺少必要参数，请重新获取。");
    expect(html).toContain('role="alert"');
  });

  it("renders an error message when the email is invalid", async () => {
    const html = await renderLoginPage({ error: "invalid-email" });

    expect(html).toContain("请输入有效的邮箱地址。");
    expect(html).toContain('role="alert"');
  });
});
