import { test, expect } from '@playwright/test';

test('four British voices play distinct sentences and preserve the choice on refresh', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.Audio = class extends Original {
      constructor(src?: string) {
        super(src); this.muted = true;
        (window as any).__lastAudio = this;
      }
    };
  });
  await page.goto('./');
  const sentences = [
    ['Small steps lead to meaningful progress.', 'George'],
    ['I am learning to express my ideas clearly.', 'Alice'],
    ['Every mistake is a chance to learn.', 'Lily'],
    ['Practice makes a little more possible each day.', 'Daniel'],
  ];
  for (const [i, [text, voice]] of sentences.entries()) {
    await expect(page.getByLabel('音频来源', { exact: true })).toHaveText(`ElevenLabs · ${voice} · 英音`);
    await expect.poll(() => page.evaluate(() => Number((window as any).__lastAudio?.duration) || 0)).toBeGreaterThan(1);
    expect(await page.evaluate(() => (window as any).__lastAudio.src)).toContain(`sample-${i+1}.mp3`);
    if (i === 3) {
      await page.locator('#typing-input').fill('Practice');
      await expect(page.getByText('练习位置已保存', { exact:true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('音频来源', {exact:true})).toHaveText('ElevenLabs · Daniel · 英音');
    } else await page.locator('#typing-input').fill(text);
  }
  await page.getByRole('button', { name: '项目句库', exact: true }).click();
  await page.locator('.project-card').filter({hasText:'Level Up'}).click();
  await expect(page.locator('.catalog-row-actions .quiet')).toHaveCount(20);
  const row = page.locator('.catalog-row').first();
  const label = await row.locator('.quiet').innerText();
  expect(label).toMatch(/ElevenLabs · (Alice|Lily|George|Daniel) · 英音/);
  await page.getByRole('button', {name:'练这 5 条',exact:true}).click();
  await page.getByRole('button', {name:'确认',exact:true}).click();
  await expect(page.getByLabel('音频来源',{exact:true})).toHaveText(label.trim());
  await expect.poll(() => page.evaluate(() => Number((window as any).__lastAudio?.duration) || 0)).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).__lastAudio.src)).toContain('/audio/generated/');
});
