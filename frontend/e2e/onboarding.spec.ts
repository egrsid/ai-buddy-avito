import {expect, request, test, type APIRequestContext} from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';

async function login(accountId: string): Promise<{api: APIRequestContext; csrf: string}> {
  const api = await request.newContext({baseURL, extraHTTPHeaders: {Origin: origin}});
  const response = await api.post('/api/v1/auth/demo-login', {data: {account_id: accountId}});
  expect(response.status(), `demo-login for ${accountId}`).toBe(200);
  const body = await response.json();
  expect(body.user.account_id).toBe(accountId);
  return {api, csrf: body.csrf_token};
}

test('M1: intern updates a task, persists it, and other accounts cannot access it', async () => {
  const internA = await login('intern-a');
  const internB = await login('intern-b');
  const buddy = await login('buddy-a');

  try {
    const tasksResponse = await internA.api.get('/api/v1/tasks');
    expect(tasksResponse.status()).toBe(200);
    const {items, progress} = await tasksResponse.json();
    expect(items.length).toBeGreaterThan(0);
    expect(progress).toMatchObject({done: expect.any(Number), total: items.length, percent: expect.any(Number)});

    const task = items[0];
    const detailResponse = await internA.api.get(`/api/v1/tasks/${task.id}`);
    expect(detailResponse.status()).toBe(200);
    expect((await detailResponse.json()).id).toBe(task.id);

    const updateResponse = await internA.api.patch(`/api/v1/tasks/${task.id}`, {
      data: {status: 'in_progress', version: task.version},
      headers: {'X-CSRF-Token': internA.csrf, 'Idempotency-Key': crypto.randomUUID()},
    });
    expect(updateResponse.status()).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.status).toBe('in_progress');
    expect(updated.version).toBe(task.version + 1);

    // A fresh read models refresh/restart persistence without resetting the database.
    const persistedResponse = await internA.api.get(`/api/v1/tasks/${task.id}`);
    expect(persistedResponse.status()).toBe(200);
    expect(await persistedResponse.json()).toMatchObject({status: 'in_progress', version: updated.version});

    const staleResponse = await internA.api.patch(`/api/v1/tasks/${task.id}`, {
      data: {status: 'done', version: task.version},
      headers: {'X-CSRF-Token': internA.csrf, 'Idempotency-Key': crypto.randomUUID()},
    });
    expect(staleResponse.status()).toBe(409);
    expect((await staleResponse.json()).error.code).toBe('VERSION_CONFLICT');

    const internBList = await internB.api.get('/api/v1/tasks');
    expect(internBList.status()).toBe(200);
    expect((await internBList.json()).items.map((item: {id: string}) => item.id)).not.toContain(task.id);
    const internBDetail = await internB.api.get(`/api/v1/tasks/${task.id}`);
    expect(internBDetail.status()).toBe(404);
    const buddyList = await buddy.api.get('/api/v1/tasks');
    expect(buddyList.status()).toBe(403);
  } finally {
    await internA.api.dispose();
    await internB.api.dispose();
    await buddy.api.dispose();
  }
});

test('M1 security: unauthenticated requests and task mutations without CSRF are rejected', async () => {
  const anonymous = await request.newContext({baseURL, extraHTTPHeaders: {Origin: origin}});
  const intern = await login('intern-a');

  try {
    const meResponse = await anonymous.get('/api/v1/auth/me');
    expect(meResponse.status()).toBe(401);
    const tasksResponse = await anonymous.get('/api/v1/tasks');
    expect(tasksResponse.status()).toBe(401);

    const listResponse = await intern.api.get('/api/v1/tasks');
    expect(listResponse.status()).toBe(200);
    const {items} = await listResponse.json();
    expect(items.length).toBeGreaterThan(0);
    const task = items[0];

    const mutationResponse = await intern.api.patch(`/api/v1/tasks/${task.id}`, {
      data: {status: 'in_progress', version: task.version},
      headers: {'Idempotency-Key': crypto.randomUUID()},
    });
    expect(mutationResponse.status()).toBe(403);
    expect((await mutationResponse.json()).error.code).toBe('CSRF_INVALID');

    const unchangedResponse = await intern.api.get(`/api/v1/tasks/${task.id}`);
    expect(await unchangedResponse.json()).toMatchObject({status: task.status, version: task.version});
  } finally {
    await anonymous.dispose();
    await intern.api.dispose();
  }
});
