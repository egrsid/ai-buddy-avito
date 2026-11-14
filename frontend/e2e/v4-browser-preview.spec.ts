import { expect, test } from '@playwright/test';
test('product has no fixture controls or prototype route', async ({ page }) => {
  await page.goto('/#/v4-preview');
  await expect(page.getByRole('heading', { name: 'Задания и цели', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fixtures', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /прототип/ })).toHaveCount(0);
  await expect(page.getByText('Синтетические примеры', { exact: false })).toHaveCount(0);
});
