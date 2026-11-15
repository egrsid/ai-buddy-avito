import { expect, test, type Page } from '@playwright/test';

// V3-E2E: полный путь v3 кликами в браузере на живом стенде (Go + AI + Postgres).
// Наставник пишет и публикует ТЗ, назначает двум стажёрам; оба отмечают один раздел →
// один отчёт без имён → ревью → новая версия → закрытие. Старые назначения остаются на v1
// до явного перехода. Плюс Telegram-текст, карточки целей и статистика.
// Чтения API — только проверки; все изменения — кликами.

async function read(page: Page, route: string) {
  const response = await page.request.get(route);
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

const button = (page: Page, name: string | RegExp) =>
  typeof name === 'string' ? page.getByRole('button', { name, exact: true }) : page.getByRole('button', { name });

async function openTask(page: Page, title: string) {
  await page.getByRole('link', { name: 'ТЗ от наставника', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

async function markUnclear(page: Page, sectionTitle: string, reason: string) {
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: sectionTitle, exact: true }) });
  await section.getByRole('button', { name: 'Непонятно' }).click();
  await section.getByLabel(reason).check();
  await section.getByRole('button', { name: 'Отметить', exact: true }).click();
  return section;
}

test('v3: ТЗ → две неясности → отчёт → новая версия; Telegram, цели, статистика', async ({ page, context }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = `E2E ТЗ ${Date.now()}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');

  // 1. Наставник создаёт черновик, публикует v1 и назначает двум стажёрам.
  await account(page, 'buddy-a');
  await page.getByRole('link', { name: 'Мои задания', exact: true }).click();
  await button(page, /Новое ТЗ/).click();
  await page.getByLabel('Название').fill(title);
  await page.getByLabel('Цель задания').fill('Подготовить отчёт о подключении к тестовой БД.');
  await page.getByLabel('Заголовок раздела').fill('Срок');
  await page.getByLabel('Текст раздела').fill('Отчёт нужен как можно скорее, желательно к концу недели.');
  await page.getByLabel('Ожидаемый результат').fill('Отчёт в документе команды.');
  await page.getByLabel('Критерий 1', { exact: true }).fill('В отчёте перечислены шаги подключения.');
  await button(page, 'Сохранить черновик').click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 15_000 });
  await button(page, /Опубликовать версию 1/).click();
  await expect(page.getByText('Опубликованная версия 1')).toBeVisible();
  for (const intern of ['intern-a', 'intern-a', 'intern-b']) {
    await page.getByLabel('Кому назначить').selectOption({ label: intern });
    await button(page, 'Назначить').click();
    await expect(page.getByRole('status')).toContainText(`Назначено: ${intern}`);
  }
  await page.screenshot({ path: info.outputPath('mentor-brief.png'), fullPage: true });

  // 2. Первый стажёр отмечает раздел; повтор не увеличивает счётчик; готовит текст в Telegram.
  await account(page, 'intern-a');
  await openTask(page, title);
  let section = await markUnclear(page, 'Срок', 'Неясен результат');
  await expect(section.getByRole('status')).toContainText('Затруднение сообщено');
  section = await markUnclear(page, 'Срок', 'Неясен результат');
  await expect(section.getByRole('status')).toContainText('учтена один раз');
  await section.getByRole('button', { name: 'Спросить наставника' }).click();
  await button(page, 'Показать текст сообщения').click();
  const text = page.getByLabel('Текст для наставника');
  await expect(text).toContainText(`Задание: ${title} (версия 1)`);
  await expect(text).toContainText('Раздел: Срок');
  await expect(page.getByRole('button', { name: /Открыть Telegram/ })).toBeVisible();
  // В буфер попадает ровно перепроверенный сервером текст; внутреннего обращения нет.
  await button(page, /Только скопировать/).click();
  await expect(page.getByText('Текст скопирован.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Задание: ${title} (версия 1)`);
  expect((await read(page, '/api/v2/escalations')).items).toEqual([]);
  await page.screenshot({ path: info.outputPath('intern-task.png'), fullPage: true });

  // Одного стажёра мало: отчёта нет.
  await account(page, 'buddy-a');
  const reportsFor = async () => (await read(page, '/api/v3/task-clarity-reports')).items.filter((r: { brief_title: string }) => r.brief_title === title);
  expect(await reportsFor()).toEqual([]);

  // 3. Второй стажёр — тот же раздел и причина → ровно один отчёт.
  await account(page, 'intern-b');
  await openTask(page, title);
  await markUnclear(page, 'Срок', 'Неясен результат');
  await account(page, 'buddy-a');
  await expect.poll(async () => (await reportsFor()).length).toBe(1);
  const [report] = await reportsFor();
  expect(report.current_count).toBe(2);
  expect(JSON.stringify(report)).not.toMatch(/intern-a|intern-b|10000000-0000-4000-8000-00000000000[34]/);

  // 4. Наставник видит отчёт, гипотезу и закрывает его новой версией.
  await page.getByRole('link', { name: 'Понятность заданий', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: '«Срок»' })).toBeVisible();
  await expect.poll(async () => (await read(page, `/api/v3/task-clarity-reports/${report.id}`)).enrichment_status, { timeout: 45_000 }).not.toBe('pending');
  await page.reload();
  await expect(page.getByText(/Наблюдение|Разные стажёры/).first()).toBeVisible();
  await button(page, 'Взять в работу').click();
  await button(page, 'Принять гипотезу').click();
  await expect(page.getByText(/Принятие ничего не публикует/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('mentor-report.png'), fullPage: true });
  await page.getByRole('link', { name: /Открыть ТЗ/ }).click();
  await button(page, 'Подготовить версию 2').click();
  await page.getByLabel('Текст раздела').fill('Отчёт сдать до пятницы 18:00 ссылкой на документ команды.');
  await button(page, 'Сохранить черновик').click();
  await button(page, /Опубликовать версию 2/).click();
  await expect(page.getByText('Опубликованная версия 2')).toBeVisible();
  await page.getByRole('link', { name: /Отчёты о понятности/ }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await button(page, 'Закрыть версией 2').click();
  await expect(page.getByText('Закрыто версией 2.')).toBeVisible();

  // 5. Старое назначение осталось на v1 до явного перехода стажёра.
  await account(page, 'intern-a');
  await openTask(page, title);
  await expect(page.getByText(/Вы работаете по версии 1/)).toBeVisible();
  await button(page, 'Посмотреть версию 2').click();
  await expect(page.getByLabel('Текст версии 2')).toContainText('до пятницы 18:00');
  await button(page, 'Перейти на версию 2').click();
  await expect(page.getByText('Отчёт сдать до пятницы 18:00 ссылкой на документ команды.')).toBeVisible();
  await expect(page.getByText(/Вы работаете по версии/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Отчёт сдать до пятницы 18:00 ссылкой на документ команды.')).toBeVisible();
  // Мобильная ширина: без горизонтальной прокрутки.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText('Отчёт сдать до пятницы 18:00 ссылкой на документ команды.')).toBeVisible();
  // Меню на телефоне закрыто и не перекрывает ТЗ.
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('intern-task-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 900 });

  // 6. Цели: карточки с прогрессом, раскрытие переживает перезагрузку.
  await page.getByRole('link', { name: 'Мои цели', exact: true }).click();
  const goalCard = page.getByRole('progressbar').first();
  await expect(goalCard).toBeVisible();
  const expand = page.getByRole('button', { name: /Раскрыть подзадачи/ }).first();
  if (await expand.isVisible()) {
    await expand.click();
    await expect(page.getByRole('list', { name: 'Шаги цели' }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('list', { name: 'Шаги цели' }).first()).toBeVisible();
  }

  // 7. Статистика наставника по понятности ТЗ: группа видна, чисел ровно 2.
  await account(page, 'buddy-a');
  await page.getByRole('link', { name: 'Статистика', exact: true }).click();
  await page.getByRole('tab', { name: 'Понятность моих ТЗ' }).click();
  const row = page.locator('tr').filter({ hasText: title });
  await expect(row).toContainText('Срок');
  await expect(row.locator('td').nth(1)).toHaveText('2');
  await page.screenshot({ path: info.outputPath('mentor-stats.png'), fullPage: true });

  // ACL: другой наставник не видит ни ТЗ, ни отчёт.
  await account(page, 'buddy-b');
  expect((await page.request.get(`/api/v3/task-clarity-reports/${report.id}`)).status()).toBe(404);
  expect((await read(page, '/api/v3/task-briefs')).items.filter((b: { title: string }) => b.title.startsWith(title))).toEqual([]);
  expect(errors).toEqual([]);
});
