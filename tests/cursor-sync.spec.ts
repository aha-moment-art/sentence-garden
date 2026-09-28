import {test, expect} from '@playwright/test';

test('continuous typing paints the exact input by the first frame and uses a visible native caret', async ({page}) => {
  await page.addInitScript(() => {
    (window as any).__frames = [];
    document.addEventListener('input', event => {
      const el = event.target as HTMLTextAreaElement;
      if (el.id !== 'typing-input') return;
      const value = el.value, caret = el.selectionStart;
      requestAnimationFrame(() => {
        const painted = [...document.querySelectorAll('.letter[data-input-offset]')].map(c => c.textContent).join('');
        (window as any).__frames.push({value, painted, caret, actualCaret: el.selectionStart});
      });
    });
  });
  await page.goto('./');
  const input = page.locator('#typing-input');
  // Includes ordinary continuous input, mistakes, punctuation and repeated spaces.
  const value = "Small  stxps, don't jump across the screen";
  await input.pressSequentially(value, {delay: 25});
  await expect(input).toHaveValue(value);
  const frames = await page.evaluate(() => (window as any).__frames);
  expect(frames.length).toBe(value.length);
  expect(frames.every((f: any) => f.value === f.painted && f.caret === f.actualCaret)).toBe(true);
  expect(await input.evaluate(el => getComputedStyle(el).caretColor)).toBe('rgb(29, 95, 165)');
  expect(await input.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await expect(page.locator('.inline-caret')).toHaveCount(0);
});

test('native hit testing stays aligned after wrapping, punctuation, and enlarged text', async ({page}) => {
  await page.goto('./');
  const input = page.locator('#typing-input');
  const value = "Small  stxps, don't lose the cursor position";
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({width, height: 1100});
    await input.fill(value);
    const styles = await page.locator('.typing-editor').evaluate(el => {
      const text = el.querySelector('p')!, input = el.querySelector('textarea')!;
      const keys = ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','wordBreak','whiteSpace'] as const;
      return [text, input].map(node => Object.fromEntries(keys.map(k => [k, getComputedStyle(node)[k]])));
    });
    expect(styles[0]).toEqual(styles[1]);
    for (const index of [0, 7, 15, 25, 35]) {
      const letter = page.locator(`.letter[data-position="${index}"]`);
      await letter.scrollIntoViewIfNeeded();
      const r = (await letter.boundingBox())!;
      await page.mouse.click(r.x + 1, r.y + r.height / 2);
      expect(await input.evaluate(el => (el as HTMLTextAreaElement).selectionStart)).toBe(index);
    }
  }
  await page.evaluate(() => document.documentElement.style.fontSize = '24px');
  await input.fill(value);
  const r = (await page.locator('.letter[data-position="20"]').boundingBox())!;
  await page.mouse.click(r.x + 1, r.y + r.height / 2);
  await page.keyboard.type('Z');
  await expect(input).toHaveValue(value.slice(0, 20) + 'Z' + value.slice(20));
});
