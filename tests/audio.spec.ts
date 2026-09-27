import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("real ElevenLabs MP3 decodes, audio pack persists, and export retains it", async ({
  page,
}) => {
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
  const response = page.waitForResponse((r) =>
    r.url().includes("/audio/sample-1.mp3"),
  );
  await page.goto("/");
  await expect(page.locator("#typing-input")).toBeVisible();
  expect((await response).ok()).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => Number((window as any).__lastAudio?.duration) || 0),
    )
    .toBeGreaterThan(1);
  await page.getByRole("button", { name: "停止", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__lastAudio.paused)).toBe(
    true,
  );
  const bytes = await readFile(
    new URL("../public/audio/sample-1.mp3", import.meta.url),
  );
  const clip = {
    text: "Small steps lead to meaningful progress.",
    audio: `data:audio/mpeg;base64,${bytes.toString("base64")}`,
  };
  const pack = {
    format: "sentence-garden-audio",
    version: 1,
    voice: "George · British English",
    clips: [clip],
  };
  await page.locator("#typing-input").fill("Small steps");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "audio-pack.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(pack)),
    });
  await expect(
    page.getByRole("heading", { name: "导入句子音频" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认导入音频" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 条音频");
  await expect(page.locator("#typing-input")).toHaveValue("Small steps");
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastAudio?.src ?? ""))
    .toMatch(/^data:audio\/mpeg/);
  const downloaded = page.waitForEvent("download");
  await page
    .locator("footer")
    .getByRole("button", { name: "导出记录" })
    .click();
  const stream = await (await downloaded).createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).audioClips).toEqual([
    clip,
  ]);
});
