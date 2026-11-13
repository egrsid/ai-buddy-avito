// Откуда взялся ответ ассистента. AI-сервис помечает fallback фиксированными фразами
// в самом тексте (ai-service/app/failover.py, mock_provider.py): публичный контракт
// Message не меняется, а пометка сохраняется в истории чата вместе с ответом.
// Здесь эти фразы снимаются с текста и превращаются в бейдж.

export type AnswerOrigin = 'ai' | 'ai-reserve' | 'fallback';

export interface ClassifiedAnswer {
  origin: AnswerOrigin;
  text: string;
  interrupted: boolean;
}

const NOTICE =
  'Произошла ошибка обращения к LLM. Работает fallback. Обратись к своему наставнику напрямую для решения вопроса.';
const RESERVE = 'Используется резервная модель.';
const OFFLINE =
  'Ответ ниже подготовлен без LLM по разрешённому контексту и шаблонам. Он не подтверждает выполнение шага.';
const MOCK = 'Демо-режим mock: ответ подготовлен без LLM.';
const INTERRUPTED = '_Ответ модели прервался. Повтори вопрос или обратись к наставнику._';

function dropPrefix(text: string, prefix: string): string | null {
  const trimmed = text.trimStart();
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trimStart() : null;
}

export function classifyAnswer(content: string): ClassifiedAnswer {
  let origin: AnswerOrigin = 'ai';
  let text = content;

  const afterNotice = dropPrefix(text, NOTICE);
  if (afterNotice !== null) {
    const afterReserve = dropPrefix(afterNotice, RESERVE);
    if (afterReserve !== null) {
      origin = 'ai-reserve';
      text = afterReserve;
    } else {
      origin = 'fallback';
      text = dropPrefix(afterNotice, OFFLINE) ?? afterNotice;
    }
  } else {
    const afterMock = dropPrefix(text, MOCK);
    if (afterMock !== null) {
      origin = 'fallback';
      text = afterMock;
    }
  }

  const interrupted = text.trimEnd().endsWith(INTERRUPTED);
  if (interrupted) text = text.trimEnd().slice(0, -INTERRUPTED.length).trimEnd();
  return { origin, text, interrupted };
}
