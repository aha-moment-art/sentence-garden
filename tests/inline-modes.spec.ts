import { test, expect } from "@playwright/test";
test("large inline typing colors each key, shows next letter, supports corrections and tablet focus", async ({
  page,
}) => {
  await page.goto("./");
  const input = page.locator("#typing-input");
  await expect(
    page.getByRole("button", { name: "打字", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await input.evaluate((e) => getComputedStyle(e).borderWidth)).toBe(
    "0px",
  );
  expect(await input.evaluate((e) => getComputedStyle(e).opacity)).toBe("0");
  expect(
    await page
      .locator(".inline-sentence")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(40);
  await input.pressSequentially("Sma");
  await expect(page.locator(".target-sentence .typed")).toHaveCount(3);
  await expect(page.locator(".target-sentence .cursor")).toHaveText("l");
  await input.pressSequentially("x");
  await expect(page.locator(".target-sentence .mistyped")).toHaveCount(1);
  await input.press("Backspace");
  await expect(page.locator(".target-sentence .mistyped")).toHaveCount(0);
  const colors = await page
    .locator(".target-sentence")
    .evaluate((e) => [
      getComputedStyle(e.querySelector(".typed")!).color,
      getComputedStyle(e.querySelector(".cursor")!).color,
    ]);
  expect(colors[0]).not.toBe(colors[1]);
  await input.fill("Small" + " ".repeat(40) + "steps");
  await expect(page.locator(".target-sentence .mistyped")).toHaveCount(0);
  await input.fill("Small steps lead to meaningful progress.");
  await expect(page.locator(".target-sentence")).toHaveText(
    "I am learning to express my ideas clearly.",
  );
  await expect(input).toBeFocused();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await input.click();
    await expect(input).toBeFocused();
  }
  await input.pressSequentially("I am");
  await page.reload();
  await expect(input).toHaveValue("I am");
  await expect(page.locator(".target-sentence .typed")).toHaveCount(4);
});
test("dictation hides the original, autoplays and replays real audio without hints, completes the group and restores", async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => {
    const Original = window.Audio;
    (window as any).__audios = [];
    window.Audio = class extends Original {
      constructor(src?: string) {
        super(src);
        this.muted = true;
        (window as any).__audios.push(this);
      }
    };
  });
  await page.goto("./");
  await expect
    .poll(() =>
      page.evaluate(
        () => Number((window as any).__audios?.at(-1)?.duration) || 0,
      ),
    )
    .toBeGreaterThan(1);
  await page.evaluate(() => {
    (window as any).__audios = [];
  });
  await page.getByRole("button", { name: "听写", exact: true }).click();
  await expect(page.locator(".dictation-prompt")).toBeVisible();
  await expect(page.locator(".target-sentence")).toHaveCount(0);
  await expect(page.locator(".sentence-zone")).not.toContainText("Small steps");
  await expect
    .poll(() =>
      page.evaluate(
        () => Number((window as any).__audios.at(-1)?.duration) || 0,
      ),
    )
    .toBeGreaterThan(1);
  await page.locator("#typing-input").press("Alt+r");
  await expect
    .poll(() => page.evaluate(() => (window as any).__audios.length))
    .toBe(2);
  // macOS Option+R may report the registered-trademark character as its key.
  await page
    .locator("#typing-input")
    .dispatchEvent("keydown", { key: "®", code: "KeyR", altKey: true });
  await expect
    .poll(() => page.evaluate(() => (window as any).__audios.length))
    .toBe(3);
  const answers = [
    "Small steps lead to meaningful progress.",
    "I am learning to express my ideas clearly.",
    "Every mistake is a chance to learn.",
    "Practice makes a little more possible each day.",
    "Take your time and enjoy the process.",
  ];
  await page.locator("#typing-input").pressSequentially("Small");
  await expect(page.locator(".typed-sentence .typed")).toHaveCount(5);
  await expect(page.locator(".typed-sentence")).not.toContainText("steps");
  for (let i = 0; i < answers.length; i++) {
    await page.locator("#typing-input").fill(answers[i]);
    await expect
      .poll(
        async () =>
          (await page.locator(".result-card").count()) > 0 ||
          (await page.locator("#typing-input").inputValue()) === "",
      )
      .toBe(true);
  }
  await expect(page.locator(".result-card")).toBeVisible();
  await expect(page.locator(".result-stats>div").nth(0)).toContainText("5/5");
  await expect(page.locator(".result-stats>div").nth(1)).toContainText("0");
  const downloaded = page.waitForEvent("download");
  await page
    .locator("footer")
    .getByRole("button", { name: "导出记录" })
    .click();
  const stream = await (await downloaded).createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const buffer = Buffer.concat(chunks),
    data = JSON.parse(buffer.toString());
  expect(data.session.mode).toBe("dictation");
  expect(data.session.tasks).toHaveLength(5);
  expect(
    Object.values(data.session.results).every((r: any) => !r.help && !r.error),
  ).toBe(true);
  const context = await browser.newContext(),
    restored = await context.newPage();
  await restored.goto(new URL("./", page.url()).toString());
  await restored.locator("input[type=file]").setInputFiles({
    name: "records.json",
    mimeType: "application/json",
    buffer,
  });
  await restored.getByRole("button", { name: "确认替换并恢复" }).click();
  await expect(
    restored.getByRole("button", { name: "听写", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await restored.reload();
  await expect(restored.locator(".result-card")).toBeVisible();
  await context.close();
});
