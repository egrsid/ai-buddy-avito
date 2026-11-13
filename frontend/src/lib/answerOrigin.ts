// Откуда взялся ответ ассистента. AI-сервис помечает fallback фиксированными фразами
// в самом тексте (ai-service/app/failover.py, mock_provider.py): публичный контракт
// Message не меняется, а пометка сохраняется в истории чата вместе с ответом.
// Здесь эти фразы снимаются с текста и превращаются в бейдж.

import type { z } from 'zod';
import type { ResponseOrigin } from '../contracts/v3';

export type AnswerOrigin = 'ai' | 'ai-reserve' | 'fallback';
type ResponseOriginT = z.infer<typeof ResponseOrigin>;

// v3: источник ответа приходит от сервера (Go хранит то, что сообщил AI-сервис).
// Для старых сообщений сервер отвечает unknown — тогда остаётся разбор пометок в тексте.
export function originFromServer(origin: ResponseOriginT | undefined): { origin: AnswerOrigin; interrupted: boolean } | null {
  if (!origin || origin.answered_by === 'unknown') return null;
  const interrupted = origin.completion === 'interrupted';
  if (origin.mode === 'mock' || origin.answered_by === 'offline') return { origin: 'fallback', interrupted };
  return { origin: origin.answered_by === 'secondary' ? 'ai-reserve' : 'ai', interrupted };
}

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
