import { test, expect } from "@playwright/test";
test("automatic typing waits for complete correct input, honours composition, pauses off page and never skips", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "把句子敲熟，把表达记住。" }),
  ).toBeVisible();
  const input = page.locator("#typing-input");
  await input.fill("Small steps lead to meaningful");
  await page.waitForTimeout(550);
  await expect(page.locator(".target-sentence")).toHaveText(
    "Small steps lead to meaningful progress.",
  );
  await input.fill("Small steps lead to meaningless progress.");
  await input.press("Enter");
  await expect(page.locator(".error-feedback")).toBeVisible();
  await page.waitForTimeout(550);
  await expect(input).toHaveValue("Small steps lead to meaningless progress.");
  await input.dispatchEvent("compositionstart");
  await input.fill("Small steps lead to meaningful progress.");
  await page.waitForTimeout(550);
  await expect(input).toBeEnabled();
  await input.dispatchEvent("compositionend");
  await expect(page.locator(".success-feedback")).toBeVisible();
  await page.getByRole("button", { name: "练习设置" }).click();
  await page.waitForTimeout(550);
  await expect(page.locator(".target-sentence")).toHaveText(
    "Small steps lead to meaningful progress.",
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await expect(page.locator(".target-sentence")).toHaveText(
    "I am learning to express my ideas clearly.",
  );
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await page.waitForTimeout(550);
  await expect(page.locator(".target-sentence")).toHaveText(
    "I am learning to express my ideas clearly.",
  );
});
test("default mechanical keys produce real audio, mute persists and missing Web Audio never blocks typing", async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    (window as any).__keys = { peak: 0, starts: 0, running: false };
    window.AudioContext = class extends Original {
      constructor() {
        super();
        const analyser = this.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(this.destination);
        const buffer = new Float32Array(256);
        setInterval(() => {
          analyser.getFloatTimeDomainData(buffer);
          const stats = (window as any).__keys;
          stats.peak = Math.max(stats.peak, ...buffer.map(Math.abs));
          stats.running = this.state === "running";
        }, 5);
        const originalGain = this.createGain.bind(this);
        this.createGain = () => {
          const node = originalGain(),
            connect = node.connect.bind(node);
          node.connect = ((target: any, ...args: any[]) =>
            target === this.destination
              ? connect(analyser)
              : connect(target, ...(args as []))) as typeof node.connect;
          return node;
        };
        const originalSource = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          (window as any).__keys.starts++;
          return originalSource();
        };
      }
    };
  });
  await page.goto("./");
  await page
    .locator("#typing-input")
    .pressSequentially("Small", { delay: 100 });
  await expect
    .poll(() => page.evaluate(() => (window as any).__keys.peak))
    .toBeGreaterThan(0.005);
  expect(await page.evaluate(() => (window as any).__keys.running)).toBe(true);
  expect(await page.evaluate(() => (window as any).__keys.starts)).toBe(10);
  await page.getByRole("button", { name: "练习设置" }).click();
  await page.getByLabel("机械键盘声").uncheck();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.locator("#typing-input").pressSequentially(" steps");
  expect(await page.evaluate(() => (window as any).__keys.starts)).toBe(10);
  await page.reload();
  await page.getByRole("button", { name: "练习设置" }).click();
  await expect(page.getByLabel("机械键盘声")).not.toBeChecked();
  const context = await browser.newContext();
  await context.addInitScript(() =>
    Object.defineProperty(window, "AudioContext", { value: undefined }),
  );
  const silent = await context.newPage();
  await silent.goto(new URL("./", page.url()).toString());
  await silent
    .locator("#typing-input")
    .fill("Small steps lead to meaningful progress.");
  await expect(silent.locator(".target-sentence")).toHaveText(
    "I am learning to express my ideas clearly.",
  );
  await context.close();
});
