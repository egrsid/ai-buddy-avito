import {expect, request, test, type APIRequestContext} from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const origin = process.env.APP_ORIGIN ?? new URL(baseURL).origin;

async function login(accountId: string): Promise<{api: APIRequestContext; csrf: string}> {
  const api = await request.newContext({baseURL, extraHTTPHeaders: {Origin: origin}});
  const response = await api.post('/api/v2/auth/demo-login', {data: {account_id: accountId}});
  expect(response.status(), `demo-login for ${accountId}`).toBe(200);
  const body = await response.json();
  expect(body.user.account_id).toBe(accountId);
  return {api, csrf: body.csrf_token};
}

test('v2 goal ownership: create and reread own goal; deny other interns and buddy', async () => {
  const internA = await login('intern-a');
  const internB = await login('intern-b');
  const internC = await login('intern-c');
  const buddy = await login('buddy-a');

  try {
    const journeysResponse = await internA.api.get('/api/v2/journeys');
    expect(journeysResponse.status()).toBe(200);
    const journeys = (await journeysResponse.json()).items;
    expect(journeys.length).toBeGreaterThan(0);
    const journey = journeys[0];

    const createResponse = await internA.api.post('/api/v2/goals', {
      data: {journey_id: journey.journey_id, journey_version: journey.version},
      headers: {'X-CSRF-Token': internA.csrf, 'Idempotency-Key': crypto.randomUUID()},
    });
    expect([200, 201]).toContain(createResponse.status());
    const goal = await createResponse.json();
    expect(goal.journey_id).toBe(journey.journey_id);
    expect(goal.steps.length).toBeGreaterThan(0);
    expect(goal.progress).toMatchObject({
      verified: expect.any(Number),
      total: goal.steps.length,
      percent: expect.any(Number),
    });

    const rereadResponse = await internA.api.get(`/api/v2/goals/${goal.id}`);
    expect(rereadResponse.status()).toBe(200);
    expect(await rereadResponse.json()).toMatchObject({id: goal.id, progress: goal.progress});

    const internAList = await internA.api.get('/api/v2/goals');
    expect((await internAList.json()).items.map((item: {id: string}) => item.id)).toContain(goal.id);
    const internBList = await internB.api.get('/api/v2/goals');
    expect((await internBList.json()).items.map((item: {id: string}) => item.id)).not.toContain(goal.id);
    const internBDetail = await internB.api.get(`/api/v2/goals/${goal.id}`);
    expect(internBDetail.status()).toBe(404);
    const internCDetail = await internC.api.get(`/api/v2/goals/${goal.id}`);
    expect(internCDetail.status()).toBe(404);
    const buddyList = await buddy.api.get('/api/v2/goals');
    expect(buddyList.status()).toBe(403);
  } finally {
    await internA.api.dispose();
    await internB.api.dispose();
    await internC.api.dispose();
    await buddy.api.dispose();
  }
});

test('v2 session and CSRF: anonymous reads and unprotected goal creation are rejected', async () => {
  const anonymous = await request.newContext({baseURL, extraHTTPHeaders: {Origin: origin}});
  const intern = await login('intern-a');

  try {
    expect((await anonymous.get('/api/v2/auth/me')).status()).toBe(401);
    expect((await anonymous.get('/api/v2/goals')).status()).toBe(401);

    const journeysResponse = await intern.api.get('/api/v2/journeys');
    expect(journeysResponse.status()).toBe(200);
    const journey = (await journeysResponse.json()).items[0];
    expect(journey).toBeDefined();

    const beforeResponse = await intern.api.get('/api/v2/goals');
    expect(beforeResponse.status()).toBe(200);
    const before = (await beforeResponse.json()).items;

    const createResponse = await intern.api.post('/api/v2/goals', {
      data: {journey_id: journey.journey_id, journey_version: journey.version},
      headers: {'Idempotency-Key': crypto.randomUUID()},
    });
    expect(createResponse.status()).toBe(403);
    expect((await createResponse.json()).error.code).toBe('CSRF_INVALID');

    const afterResponse = await intern.api.get('/api/v2/goals');
    expect((await afterResponse.json()).items).toEqual(before);
  } finally {
    await anonymous.dispose();
    await intern.api.dispose();
  }
});
