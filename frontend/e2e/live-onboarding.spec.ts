import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

async function stackReady(page: Page): Promise<boolean> {
  try {
    const health = await page.request.get('http://127.0.0.1:8080/readyz');
    return health.ok();
  } catch {
    return false;
  }
}

async function enterLive(page: Page, accountId: string) {
  await page.goto('/#/onboarding');
  await expect(page.getByLabel('Демо-аккаунт')).toBeVisible();
  await page.getByLabel('Демо-аккаунт').selectOption(accountId);
  const live = page.getByRole('button', { name: 'Live API' });
  if ((await live.getAttribute('aria-pressed')) !== 'true') {
    await live.click();
  }
  await expect(live).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Демо-режим: синтетические данные')).toHaveCount(0);
}

async function openStep(page: Page, title: string) {
  await page.goto('/#/onboarding');
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('live: сессия, заявка, SSL, buddy и границы intern-b/intern-c', async ({ page }) => {
  test.skip(!(await stackReady(page)), 'Сначала поднимите make demo: Go /readyz должен отвечать ok');

  await page.goto('/');
  await expect(page.getByRole('option', { name: /Стажёр B/ })).toHaveCount(1);
  await expect(page.getByRole('option', { name: /Стажёр C/ })).toHaveCount(1);

  await enterLive(page, 'intern-a');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Live API' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Демо-режим: синтетические данные')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Моя цель' })).toBeVisible();

  const start = page.getByRole('button', { name: 'Начать' });
  if (await start.count()) {
    await start.first().click();
  }
  await expect(page.getByText('db-access-team-a')).toBeVisible();

  await openStep(page, 'Проверить доступ');
  const goalUrl = page.url();
  const goalId = goalUrl.match(/onboarding\/([^/]+)\/steps/)?.[1];
  expect(goalId).toBeTruthy();

  await page.getByRole('button', { name: /Инструкция/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();

  const requestAccess = page.getByRole('button', { name: 'Запросить доступ' });
  if (await requestAccess.isVisible()) {
    await requestAccess.click();
    const preview = page.getByText('Заявка на доступ');
    const drafted = await preview.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    if (drafted) {
      await expect(page.getByText('db-team-a-test')).toBeVisible();
      await page.getByRole('button', { name: 'Подтвердить' }).click();
      await expect(page.getByText(/Заявка создана/)).toBeVisible({ timeout: 15_000 });
    }
  }

  await enterLive(page, 'approver-a');
  await expect(page.getByRole('link', { name: 'Согласования' })).toBeVisible();
  await page.getByRole('link', { name: 'Согласования' }).click();
  await expect(page.getByRole('heading', { name: 'Согласования' })).toBeVisible();
  const approve = page.getByRole('button', { name: 'Одобрить' });
  if (await approve.isVisible()) {
    await page.getByPlaceholder('Например: назначение подтверждено').fill('Разрешённый scope');
    await approve.click();
    await expect(page.getByText('Одобрена')).toBeVisible();
  } else {
    await expect(page.getByText(/Одобрена|Нет заявок на согласование/)).toBeVisible();
  }

  await enterLive(page, 'intern-a');
  await openStep(page, 'Проверить доступ');
  const recheck = page.getByRole('button', { name: 'Повторить проверку' });
  if (await recheck.isVisible()) {
    await recheck.click();
  }
  await expect(page.getByText('Проверено').first()).toBeVisible({ timeout: 15_000 });

  await openStep(page, 'Проверить подключение');
  const ssl = page.getByLabel('Режим SSL');
  if (await ssl.isVisible()) {
    await ssl.selectOption('disable');
    await page.getByRole('button', { name: /Запустить проверку|Повторить проверку/ }).first().click();
    await expect(page.getByText('DB_SSL_REQUIRED')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Спросить наставника' }).click();
    await expect(page.getByText('Передача вопроса наставнику')).toBeVisible();
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page.getByText(/Вопрос передан наставнику/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Диалог этого шага' }).click();
    await expect(page.getByText(/Диалог шага check_connection/)).toBeVisible();

    await enterLive(page, 'buddy-a');
    await page.getByRole('link', { name: 'Обращения стажёров' }).click();
    await page.getByRole('link', { name: /Нужна помощь наставника/ }).first().click();
    await page.getByLabel('Ответ стажёру').fill('Включите ssl_mode=require');
    await page.getByRole('button', { name: 'Ответить и закрыть' }).click();
    await expect(page.getByText('Включите ssl_mode=require')).toBeVisible();

    await enterLive(page, 'intern-a');
    await openStep(page, 'Проверить подключение');
    await page.getByLabel('Режим SSL').selectOption('require');
    await page.getByRole('button', { name: /Запустить проверку|Повторить проверку/ }).first().click();
  }
  await expect(page.getByText('Проверено').first()).toBeVisible({ timeout: 15_000 });

  await enterLive(page, 'intern-b');
  await page.goto('/#/onboarding');
  await expect(page.getByText('db-access-team-a')).toBeVisible();
  const startB = page.getByRole('button', { name: 'Начать' });
  if (await startB.isVisible()) {
    await startB.click();
    await expect(page.getByRole('link', { name: /Проверить доступ/ })).toBeVisible();
  }
  await page.goto(`/#/onboarding/${goalId}/steps/check_access`);
  await expect(page.getByRole('alert')).toContainText('NOT_FOUND');

  await enterLive(page, 'intern-c');
  await page.goto('/#/onboarding');
  await expect(page.getByText('db-access-team-a')).toHaveCount(0);
  await page.goto(`/#/onboarding/${goalId}/steps/check_access`);
  await expect(page.getByRole('alert')).toContainText('NOT_FOUND');
});
