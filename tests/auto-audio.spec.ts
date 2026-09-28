import { test, expect } from "@playwright/test";
test("typing plays each sentence once automatically and stops the previous recording", async ({
  page,
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
  await page.goto("./", {waitUntil:'domcontentloaded'});
  await expect
    .poll(() =>
      page.evaluate(
        () => Number((window as any).__audios.at(-1)?.duration) || 0,
      ),
    )
    .toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).__audios[0].src)).toContain(
    "sample-1.mp3",
  );
  await page.locator("#typing-input").pressSequentially("Small");
  expect(await page.evaluate(() => (window as any).__audios.length)).toBe(1);
  await page
    .locator("#typing-input")
    .fill("Small steps lead to meaningful progress.");
  await expect
    .poll(() => page.evaluate(() => (window as any).__audios.at(-1)?.src ?? ""))
    .toContain("sample-2.mp3");
  expect(await page.evaluate(() => (window as any).__audios[0].paused)).toBe(
    true,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => Number((window as any).__audios.at(-1)?.duration) || 0,
      ),
    )
    .toBeGreaterThan(1);
  await page
    .locator("#typing-input")
    .fill("I am learning to express my ideas clearly.");
  await expect
    .poll(() => page.evaluate(() => (window as any).__audios.at(-1)?.src ?? ""))
    .toContain("sample-3.mp3");
  expect(await page.evaluate(() => (window as any).__audios.length)).toBe(3);
  await page.getByRole("button", { name: "我的句库", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).__audios.at(-1).paused),
  ).toBe(true);
});
test("blocked first autoplay resumes from a real typing gesture", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Audio;
    (window as any).__attempts = 0;
    window.Audio = class extends Original {
      constructor(src?: string) {
        super(src);
        this.muted = true;
        (window as any).__last = this;
      }
      play() {
        if (++(window as any).__attempts === 1)
          return Promise.reject(
            new DOMException("Needs gesture", "NotAllowedError"),
          );
        return super.play();
      }
    };
  });
  await page.goto("./", {waitUntil:'domcontentloaded'});
  await expect(page.getByRole("status")).toContainText("点击句子或开始打字");
  await page.locator("#typing-input").pressSequentially("S");
  await expect
    .poll(() =>
      page.evaluate(() => Number((window as any).__last?.duration) || 0),
    )
    .toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).__attempts)).toBe(2);
});
