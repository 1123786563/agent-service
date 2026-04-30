import { describe, expect, it } from "vitest";
import { getLoginStatusMessage } from "@/server/auth/magic-link";

describe("login page feedback", () => {
  it("shows the sent state when the login link request succeeds", () => {
    expect(getLoginStatusMessage("sent")).toBe("登录链接已发送，请检查邮箱。");
  });

  it("maps recognized auth errors into user-visible messages", () => {
    expect(getLoginStatusMessage("invalid-email")).toBe("请输入有效的邮箱地址。");
    expect(getLoginStatusMessage("invalid-token")).toBe("登录链接无效或已过期，请重新获取。");
    expect(getLoginStatusMessage("missing-token")).toBe("登录链接缺少必要参数，请重新获取。");
  });

  it("keeps login feedback copy distinct from internal auth error messages", () => {
    expect(getLoginStatusMessage("invalid-token")).not.toBe("Login link is invalid or expired");
  });
});
