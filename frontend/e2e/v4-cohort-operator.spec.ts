import { test, expect } from '@playwright/test';

// Opt-in only: this scenario needs the dedicated synthetic-clock operator project.
// It reads real API data; it never intercepts responses or seeds timestamps in SQL.
if (process.env.E2E_COHORT_DATASET === '1') {
  test('synthetic cohort history is explicit and real Go comparison renders 60%, 20%, -40pp', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Демо-аккаунт').selectOption('buddy-a');
    await page.getByRole('link', { name: 'Улучшение заданий', exact: true }).click();
    await expect(page.getByText('Синтетическая история · тестовые часы')).toBeVisible();
    await page
      .getByLabel('Отчёт о неясности')
      .selectOption({ label: 'Synthetic: сравнение двух версий задания · Формат · v1' });
    await page.getByRole('button', { name: 'Загрузить сравнение' }).click();
    await expect(page.getByText('Версия 1: 6 из 10, 60.0%')).toBeVisible();
    await expect(page.getByText('Версия 2: 2 из 10, 20.0%')).toBeVisible();
    await expect(page.getByText('Разница: -40.0 п.п.')).toBeVisible();
    await expect(page.getByText(/Синтетическая история на тестовых часах/)).toBeVisible();
    await page.screenshot({ path: '/tmp/v4-cohort-comparison.png', fullPage: true });
    await page.getByRole('link', { name: 'Статистика', exact: true }).click();
    await page.getByRole('tab', { name: 'Понятность моих ТЗ' }).click();
    await expect(page.getByRole('heading', { name: 'Статистика затруднений' })).toBeVisible();
    await expect(page.getByText('outcome_unclear', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: '/tmp/v4-cohort-statistics.png', fullPage: true });
    await page.getByLabel('Дополнительные участники').check();
    await expect(page.getByLabel('Демо-аккаунт').locator('option[value^="cohort-"]')).toHaveCount(20);
  });
}
