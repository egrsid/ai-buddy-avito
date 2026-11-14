import { test, expect, type Page } from '@playwright/test';
async function account(p: Page, id: string) {
  if (!(await p.getByLabel('Демо-аккаунт').locator(`option[value="${id}"]`).count()))
    await p.getByLabel('Дополнительные участники').check();
  await p.getByLabel('Демо-аккаунт').selectOption(id);
  await expect
    .poll(async () => {
      const r = await p.request.get('/api/v2/auth/me');
      return r.ok() ? (await r.json()).user.account_id : null;
    })
    .toBe(id);
}
test('real v4 workspace and safe AI revision to human-published successor', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/');
  await account(page, 'buddy-a');
  await page.getByRole('link', { name: 'Мои задания', exact: true }).click();
  await page.getByRole('button', { name: /Новое ТЗ/ }).click();
  const title = `V4 review ${Date.now()}`;
  await page.getByLabel('Название', { exact: true }).fill(title);
  await page.getByLabel('Цель задания').fill('Описать результаты проверок');
  await page.getByLabel('Заголовок раздела').fill('Формат');
  await page.getByLabel('Текст раздела').fill('Опишите результат в свободной форме.');
  await page.getByLabel('Ожидаемый результат').fill('Отчёт');
  await page.getByLabel('Критерий 1', { exact: true }).fill('Перечислены результаты проверок');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await page.getByRole('button', { name: /Опубликовать версию 1/ }).click();
  for (const id of ['intern-a', 'intern-b']) {
    await page.getByLabel('Кому назначить').selectOption({ label: id });
    await page.getByRole('button', { name: 'Назначить', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(`Назначено: ${id}`);
  }
  await page.getByRole('link', { name: 'Улучшение заданий', exact: true }).click();
  const assignmentsPanel = page.locator('details').first();
  await expect(assignmentsPanel.locator('summary')).not.toContainText('(0)');
  if (!(await assignmentsPanel.evaluate((node) => (node as HTMLDetailsElement).open)))
    await assignmentsPanel.locator('summary').click();
  const assign = page.locator('li').filter({ hasText: title }).filter({ hasText: 'intern-a' });
  await assign.getByLabel('Для этого назначения нужен доступ к БД команды A').check();
  await assign.getByRole('button', { name: 'Добавить цель доступа к БД' }).click();
  await expect(page.getByRole('status')).toContainText('Цель доступа к БД добавлена');
  await account(page, 'intern-a');
  await page.getByRole('link', { name: 'Задания и цели', exact: true }).click();
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await card.getByRole('button', { name: 'Связать с технической целью' }).click();
  await page.getByRole('button', { name: 'Подтвердить связь', exact: true }).click();
  await card.getByRole('button', { name: 'Подзадачи и доказательства' }).click();
  await expect(card.getByText('Почему такой статус?')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card.getByText('Почему такой статус?')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy();
  const collapse = card.getByRole('button', { name: 'Подзадачи и доказательства' });
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const id of ['intern-a', 'intern-b']) {
    await account(page, id);
    await page.getByRole('link', { name: 'ТЗ от наставника', exact: true }).click();
    await page.getByRole('link', { name: new RegExp(title) }).click();
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Формат', exact: true }),
    });
    await section.getByRole('button', { name: 'Непонятно', exact: true }).click();
    await section.getByLabel('Неясен результат').check();
    await section.getByRole('button', { name: 'Отметить', exact: true }).click();
    await expect(section.getByRole('status')).toBeVisible();
  }
  await account(page, 'buddy-a');
  await page.getByRole('link', { name: 'Улучшение заданий', exact: true }).click();
  const reportSelect = page.getByLabel('Отчёт о неясности');
  await reportSelect.selectOption({ label: `${title} · Формат · v1` });
  await page
    .getByLabel('Уточнение автора (для новой генерации)')
    .fill('Отчёт должен содержать нумерованный список выполненных проверок и их результаты.');
  await page.getByRole('button', { name: 'Предложить уточнение', exact: true }).click();
  // Offline шаблон отвечает сразу, живая модель — за секунды; Go ждёт генерацию до 90 с.
  await expect(page.getByRole('heading', { name: 'Предложение: Готово к проверке' })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('checkbox', { name: /Было:.*Предлагается:/ }).first().check();
  await page.getByRole('button', { name: 'Применить в черновик', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('сохранены в черновик');
  await page.getByRole('link', { name: 'Открыть редактор ТЗ' }).click();
  await page.getByRole('button', { name: /Опубликовать версию 2/ }).click();
  await expect(page.getByText('Опубликованная версия 2')).toBeVisible();
  await page.getByRole('link', { name: 'Улучшение заданий', exact: true }).click();
  await reportSelect.selectOption({ label: `${title} · Формат · v1` });
  await page.getByRole('checkbox', { name: /Смысл выбранного раздела/ }).check();
  await page.getByRole('button', { name: 'Настроить сравнение' }).click();
  await expect(page.getByText('Недостаточно данных', { exact: true })).toBeVisible();
  await account(page, 'buddy-b');
  const response = await page.request.get('/api/v4/workspaces');
  expect(response.status()).toBe(403);
});
