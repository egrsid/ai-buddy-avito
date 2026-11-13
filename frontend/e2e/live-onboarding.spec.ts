import { expect, test } from '@playwright/test';

test('live launch restores the server session after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Учебный стенд', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fixtures', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Моя цель', exact: true })).toBeVisible();
  const before = (await page.context().cookies()).find(c => c.name === 'buddy_session');
  expect(before).toBeDefined();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Моя цель', exact: true })).toBeVisible();
  const after = (await page.context().cookies()).find(c => c.name === 'buddy_session');
  expect(after?.value).toBe(before?.value);
  await expect(page.getByText('Сессия истекла. Войдите заново.')).toHaveCount(0);
});
