import { describe, expect, it } from 'vitest';
import { classifyAnswer, originFromServer } from './answerOrigin';

const NOTICE =
  'Произошла ошибка обращения к LLM. Работает fallback. Обратись к своему наставнику напрямую для решения вопроса. ';
const OFFLINE =
  'Ответ ниже подготовлен без LLM по разрешённому контексту и шаблонам. Он не подтверждает выполнение шага.\n\n';
const INTERRUPTED = '\n\n_Ответ модели прервался. Повтори вопрос или обратись к наставнику._';

describe('classifyAnswer', () => {
  it('обычный ответ модели — ИИ, текст без изменений', () => {
    expect(classifyAnswer('Включите **ssl_mode=require**.')).toEqual({
      origin: 'ai', text: 'Включите **ssl_mode=require**.', interrupted: false,
    });
  });

  it('резервная модель — тоже ИИ, служебная фраза снимается', () => {
    const result = classifyAnswer(`${NOTICE}Используется резервная модель.\n\nОтвет резервной модели.`);
    expect(result).toEqual({ origin: 'ai-reserve', text: 'Ответ резервной модели.', interrupted: false });
  });

  it('ответ без LLM — fallback', () => {
    expect(classifyAnswer(`${NOTICE}${OFFLINE}Шаблон.`)).toEqual({
      origin: 'fallback', text: 'Шаблон.', interrupted: false,
    });
  });

  it('mock-режим — fallback', () => {
    const result = classifyAnswer('Демо-режим mock: ответ подготовлен без LLM.\n\nШаблон mock.');
    expect(result.origin).toBe('fallback');
    expect(result.text).toBe('Шаблон mock.');
  });

  it('незнакомое продолжение после уведомления остаётся fallback и не теряется', () => {
    expect(classifyAnswer(`${NOTICE}Что-то новое.`)).toEqual({
      origin: 'fallback', text: 'Что-то новое.', interrupted: false,
    });
  });

  it('оборванный ответ модели помечается и пометка снимается с текста', () => {
    expect(classifyAnswer(`Начало ответа${INTERRUPTED}`)).toEqual({
      origin: 'ai', text: 'Начало ответа', interrupted: true,
    });
  });
});

describe('originFromServer', () => {
  it('сервер называет, кто ответил; unknown — нет доверенной метки', () => {
    expect(originFromServer({ mode: 'live', answered_by: 'primary', completion: 'complete' })).toEqual({ origin: 'ai', interrupted: false });
    expect(originFromServer({ mode: 'live', answered_by: 'secondary', completion: 'interrupted', reason_code: 'timeout' })).toEqual({ origin: 'ai-reserve', interrupted: true });
    expect(originFromServer({ mode: 'live', answered_by: 'offline', completion: 'complete' })).toEqual({ origin: 'fallback', interrupted: false });
    expect(originFromServer({ mode: 'mock', answered_by: 'offline', completion: 'complete', reason_code: 'config_mock' })?.origin).toBe('mock');
    expect(originFromServer({ mode: 'unknown', answered_by: 'unknown', completion: 'complete' })).toBeNull();
    expect(originFromServer(undefined)).toBeNull();
  });
});
