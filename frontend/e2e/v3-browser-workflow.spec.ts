import { test, expect, type Page } from '@playwright/test';
async function account(page: Page, id: string) {
 await expect(page.getByLabel('Демо-аккаунт')).toBeEnabled();
 if (!await page.getByLabel('Демо-аккаунт').locator(`option[value="${id}"]`).count()) await page.getByLabel('Дополнительные участники').check();
 await page.getByLabel('Демо-аккаунт').selectOption(id);
 await expect.poll(async () => (await (await page.request.get('/api/v2/auth/me')).json()).user.account_id).toBe(id);
}
test('v3 real editor, assignments, distinct feedback, review, successor and ACL', async ({page, context}, info) => {
 test.setTimeout(120_000); page.setDefaultTimeout(10000);
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('/'); await account(page,'buddy-a');
 await page.getByRole('button',{name:'Создать ТЗ',exact:true}).click();
 const title = `Тестовое ТЗ ${Date.now()}`;
 await page.getByLabel('Название ТЗ').fill(title);
 await page.getByLabel('Цель',{exact:true}).fill('Подготовить проверяемый результат');
 await page.getByLabel('Требования',{exact:true}).fill('Подготовить отчёт о тестировании');
 await page.getByLabel('Ожидаемый результат',{exact:true}).fill('Отчёт с результатами');
 await page.getByLabel('Критерий приёмки 1',{exact:true}).fill('Приложить результаты проверок');
 await page.getByRole('button',{name:'Сохранить черновик'}).click();
 let card = page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card.getByRole('button',{name:'Опубликовать версию 1'}).click();
 for (const intern of ['10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004']) {
  await card.getByLabel('Назначить стажёру').selectOption(intern);
  await card.getByRole('button',{name:'Назначить',exact:true}).click();
  await expect(card.getByLabel('Назначить стажёру')).toHaveValue('');
 }
 await page.screenshot({path:info.outputPath('mentor-tasks.png'),fullPage:true});
 for (const id of ['intern-a','intern-b']) {
  await account(page,id); await page.getByRole('link',{name:'Мои задания',exact:true}).click();
  card = page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await card.getByRole('combobox',{name:'Раздел',exact:true}).selectOption('acceptance_criteria');
  await card.getByRole('combobox',{name:'Причина',exact:true}).selectOption('acceptance_unclear');
  await card.getByRole('button',{name:'Сообщить о неясности'}).click();
  await expect(card.getByRole('status')).toContainText('Затруднение сообщено');
  await card.getByRole('button',{name:'Сообщить о неясности'}).click();
  if (id === 'intern-a') {
   const wrapper=card.locator('..');
   await wrapper.getByRole('button',{name:'Подготовить контекст'}).click();
   await wrapper.getByRole('button',{name:'Проверить и скопировать'}).click();
   await expect(wrapper.getByRole('link',{name:'Открыть Telegram наставника'})).toHaveAttribute('href',/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]+$/);
   expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(title);
   expect((await (await page.request.get('/api/v2/escalations')).json()).items).toHaveLength(0);
  }
 }
 await account(page,'buddy-a'); await page.getByRole('link',{name:'Понятность заданий',exact:true}).click();
 card=page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await expect(card).toContainText('За 30 дней: 2 участников');
 await card.getByLabel('Основание решения').fill('Уточним критерии');
 await card.getByRole('button',{name:'Взять на рассмотрение'}).click();
 await expect(card.getByRole('button',{name:'Принять гипотезу'})).toBeVisible();
 await card.getByLabel('Основание решения').fill('Гипотеза подтверждена');
 await card.getByRole('button',{name:'Принять гипотезу'}).click();
 await expect(card.getByRole('button',{name:'Связать исправление'})).toBeVisible();
 await page.getByRole('link',{name:'Задания команды',exact:true}).click();
 card=page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card.getByRole('button',{name:'Редактировать ТЗ'}).click();
 await page.getByLabel('Критерий приёмки 1',{exact:true}).fill('Приложить 3 проверки с ожидаемым и фактическим результатом');
 await page.getByRole('button',{name:'Сохранить черновик'}).click();
 await card.getByRole('button',{name:'Опубликовать версию 2'}).click();
 await page.getByRole('link',{name:'Понятность заданий',exact:true}).click();
 card=page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card.getByLabel('Основание решения').fill('Опубликованы точные критерии');
 await card.getByRole('button',{name:'Связать исправление'}).click();
 await expect(card).toContainText('Исправлен');
 await page.getByRole('link',{name:'Статистика',exact:true}).click();
 await page.getByRole('combobox',{name:'Источник',exact:true}).selectOption('task_clarity');
 await expect(page.locator('main')).toContainText(title);
 await page.screenshot({path:info.outputPath('statistics.png'),fullPage:true});
 await account(page,'intern-a'); await page.getByRole('link',{name:'Мои задания',exact:true}).click();
 card=page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await expect(card).toContainText('Версия 1');
 await card.getByRole('button',{name:'Посмотреть новую версию'}).click();
 await expect(card).toContainText('Приложить 3 проверки');
 await card.getByRole('button',{name:'Подтвердить переход'}).click();
 await expect(card).toContainText('Версия 2');
 await page.reload(); await expect(card).toContainText('Версия 2');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:info.outputPath('assignments-mobile.png'),fullPage:true});
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);
 await page.setViewportSize({width:1280,height:900}); await account(page,'intern-c'); await page.goto('/#/assignments');
 await expect(page.locator('main')).not.toContainText(title);
 expect((await page.request.get('/api/v3/statistics/mentor')).status()).toBe(403);
});
