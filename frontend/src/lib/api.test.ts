import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, newIdempotencyKey, serverNow, setCsrfToken, userMessage } from './api';

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('apiFetch', () => {
  beforeEach(() => setCsrfToken(null));
  afterEach(() => vi.unstubAllGlobals());

  it('GET: префикс /api/v2, без CSRF/idempotency заголовков', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/goals');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v2/goals');
    expect(init.method).toBe('GET');
    expect(init.headers['X-CSRF-Token']).toBeUndefined();
    expect(init.headers['Idempotency-Key']).toBeUndefined();
    expect(init.credentials).toBe('same-origin');
  });

  it('POST: CSRF после установки токена, Idempotency-Key, JSON body', async () => {
    setCsrfToken('csrf-abc');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/goals', { method: 'POST', body: { journey_id: 'j' }, idempotencyKey: 'key-1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-CSRF-Token']).toBe('csrf-abc');
    expect(init.headers['Idempotency-Key']).toBe('key-1');
    expect(JSON.parse(init.body)).toEqual({ journey_id: 'j' });
  });

  it('204 → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await apiFetch('/auth/logout', { method: 'POST', body: {} })).toBeNull();
  });

  it('конверт ошибки → ApiError с кодом, request_id и fields', async () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Проверьте поля',
        request_id: '00000046-0000-4000-8000-000000000046',
        fields: [{ name: 'reason', code: 'required' }],
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(422, body)));
    const err = (await apiFetch('/goals', { method: 'POST', body: {} }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.requestId).toBe(body.error.request_id);
    expect(err.fields).toEqual([{ name: 'reason', code: 'required' }]);
  });

  it('не-JSON ошибка → ApiError UPSTREAM_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 500 })));
    const err = (await apiFetch('/goals').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UPSTREAM_ERROR');
    expect(err.status).toBe(500);
  });

  it('сетевая ошибка → ApiError NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const err = (await apiFetch('/goals').catch((e) => e)) as ApiError;
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('AbortError пробрасывается как есть', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const err = await apiFetch('/goals').catch((e) => e);
    expect(err).toBeInstanceOf(DOMException);
  });

  it('HTTP Date сдвигает serverNow', async () => {
    const serverDate = new Date(Date.now() + 60_000).toUTCString();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {}, { Date: serverDate })));
    const before = Date.now();
    await apiFetch('/goals');
    expect(serverNow().getTime()).toBeGreaterThan(before + 50_000);
  });
});

describe('userMessage', () => {
  it('401/403 — безопасные тексты', () => {
    expect(userMessage(new ApiError(401, 'UNAUTHENTICATED', 'x'))).toMatch(/Сессия истекла/);
    expect(userMessage(new ApiError(403, 'FORBIDDEN', 'x'))).toMatch(/Недостаточно прав/);
  });
  it('прочие ApiError — сообщение сервера, не-ApiError — fallback', () => {
    expect(userMessage(new ApiError(409, 'VERSION_CONFLICT', 'Обновите данные'))).toContain('Состояние шага изменилось');
    expect(userMessage(new ApiError(422, 'TOOL_VALIDATION_ERROR', 'TOOL_VALIDATION_ERROR'))).toContain('выберите доступное действие');
    expect(userMessage(new Error('boom'))).toBe('Сервис временно недоступен.');
  });
});

describe('newIdempotencyKey', () => {
  it('возвращает UUID', () => {
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
