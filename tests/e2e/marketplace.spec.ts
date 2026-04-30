import { expect, test } from "@playwright/test";

test("homepage links to marketplace and creator login path", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "发现、检查并下载可导入 Hermes-agent 的智能体包" })).toBeVisible();
  await expect(page.getByRole("link", { name: "浏览智能体" })).toHaveAttribute("href", "/agents");
  await expect(page.getByRole("link", { name: "上传智能体" })).toHaveAttribute("href", "/creator");
});
