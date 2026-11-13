import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('./api', () => ({
  apiFetch: apiFetchMock,
  newIdempotencyKey: () => '11111111-2222-4333-8444-555555555555',
  setCsrfToken: vi.fn(),
}));

import * as api from './endpoints';

interface ExampleRecord {
  schema_uri: string;
  definition: string;
  payload: unknown;
}

const contractsDir = resolve(__dirname, '../../../contracts/v2');
const examples = new Map<string, unknown>();
for (const file of ['common.json', 'public.json']) {
  const records = JSON.parse(readFileSync(resolve(contractsDir, `examples/${file}`), 'utf-8')) as ExampleRecord[];
  for (const r of records) if (!examples.has(r.definition)) examples.set(r.definition, r.payload);
}

const payload = (def: string) => {
  const p = examples.get(def);
  if (p === undefined) throw new Error(`no example payload for ${def}`);
  return p;
};

const ID = '00000048-0000-4000-8000-000000000048';
const GOAL = '0000001e-0000-4000-8000-00000000001e';
const CONV = '00000030-0000-4000-8000-000000000030';

beforeEach(() => apiFetchMock.mockReset());

describe('endpoints: auth', () => {
  it('demoLogin шлёт account_id и возвращает сессию', async () => {
    apiFetchMock.mockResolvedValue(payload('AuthSession'));
    const s = await api.demoLogin('intern-a');
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/demo-login', {
      method: 'POST',
      body: { account_id: 'intern-a' },
    });
    expect(s.user.account_id).toBeDefined();
  });

  it('me → AuthSession', async () => {
    apiFetchMock.mockResolvedValue(payload('AuthSession'));
    await expect(api.me()).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/me');
  });

  it('logout → POST без idempotency', async () => {
    apiFetchMock.mockResolvedValue(null);
    await api.logout();
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST', body: {} });
  });
});

describe('endpoints: journey/goals/steps/checks', () => {
  it('listJourneys → items', async () => {
    apiFetchMock.mockResolvedValue(payload('JourneyList'));
    const items = await api.listJourneys();
    expect(Array.isArray(items)).toBe(true);
    expect(apiFetchMock).toHaveBeenCalledWith('/journeys');
  });

  it('createGoal → POST /goals с Idempotency-Key', async () => {
    apiFetchMock.mockResolvedValue(payload('Goal'));
    await api.createGoal('db-access-team-a', 1);
    expect(apiFetchMock).toHaveBeenCalledWith('/goals', {
      method: 'POST',
      body: { journey_id: 'db-access-team-a', journey_version: 1 },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
  });

  it('listGoals/getGoal/getStep/getStepActions', async () => {
    apiFetchMock.mockResolvedValue(payload('GoalList'));
    await expect(api.listGoals()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Goal'));
    await expect(api.getGoal(GOAL)).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/goals/${GOAL}`);
    apiFetchMock.mockResolvedValue(payload('Step'));
    await expect(api.getStep(GOAL, 'check_connection')).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/goals/${GOAL}/steps/check_connection`);
    apiFetchMock.mockResolvedValue(payload('StepActionList'));
    await expect(api.getStepActions(GOAL, 'check_connection')).resolves.toEqual(
      (payload('StepActionList') as { items: string[] }).items,
    );
  });

  it('createCheck валидирует options по методу', async () => {
    apiFetchMock.mockResolvedValue(payload('Check'));
    await api.createCheck(GOAL, 'check_connection', {
      method: 'mock_db_connection',
      options: { ssl_mode: 'require' },
      expected_version: 3,
    });
    expect(apiFetchMock).toHaveBeenCalledWith(`/goals/${GOAL}/steps/check_connection/checks`, {
      method: 'POST',
      body: { method: 'mock_db_connection', options: { ssl_mode: 'require' }, expected_version: 3 },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
    // options не по методу отклоняется локально, запрос не уходит
    apiFetchMock.mockClear();
    await expect(
      api.createCheck(GOAL, 'check_connection', {
        method: 'iam_permission_present',
        options: { ssl_mode: 'require' },
        expected_version: 3,
      }),
    ).rejects.toThrow();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('getCheck/listResources/getResourceAccess/getKnowledge', async () => {
    apiFetchMock.mockResolvedValue(payload('Check'));
    await expect(api.getCheck(ID)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('ResourceList'));
    await expect(api.listResources()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('ResourceAccess'));
    await expect(api.getResourceAccess('db-team-a-test')).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenLastCalledWith('/resources/db-team-a-test/access');
    apiFetchMock.mockResolvedValue(payload('KnowledgeDocument'));
    await expect(api.getKnowledge(ID)).resolves.toBeDefined();
  });
});

describe('endpoints: access requests', () => {
  it('list/get/decision', async () => {
    apiFetchMock.mockResolvedValue(payload('AccessRequestList'));
    await expect(api.listAccessRequests()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('AccessRequest'));
    await expect(api.getAccessRequest(ID)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('AccessRequest'));
    await api.decideAccessRequest(ID, { decision: 'approved', reason: 'ok', expected_version: 2 });
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/access-requests/${ID}/decision`, {
      method: 'POST',
      body: { decision: 'approved', reason: 'ok', expected_version: 2 },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
  });
});

describe('endpoints: chat/actions', () => {
  it('conversations/messages/runs', async () => {
    apiFetchMock.mockResolvedValue(payload('Conversation'));
    await api.createConversation(null, null);
    expect(apiFetchMock).toHaveBeenLastCalledWith('/conversations', {
      method: 'POST',
      body: { goal_id: null, step_id: null },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
    apiFetchMock.mockResolvedValue(payload('ConversationList'));
    await expect(api.listConversations()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('MessageList'));
    await expect(api.listMessages(CONV)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Run'));
    await api.createRun(CONV, { content: 'Вопрос' });
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/conversations/${CONV}/runs`, {
      method: 'POST',
      body: { content: 'Вопрос' },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
    apiFetchMock.mockResolvedValue(payload('Run'));
    await expect(api.getRun(ID)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Run'));
    await expect(api.cancelRun(ID)).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/runs/${ID}/cancel`, { method: 'POST', body: {} });
  });

  it('actions create/get/confirm/cancel', async () => {
    const draft = {
      conversation_id: CONV,
      goal_id: GOAL,
      step_id: 'check_access',
      type: 'create_access_request' as const,
      parameters: {
        resource_id: 'db-team-a-test',
        requested_role: 'db_reader',
        reason: 'Нужен доступ',
        additional_fields: {},
      },
    };
    apiFetchMock.mockResolvedValue(payload('Action'));
    await api.createAction(draft);
    expect(apiFetchMock).toHaveBeenLastCalledWith('/actions', {
      method: 'POST',
      body: draft,
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
    apiFetchMock.mockResolvedValue(payload('Action'));
    await expect(api.getAction(ID)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Action'));
    await expect(api.confirmAction(ID)).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/actions/${ID}/confirm`, { method: 'POST', body: {} });
    apiFetchMock.mockResolvedValue(payload('Action'));
    await expect(api.cancelAction(ID)).resolves.toBeDefined();
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/actions/${ID}/cancel`, { method: 'POST', body: {} });
  });
});

describe('endpoints: buddy/feedback', () => {
  it('escalations list/get/reply', async () => {
    apiFetchMock.mockResolvedValue(payload('EscalationList'));
    await expect(api.listEscalations()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Escalation'));
    await expect(api.getEscalation(ID)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Escalation'));
    await api.replyEscalation(ID, { answer: 'Ответ', expected_version: 1 });
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/escalations/${ID}/reply`, {
      method: 'POST',
      body: { answer: 'Ответ', expected_version: 1 },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
  });

  it('friction/candidates/review', async () => {
    apiFetchMock.mockResolvedValue(payload('FrictionAggregateList'));
    await expect(api.listFrictionGroups()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('CandidateList'));
    await expect(api.listCandidates()).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Candidate'));
    await expect(api.getCandidate(ID)).resolves.toBeDefined();
    apiFetchMock.mockResolvedValue(payload('Candidate'));
    await api.reviewCandidate(ID, { decision: 'accepted', reason: 'Подтверждаю', expected_version: 1 });
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/knowledge-gaps/${ID}/review`, {
      method: 'POST',
      body: { decision: 'accepted', reason: 'Подтверждаю', expected_version: 1 },
      idempotencyKey: '11111111-2222-4333-8444-555555555555',
    });
  });
});

describe('endpoints: shape mismatch', () => {
  it('ответ вне контракта → понятная ошибка парсинга', async () => {
    apiFetchMock.mockResolvedValue({ items: [{ broken: true }] });
    await expect(api.listGoals()).rejects.toThrow(/API shape mismatch/);
  });
});
