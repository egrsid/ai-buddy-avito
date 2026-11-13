import { z } from 'zod';
import { ErrorBody } from '../contracts/common';

// RP-FE-02: низкоуровневый клиент Go API v2.
// Cookie buddy_session — HttpOnly, браузер шлёт сам (same-origin через vite proxy).
// Не-GET требует X-CSRF-Token из login/me и Origin (его ставит браузер).
// Создания требуют Idempotency-Key UUID — генерируется на каждый вызов мутации,
// вызывающий может передать свой ключ для безопасного retry UI.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fields?: { name: string; code: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

// Серверное время из HTTP Date (решение TL по п. 3.9: TTL считаем от серверных часов).
let serverOffsetMs = 0;
export function serverNow(): Date {
  return new Date(Date.now() + serverOffsetMs);
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const ErrorEnvelope = z.object({ error: ErrorBody });

export async function apiFetch(path: string, options: RequestOptions = {}): Promise<unknown> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  }

  let response: Response;
  try {
    // v2-пути передаются без префикса, v3 — полностью (/api/v3/...).
    response = await fetch(path.startsWith('/api/') ? path : `/api/v2${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Нет соединения с сервером.');
  }

  const dateHeader = response.headers.get('Date');
  if (dateHeader) {
    const serverTime = Date.parse(dateHeader);
    if (!Number.isNaN(serverTime)) serverOffsetMs = serverTime - Date.now();
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiError(response.status, 'UPSTREAM_ERROR', 'Неожиданный ответ сервера.');
      }
      throw new ApiError(response.status, 'INVALID_JSON', 'Ответ сервера не является JSON.');
    }
  }

  if (!response.ok) {
    const parsed = ErrorEnvelope.safeParse(json);
    if (parsed.success) {
      const err = parsed.data.error;
      throw new ApiError(response.status, err.code, err.message, err.request_id, err.fields);
    }
    throw new ApiError(response.status, 'UPSTREAM_ERROR', 'Неожиданный ответ сервера.');
  }
  return json;
}

// Безопасный текст ошибки для UI: технические детали скрыты по контракту.
export function userMessage(e: unknown, fallback = 'Сервис временно недоступен.'): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Сессия истекла. Войдите заново.';
    if (e.status === 403) return 'Недостаточно прав для этой операции.';
    if (e.code === 'TOOL_VALIDATION_ERROR' || e.code === 'VERSION_CONFLICT') {
      return 'Состояние шага изменилось. Обновите страницу и выберите доступное действие.';
    }
    return e.message || fallback;
  }
  return fallback;
}
