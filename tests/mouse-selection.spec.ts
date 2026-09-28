import {test, expect, type Page} from '@playwright/test';

async function point(page: Page, index: number, side: 'left' | 'right' = 'left') {
  const rect = await page.locator(`.inline-sentence [data-position="${index}"]`).boundingBox();
  if (!rect) throw new Error('Visible letter missing');
  return {x: side === 'left' ? rect.x + 1 : rect.x + rect.width - 1, y: rect.y + rect.height / 2};
}
async function dragBetween(page: Page, start: number, end: number) {
  const a = await point(page, start), b = await point(page, end);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, {steps: 12});
  await page.mouse.up();
}
async function selection(page: Page) {
  return page.locator('#typing-input').evaluate((el: HTMLTextAreaElement) => ({
    start: el.selectionStart, end: el.selectionEnd,
    text: el.value.slice(el.selectionStart, el.selectionEnd), direction: el.selectionDirection,
  }));
}
for (const mode of ['打字', '听写']) {
  test(`${mode}: mouse positions cursor, drags both ways, replaces selection and selects words`, async ({page}) => {
    await page.goto('./');
    if (mode === '听写') await page.getByRole('button', {name: mode, exact: true}).click();
    const input = page.locator('#typing-input');
    await input.fill('Small steps lead');
    const at = await point(page, 3);
    await page.mouse.click(at.x, at.y);
    expect((await selection(page)).start).toBe(3);
    await dragBetween(page, 0, 5);
    expect((await selection(page)).text).toBe('Small');
    await expect(page.locator('.selected-letter')).toHaveCount(5);
    await page.keyboard.type('Tiny');
    await expect(input).toHaveValue('Tiny steps lead');
    await input.fill('Small steps lead');
    await dragBetween(page, 11, 6);
    expect((await selection(page)).text).toBe('steps');
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue('Small  lead');
    await input.fill('Small steps lead');
    const word = await point(page, 8);
    await page.mouse.dblclick(word.x, word.y);
    expect((await selection(page)).text).toBe('steps');
  });
}
test('mouse selection follows wrapped lines at phone and tablet widths, including Shift-click', async ({page}) => {
  await page.goto('./');
  const input = page.locator('#typing-input');
  await input.fill('Small steps lead to meaningful');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({width, height: 1100});
    await input.scrollIntoViewIfNeeded();
    await dragBetween(page, 0, 24);
    expect((await selection(page)).text).toBe('Small steps lead to mean');
    const a = await point(page, 6), b = await point(page, 16);
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    expect((await selection(page)).text).toBe('steps lead');
  }
});
test('copy-mode mouse positions preserve every typed space', async ({page}) => {
  await page.goto('./');
  await page.locator('#typing-input').fill('Small   steps lead');
  await dragBetween(page, 8, 13);
  expect((await selection(page)).text).toBe('steps');
});

test('mouse selects overflow letters for deletion', async ({page}) => {
  await page.goto('./');
  const input = page.locator('#typing-input');
  await input.fill('Small steps lead to meaningful progress extra');
  const letters = page.locator('.letter.extra-input');
  const first = await letters.first().boundingBox(), last = await letters.last().boundingBox();
  if (!first || !last) throw new Error('Overflow missing');
  await page.mouse.move(first.x + 1, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, {steps: 10});
  await page.mouse.up();
  expect((await selection(page)).text).toContain('extra');
  await expect(page.locator('.extra-input.selected-letter')).toHaveCount(await letters.count());
  await expect(page.locator('.target-sentence > .selected-letter:not(.extra-input)')).toHaveCount(0);
});
