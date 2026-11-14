import { expect,test } from '@playwright/test';
test('v4 preview is explicit, keyboard accessible and never invokes v4 writes',async({page},info)=>{
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes('/api/v4')&&r.method()!=='GET')writes.push(r.url());});
 await page.goto('/#/v4-preview');await expect(page.getByRole('heading',{name:'V4 · прототип интерфейса'})).toBeVisible();
 await expect(page.getByText(/Синтетические примеры/)).toBeVisible();
 const expand=page.getByRole('button',{name:'Подзадачи: Подготовить отчёт о подключении'});await expand.focus();await page.keyboard.press('Enter');await expect(expand).toHaveAttribute('aria-expanded','true');
 await page.getByRole('tab',{name:'Доказательства'}).click();await expect(page.getByText('Доступ подтверждён IAM')).toBeVisible();
 await page.getByRole('tab',{name:'Уточнение ТЗ'}).click();await page.getByRole('checkbox',{name:'Уточнить формат результата'}).check();await page.getByRole('button',{name:'Применить в черновик'}).click();await expect(page.getByRole('alert')).toContainText('Изменения не сохранены');
 await page.getByRole('tab',{name:'Наблюдения по версиям'}).click();await expect(page.getByText('Разница: -40.0 п.п.')).toBeVisible();
 await page.getByLabel('Пример состояния').selectOption('suppressed');await expect(page.getByText('20.0%')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:info.outputPath('v4-preview-mobile.png'),fullPage:true});expect(writes).toEqual([]);
});
