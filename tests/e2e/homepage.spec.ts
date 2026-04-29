import { expect, test } from "@playwright/test";

test("homepage renders the scaffold hero", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "发现、检查并下载可导入 Hermes-agent 的智能体包" })
  ).toBeVisible();
});
