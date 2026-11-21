import { expect, test, type APIRequestContext } from '@playwright/test';
import { AuthSession, Goal, JourneyList } from '../src/contracts/public';
import { SubmissionView } from '../src/contracts/v4';

async function login(api: APIRequestContext, account: string, origin: string) {
  const login = await api.post('/api/v2/auth/demo-login', {
    headers: { Origin: origin }, data: { account_id: account },
  });
  expect(login.status()).toBe(200);
  const session = AuthSession.parse(await login.json());
  return {
    api, user: session.user,
    async post(path: string, data: unknown, status?: number) {
      const response = await api.post(path, {
        headers: { Origin: origin, 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': crypto.randomUUID() }, data,
      });
      if (status !== undefined) expect(response.status(), path).toBe(status);
      else expect(response.ok(), path).toBeTruthy();
      return response.json();
    },
  };
}

type Actor = Awaited<ReturnType<typeof login>>;

// Use the same real approval and DB check on a fresh seed or reuse an already verified goal.
async function verifyConnection(intern: Actor, approver: Actor, goalId: string) {
  const path = '/api/v2/goals/' + goalId;
  const read = async () => Goal.parse(await (await intern.api.get(path)).json());
  let goal = await read();
  if (goal.status === 'verified') return;
  if (goal.steps.find(s => s.id === 'check_access')?.status !== 'verified') {
    const conversation = await intern.post('/api/v2/conversations', { goal_id: goalId, step_id: 'check_access' });
    const action = await intern.post('/api/v2/actions', {
      type: 'create_access_request', conversation_id: conversation.id, goal_id: goalId, step_id: 'check_access',
      parameters: { resource_id: goal.resource_id, requested_role: 'db_reader', reason: 'Проверка сдачи работы', additional_fields: {} },
    });
    const confirmed = await intern.post(`/api/v2/actions/${action.id}/confirm`, {});
    const requestPath = '/api/v2/access-requests/' + confirmed.result.access_request_id;
    const pending = await (await approver.api.get(requestPath)).json();
    await approver.post(requestPath + '/decision', { decision: 'approved', reason: 'Учебное задание', expected_version: pending.version });
    goal = await read();
  }
  const step = goal.steps.find(s => s.id === 'check_connection')!;
  await intern.post(path + '/steps/check_connection/checks', {
    method: step.verification_method, options: { ssl_mode: 'require' }, expected_version: step.version,
  });
  expect((await read()).status).toBe('verified');
}

test('сдача DB-задания, доработка и приёмка закреплённой версии', async ({ page, browser, request, baseURL }) => {
  const origin = process.env.APP_ORIGIN ?? new URL(baseURL!).origin;
  const mentor = await browser.newPage({ baseURL });
  try {
    const buddy = await login(mentor.request, 'buddy-a', origin);
    const intern = await login(page.request, 'intern-a', origin);
    const approver = await login(request, 'approver-a', origin);
    const brief = await buddy.post('/api/v3/task-briefs', { content: {
      title: 'Отчёт о подключении', goal: 'Проверить доступ к БД', sections: [
        { id: 'report', title: 'Результат', text: 'Объясните, что подтверждает проверка.' },
      ], expected_result: 'Краткий вывод', acceptance_criteria: [{ id: 'proof', text: 'Приложено доказательство' }], refs: [],
    } });
    const published = await buddy.post(`/api/v3/task-briefs/${brief.id}/publish`, { expected_revision: brief.revision });
    const version = published.latest_published_version.version;
    const assignment = await buddy.post('/api/v3/task-assignments', { brief_id: brief.id, brief_version: version, intern_id: intern.user.id });
    const path = `/api/v4/assignments/${assignment.id}/submission`;
    const journey = JourneyList.parse(await (await intern.api.get('/api/v2/journeys')).json()).items[0];
    const template = { template_id: journey.journey_id, template_version: journey.version };
    await buddy.post(`/api/v4/assignments/${assignment.id}/permitted-template`, { ...template, expected_revision: assignment.revision });
    const workspace = '/api/v4/workspaces/' + assignment.id;
    const preview = await intern.post(workspace + '/link-preview', template);
    const linked = await intern.post(workspace + '/link-confirm', {
      preview_id: preview.id, preview_hash: preview.preview_hash, expected_revision: preview.assignment_revision,
    });
    await verifyConnection(intern, approver, linked.card.goal.id);

    const other = await login(request, 'intern-b', origin);
    expect((await other.api.get(path)).status()).toBe(404);
    const view = async () => SubmissionView.parse(await (await intern.api.get(path)).json());
    const proof = (await view()).proof!;
    await intern.post(path, { brief_version: version, attempt: 1, conclusion: 'Отчёт', evidence_id: crypto.randomUUID() }, 409);
    await page.goto('/#/tasks/' + assignment.id);
    await page.getByRole('button', { name: 'Сдача работы' }).click();
    await page.getByLabel('Что подтвердила проверка?').fill('Подключение проверено.');
    await page.getByRole('button', { name: 'Передать наставнику' }).click();
    await expect(page.getByText('У наставника на проверке')).toBeVisible();
    const first = (await view()).latest!;
    expect(first).toMatchObject({ evidence_id: proof.id, attempt: 1, status: 'submitted' });
    await buddy.post(path + '/review', { submission_id: first.id, decision: 'returned', comment: '  ' }, 422);
    await mentor.goto('/#/mentor/briefs/' + brief.id);
    await mentor.getByRole('button', { name: 'Проверка работы' }).click();
    await mentor.getByLabel('Комментарий стажёру', { exact: false }).fill('Уточните режим SSL.');
    await mentor.getByRole('button', { name: 'Вернуть на доработку' }).click();
    await expect(mentor.getByText('Возвращено на доработку')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Сдача работы' }).click();
    await expect(page.getByText('Уточните режим SSL.', { exact: false })).toBeVisible();
    await page.getByLabel('Что подтвердила проверка?').fill('Проверка SSL-подключения к тестовой БД прошла.');
    await page.getByRole('button', { name: 'Передать наставнику' }).click();
    await expect(page.getByText('У наставника на проверке')).toBeVisible();
    await buddy.post(path + '/review', { submission_id: first.id, decision: 'accepted', comment: '' }, 409);
    await mentor.reload();
    await mentor.getByRole('button', { name: 'Проверка работы' }).click();
    await mentor.getByRole('button', { name: 'Принять работу' }).click();
    await expect(mentor.getByText('Работа принята')).toBeVisible();
    expect((await view()).latest).toMatchObject({ attempt: 2, status: 'accepted', evidence_id: proof.id });
    await intern.post(path, { brief_version: version, attempt: 3, conclusion: 'Повтор', evidence_id: proof.id }, 409);
    const goal = Goal.parse(await (await intern.api.get('/api/v2/goals/' + linked.card.goal.id)).json());
    expect(goal.progress.percent).toBe(100);
  } finally {
    await mentor.close();
  }
});
