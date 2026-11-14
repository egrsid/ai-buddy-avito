import { expect, test } from '@playwright/test';

// Чат как в веб-LLM: левая панель и поле ввода на месте, листается только лента,
// подсказка уходит в чат сразу, после ответа лента прокручена к последнему сообщению.
test('чат: подсказка сразу в чат, ввод внизу, страница не прыгает', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/chat');
  await expect(page.getByRole('heading', { name: 'AI-помощник', exact: true })).toBeVisible();

  const input = page.getByLabel('Сообщение AI-помощнику');
  const inputBox = async () => (await input.boundingBox())!;
  // Поле ввода прижато к низу окна, сама страница не прокручивается.
  expect((await inputBox()).y + (await inputBox()).height).toBeGreaterThan(800 - 120);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBeTruthy();

  const before = await page.getByLabel('Переписка').locator('[data-chat-message]').count();
  await page.getByRole('button', { name: 'Что мне делать дальше?' }).click();
  await expect(page.getByLabel('Переписка').getByText('Что мне делать дальше?').last()).toBeVisible();
  // Ответ модели пришёл и сохранён: в ленте стало на два элемента больше.
  await expect.poll(async () => page.getByLabel('Переписка').locator('[data-chat-message]').count(), { timeout: 90_000 }).toBeGreaterThanOrEqual(before + 2);
  await expect(page.getByRole('button', { name: 'Остановить генерацию' })).toHaveCount(0, { timeout: 90_000 });
  // Ответ не пропадает после окончания потока: последним в ленте стоит ответ, а не вопрос.
  const last = page.getByLabel('Переписка').locator(':scope > *').last();
  await expect(last).not.toContainText('Что мне делать дальше?', { timeout: 15_000 });
  await expect(last).toContainText(/\S{3,}/);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await inputBox()).y + (await inputBox()).height).toBeGreaterThan(800 - 120);
  const atBottom = await page.getByLabel('Переписка').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 8);
  expect(atBottom).toBeTruthy();
  // Левая панель на месте.
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('chat-layout.png') });
});
