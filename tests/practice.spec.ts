import { test, expect, type Page } from "@playwright/test";
async function submit(page: Page, text: string) {
  await page.locator("#typing-input").fill(text);
  await page.locator("#typing-input").press("Enter");
  await expect(page.locator(".success-feedback")).toBeVisible();
  await expect(page.locator(".typing-actions>.primary")).toBeFocused();
  await page.locator(".typing-actions>.primary").press("Enter");
}
async function importOwn(page: Page) {
  await page.getByRole("button", { name: "导入我的句子" }).click();
  await page.getByLabel("句组名称").fill("日常表达");
  await page
    .getByLabel("英语句子", { exact: true })
    .fill(
      "Practice makes progress.\t练习带来进步。\nEvery day is a new chance.\t每一天都是新的机会。",
    );
  await page.getByRole("button", { name: "预览句子" }).click();
  await expect(page.locator(".preview-row")).toHaveCount(2);
  await page.getByRole("button", { name: "确认导入" }).click();
  await page
    .locator(".library-heading")
    .getByRole("button", { name: "开始练习" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "句库" }).locator("option:checked"),
  ).toHaveText("日常表达 · 2 句");
  await page.getByRole("button", { name: "开始这一组" }).click();
  await expect(page.locator(".target-sentence")).toHaveText(
    "Practice makes progress.",
  );
}
test("complete group, correction, hints, retry, review and portable records", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await importOwn(page);
  await page.locator("#typing-input").fill("Practice makes");
  await page.locator("#typing-input").press("Enter");
  await expect(page.locator(".diff.missing")).toHaveText("漏：progress");
  await expect(page.locator("#typing-input")).toHaveValue("Practice makes");
  await submit(page, "Practice makes progress.");
  await submit(page, "Every day is a new chance.");
  await expect(page.locator(".pill")).toHaveText("关键词填空");
  await expect(page.locator(".blank")).toHaveCount(1);
  await submit(page, "Practice");
  await submit(page, "Every chance");
  await expect(page.locator(".pill")).toHaveText("整句默写");
  await expect(page.locator(".target-sentence")).toHaveCount(0);
  await page.getByRole("button", { name: "给我一点提示" }).click();
  await expect(page.locator(".hint-box")).toContainText("P");
  await page.getByRole("button", { name: "提示完整词" }).click();
  await expect(page.locator(".hint-box")).toContainText("Practice");
  await page.getByRole("button", { name: "查看原句" }).click();
  await expect(page.locator(".hint-box")).toContainText(
    "Practice makes progress.",
  );
  await submit(page, "practice makes progress");
  await submit(page, "every day is a new chance");
  await expect(page.locator(".pill")).toHaveText("错句再试");
  await submit(page, "practice makes progress");
  await expect(page.locator(".result-card")).toBeVisible();
  await expect(page.locator(".result-stats>div").nth(0)).toContainText("1/2");
  await expect(page.locator(".result-stats>div").nth(1)).toContainText("1");
  await expect(page.locator(".result-stats>div").nth(2)).toContainText("0");
  await page.getByRole("button", { name: "看看复习安排" }).click();
  await expect(page.locator(".review-page .sentence-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "开始复习", exact: true }),
  ).toBeDisabled();
  const downloaded = page.waitForEvent("download");
  await page
    .locator("footer")
    .getByRole("button", { name: "导出记录" })
    .click();
  const download = await downloaded,
    stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const buffer = Buffer.concat(chunks),
    data = JSON.parse(buffer.toString());
  expect(data.version).toBe(1);
  expect(data.history).toHaveLength(1);
  expect(
    Object.values(data.reviews).every(
      (r: any) => r.step === 0 && !r.needsReview,
    ),
  ).toBe(true);
  const context = await browser.newContext();
  const restored = await context.newPage();
  await restored.goto(new URL("./", page.url()).toString());
  await restored.locator("#typing-input").waitFor();
  await restored
    .locator("input[type=file]")
    .setInputFiles({
      name: "records.json",
      mimeType: "application/json",
      buffer,
    });
  await expect(
    restored.getByRole("heading", { name: "恢复之前的练习记录" }),
  ).toBeVisible();
  await expect(restored.locator(".result-card")).toHaveCount(0);
  await restored.getByRole("button", { name: "确认替换并恢复" }).click();
  await expect(restored.locator(".result-card")).toBeVisible();
  await restored.reload();
  await expect(restored.locator(".result-card")).toBeVisible();
  await context.close();
  expect(errors).toEqual([]);
});
test("keeps input after refresh and allows sentence editing and deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#typing-input").fill("Small steps");
  await expect(page.getByText("练习位置已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#typing-input")).toHaveValue("Small steps");
  await page.getByRole("button", { name: "我的句库", exact: true }).click();
  await page.locator(".sentence-edit").first().click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page
    .getByRole("textbox", { name: "英文", exact: true })
    .fill("Keep learning every day.");
  await page
    .getByRole("textbox", { name: "中文提示（可选）", exact: true })
    .fill("每天坚持学习。");
  await page.getByRole("button", { name: "保存句子" }).click();
  await expect(page.locator(".sentence-edit").first()).toContainText(
    "Keep learning every day.",
  );
  await page.getByRole("button", { name: "删除第 1 句", exact: true }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.locator(".sentence-row")).toHaveCount(4);
});
test("strict mode and unavailable speech have usable fallbacks", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "speechSynthesis", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  // A browser without Web Speech must never prevent typing.
  await expect(page.locator("#typing-input")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "朗读", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "练习设置" }).click();
  await page.getByLabel("严格核对").check();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "换一组句子" }).click();
  await page.getByLabel("直接挑战默写").check();
  await page.getByRole("button", { name: "开始这一组" }).click();
  await page
    .locator("#typing-input")
    .fill("small steps lead to meaningful progress");
  await page.locator("#typing-input").press("Enter");
  await expect(page.locator(".error-feedback")).toBeVisible();
  await submit(page, "Small steps lead to meaningful progress.");
});
test("rejects malformed imports without replacing records", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#typing-input").fill("Small");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole("status")).toContainText("文件格式不正确");
  await expect(page.locator("#typing-input")).toHaveValue("Small");
});
test("responsive layout on phone, iPad, and enlarged text", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#typing-input")).toBeVisible();
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("button", { name: "核对" })).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".primary")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});
