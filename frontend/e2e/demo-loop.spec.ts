import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Business writes are browser clicks. Read-only API assertions check trusted
// state/ACL; no route interception, direct DB writes, or skipped backend gate.
async function read(page: Page, route: string) {
  const response = await page.request.get('/api/v2' + route);
  expect(response.ok(), `${route}: ${response.status()}`).toBeTruthy();
  return response.json();
}
async function account(page: Page, id: string) {
  await expect(page.getByLabel('Демо-аккаунт')).toBeEnabled();
  if (!await page.getByLabel('Демо-аккаунт').locator(`option[value="${id}"]`).count()) {
    await page.getByLabel('Дополнительные участники').check();
  }
  await page.getByLabel('Демо-аккаунт').selectOption(id);
  await expect.poll(async () => {
    const response = await page.request.get('/api/v2/auth/me');
    return response.ok() ? (await response.json()).user.account_id : null;
  }).toBe(id);
  await expect(page.getByLabel('Демо-аккаунт')).toBeEnabled();
}
async function step(page: Page, id: string) {
  await page.getByRole('link', { name: 'Мои цели', exact: true }).click();
  // v3: подзадачи цели раскрываются кнопкой на карточке.
  const expand = page.getByRole('button', { name: 'Раскрыть подзадачи' }).first();
  if (await expand.isVisible()) await expand.click();
  await page.locator(`ol a[href$="/steps/${id}"]`).first().click();
  await expect(page.getByRole('heading', { name: 'Помощь с этим шагом' })).toBeVisible();
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('A/B/C full browser loop, ACL and real service restart', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Мои цели', exact: true })).toBeVisible();
  const goals: string[] = [];
  for (const id of ['intern-a', 'intern-b']) {
    await account(page, id);
    await expect(page.locator('main')).toContainText(/Цель пока не выбрана|Проверено \d из/);
    if (await button(page, 'Начать').isVisible()) await button(page, 'Начать').click();
    await step(page, 'check_access');
    if (id === 'intern-a') {
      await button(page, 'Инструкция (версия 1)').click();
      const document = page.getByRole('dialog');
      await expect(document.getByRole('heading', { name: 'Что нужно до начала' })).toBeVisible();
      await expect(document.locator('ol li')).toHaveCount(2);
      await page.screenshot({ path: info.outputPath('readable-instruction.png'), fullPage: true });
      await document.getByRole('button', { name: 'Закрыть', exact: true }).click();
    }
    const goalId = new URL(page.url()).hash.split('/')[2];
    goals.push(goalId);
    expect((await read(page, '/access-requests')).items).toEqual([]);
    await page.getByLabel('Сообщение AI-помощнику').fill('Подготовь заявку на доступ к тестовой БД');
    await button(page, 'Отправить').click();
    await expect(button(page, 'Подтвердить')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Что делать дальше' })).toBeVisible();
    const source = page.getByRole('link', { name: 'Заявка на роль db_reader для db-team-a-test', exact: true });
    await source.click();
    await expect(page.getByRole('dialog').locator('ol li')).toHaveCount(4);
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
    expect((await read(page, '/access-requests')).items).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${id}-preview.png`), fullPage: true });
    await button(page, 'Подтвердить').click();
    await expect.poll(async () => (await read(page, '/access-requests')).items.length).toBe(1);
    expect((await read(page, '/access-requests')).items[0].status).toBe('submitted');
    expect((await read(page, '/access-requests')).items[0].grant_state).not.toBe('present');
    await account(page, 'approver-a');
    await page.getByLabel('Ваше основание решения').fill('Разрешённая учебная БД команды A');
    await button(page, 'Одобрить').click();
    await expect(button(page, 'Одобрить')).toHaveCount(0);
    await account(page, id);
    expect((await read(page, '/goals/' + goalId)).steps.find((s: { id: string }) => s.id === 'check_access').status).not.toBe('verified');
    await step(page, 'check_access');
    await button(page, 'Повторить проверку').click();
    await expect.poll(async () => (await read(page, '/goals/' + goalId)).steps.find((s: { id: string }) => s.id === 'check_access').status).toBe('verified');
    await step(page, 'check_connection');
    await page.getByLabel('Режим SSL').selectOption('disable');
    await button(page, 'Запустить проверку').click();
    await expect(page.getByText('DB_SSL_REQUIRED', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${id}-blocker.png`), fullPage: true });
    await button(page, 'Повторить проверку').click();
    // v3: вместо внутреннего обращения — сообщение наставнику в Telegram.
    await expect(button(page, 'Подготовить сообщение')).toBeVisible();
    if (id === 'intern-a') {
      await account(page, 'docs-owner-a');
      expect((await read(page, '/knowledge-gaps')).items).toEqual([]);
      // This API exposes candidate-backed groups, only after distinct >= 2.
      expect((await read(page, '/friction-groups')).items).toEqual([]);
      await account(page, id);
      await step(page, 'check_connection');
      await button(page, 'Подготовить сообщение').click();
      await page.getByLabel('Вопрос наставнику (необязательно)').fill('Какой режим SSL выбрать?');
      await button(page, 'Показать текст сообщения').click();
      await expect(page.getByLabel('Текст для наставника')).toContainText('DB_SSL_REQUIRED');
      await expect(page.getByLabel('Текст для наставника')).toContainText('Какой режим SSL выбрать?');
      expect((await read(page, '/escalations')).items).toEqual([]);
      await page.screenshot({ path: info.outputPath('telegram-preview.png'), fullPage: true });
      await account(page, id);
      expect((await read(page, '/goals/' + goalId)).status).not.toBe('verified');
      await step(page, 'check_connection');
    }
    await page.getByLabel('Режим SSL').selectOption('require');
    await button(page, 'Повторить проверку').click();
    await expect.poll(async () => (await read(page, '/goals/' + goalId)).progress.percent).toBe(100);
    await expect(button(page, 'Повторить проверку')).toHaveCount(0);
    await page.getByRole('link', { name: 'Мои цели', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Прогресс цели «Доступ к БД команды A»' }).first()).toHaveAttribute('aria-valuenow', '100');
  }
  await account(page, 'docs-owner-a');
  const candidates = (await read(page, '/knowledge-gaps')).items.filter((c: { error_code: string }) => c.error_code === 'DB_SSL_REQUIRED');
  expect(candidates).toHaveLength(1);
  const candidate = candidates[0];
  expect(candidate.affected_count).toBe(2);
  const ref = candidate.instruction_refs[0];
  const original = await read(page, '/knowledge/' + ref.document_id);
  await page.locator(`a[href="#/knowledge-gaps/${candidate.id}"]`).click();
  await page.getByLabel('Основание решения').fill('В инструкции нужно явно описать SSL.');
  await button(page, 'Взять в работу').click();
  await expect.poll(async () => (await read(page, '/knowledge-gaps/' + candidate.id)).state).toBe('under_review');
  await button(page, 'Принять гипотезу').click();
  await expect.poll(async () => (await read(page, '/knowledge-gaps/' + candidate.id)).state).toBe('accepted');
  expect(await read(page, '/knowledge/' + ref.document_id)).toEqual(original);
  expect(JSON.stringify(candidate)).not.toMatch(/intern_id|subject_id|intern-a|intern-b/);
  await page.screenshot({ path: info.outputPath('knowledge-gap.png'), fullPage: true });
  const project = process.env.DEMO_PROJECT;
  expect(project, 'Set DEMO_PROJECT for real restart acceptance').toMatch(/^ai-buddy-demo-/);
  execFileSync('python3', ['-m', 'scripts.demo', 'restart', '--project', project!], { cwd: path.resolve(process.cwd(), '..'), stdio: 'pipe' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Кандидат: check_connection' })).toBeVisible();
  expect((await read(page, '/knowledge-gaps/' + candidate.id)).state).toBe('accepted');
  await account(page, 'intern-a');
  expect((await read(page, '/goals/' + goals[0])).progress.percent).toBe(100);
  expect((await page.request.get('/api/v2/goals/' + goals[1])).status()).toBe(404);
  await account(page, 'intern-c');
  await expect(page.getByText('Маршрутов нет', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/v2/goals/' + goals[0])).status()).toBe(404);
  expect((await page.request.get('/api/v2/knowledge/' + ref.document_id)).status()).toBe(404);
  expect(errors).toEqual([]);
});
