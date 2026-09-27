import { test, expect } from "@playwright/test";
test("four projects load on demand, paginate, preserve recordings through practice and restore", async ({
  page,
  browser,
}) => {
  const loaded: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (/library\/.*json/.test(r.url())) loaded.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#typing-input")).toBeVisible();
  expect(loaded).toHaveLength(0);
  await page.getByRole("button", { name: "项目句库", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(4);
  expect([...new Set(loaded)]).toHaveLength(1);
  await page
    .locator(".project-card")
    .filter({ hasText: "British Ear" })
    .click();
  await expect(page.locator(".catalog-row")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".catalog-row .number").first()).toHaveText("21");
  await page.getByLabel("项目分类").selectOption("british-ear-pmqs");
  await expect(page.locator(".catalog-start")).toContainText("603");
  await page.locator(".project-card").filter({ hasText: "WordLeap" }).click();
  await page.getByLabel("项目分类").selectOption("wordleap-tem-8");
  await expect(page.locator(".catalog-start")).toContainText("9,983");
  await page.getByLabel("搜索项目内容").fill("abandon");
  await expect(page.locator(".catalog-row").first()).toContainText(/abandon/i);
  await page.locator(".project-card").filter({ hasText: "Level Up" }).click();
  await expect(page.locator(".catalog-info")).toContainText("例句没有独立配音");
  await expect(page.locator(".catalog-row-actions .quiet")).toHaveCount(0);
  await expect(page.locator(".catalog-tracks audio")).toHaveCount(2);
  await page.getByRole("button", { name: "词汇练习", exact: true }).click();
  await expect(
    page
      .locator(".catalog-row")
      .first()
      .getByRole("button", { name: "词条英音" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".catalog-row")
      .first()
      .getByRole("button", { name: "词条美音" }),
  ).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".project-card").filter({ hasText: "BritSpeak" }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(6);
  const sentence = await page
    .locator(".catalog-row-body>p[lang=en]")
    .first()
    .innerText();
  await page.getByRole("button", { name: "练这 5 条" }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.locator(".target-sentence")).toHaveText(sentence);
  await expect(
    page.getByRole("button", { name: "朗读", exact: true }),
  ).toBeEnabled();
  await page.locator("#typing-input").fill(sentence.slice(0, 6));
  await expect(page.getByText("练习位置已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#typing-input")).toHaveValue(sentence.slice(0, 6));
  const downloaded = page.waitForEvent("download");
  await page
    .locator("footer")
    .getByRole("button", { name: "导出记录" })
    .click();
  const stream = await (await downloaded).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const buffer = Buffer.concat(chunks),
    data = JSON.parse(buffer.toString());
  expect(data.decks).toHaveLength(2);
  expect(data.decks[1].sentences).toHaveLength(5);
  expect(data.decks[1].sentences[0].recordings[0].url).toContain("/BritSpeak/");
  const context = await browser.newContext();
  const restored = await context.newPage();
  await restored.goto(new URL("./", page.url()).toString());
  await expect(restored.locator("#typing-input")).toBeVisible();
  await restored
    .locator("input[type=file]")
    .setInputFiles({
      name: "records.json",
      mimeType: "application/json",
      buffer,
    });
  await restored.getByRole("button", { name: "确认替换并恢复" }).click();
  await expect(restored.locator(".target-sentence")).toHaveText(sentence);
  await expect(
    restored.getByRole("button", { name: "朗读", exact: true }),
  ).toBeEnabled();
  await context.close();
  expect(errors).toEqual([]);
});
test("original audio from every source and both word accents decodes in browser", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.Audio = class extends Original {
      constructor(src?: string) {
        super(src);
        this.muted = true;
        (window as any).__lastAudio = this;
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "项目句库", exact: true }).click();
  for (const [name, voice] of [
    ["British Ear", "真人英音"],
    ["WordLeap", "例句英音"],
    ["BritSpeak", "真人原声"],
    ["Level Up", "词条英音"],
  ]) {
    await page.locator(".project-card").filter({ hasText: name }).click();
    await expect(page.locator(".catalog-row").first()).toBeVisible();
    if (name === "Level Up")
      await page.getByRole("button", { name: "词汇练习", exact: true }).click();
    await page
      .locator(".catalog-row")
      .first()
      .getByRole("button", { name: voice })
      .click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => Number((window as any).__lastAudio?.duration) || 0,
          ),
        { timeout: 25000 },
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => (window as any).__lastAudio.error),
    ).toBeNull();
  }
  await page
    .locator(".catalog-row")
    .first()
    .getByRole("button", { name: "词条美音" })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() => Number((window as any).__lastAudio?.duration) || 0),
      { timeout: 25000 },
    )
    .toBeGreaterThan(0);
  await page
    .locator(".catalog-tracks audio")
    .first()
    .evaluate((a: HTMLAudioElement) => {
      a.muted = true;
      a.load();
    });
  await expect
    .poll(
      () =>
        page
          .locator(".catalog-tracks audio")
          .first()
          .evaluate((a: HTMLAudioElement) => Number(a.duration) || 0),
      { timeout: 25000 },
    )
    .toBeGreaterThan(20);
});
