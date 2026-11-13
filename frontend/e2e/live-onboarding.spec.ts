import { expect, test } from '@playwright/test';

let backendReady = false;

test.beforeAll(async ({ request }) => {
  try {
    const health = await request.get('http://127.0.0.1:8080/readyz');
    backendReady = health.ok();
  } catch {
    backendReady = false;
  }
});

test('live API показывает цель intern-a', async ({ page }) => {
  test.skip(!backendReady, 'Сначала поднимите make demo: Go /readyz должен отвечать ok');
  await page.goto('/');
  await page.getByRole('button', { name: 'Live API' }).click();
  await expect(page.getByRole('heading', { name: 'Моя цель' })).toBeVisible();
  const start = page.getByRole('button', { name: 'Начать' });
  if (await start.count()) {
    await start.first().click();
  }
  await expect(page.getByText('db-access-team-a')).toBeVisible();
});
