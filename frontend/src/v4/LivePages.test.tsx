import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LiveV4Page } from './LivePages';
import * as fx from '../test/v3fixtures';

const m = vi.hoisted(() => ({
  role: 'intern',
  api: vi.fn(),
  goal: vi.fn(),
  brief: vi.fn(),
  assignments: vi.fn(),
  reports: vi.fn(),
}));
vi.mock('../lib/dataMode', () => ({ useDataMode: () => ({ user: { roles: [m.role] } }) }));
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  apiFetch: m.api,
}));
vi.mock('../lib/v3', () => ({ getBrief: m.brief, listAssignments: m.assignments, listReports: m.reports }));
vi.mock('../lib/endpoints', () => ({ getGoal: m.goal }));
const GOAL = '40000000-0000-4000-8000-000000000001';
const PREVIEW = '40000000-0000-4000-8000-000000000002';
const PROPOSAL = '40000000-0000-4000-8000-000000000003';
const workspaceCard = (linked = false) => ({
  kind: 'assignment',
  id: fx.ASSIGNMENT_ID,
  title: 'Рабочий отчёт',
  link_status: linked ? 'linked' : 'unlinked',
  technical_status: linked ? 'blocked' : 'unknown',
  next_action: 'continue',
  ...(linked ? { blocker_code: 'DB_SSL_REQUIRED' } : {}),
  goal: linked ? { id: GOAL, status: 'blocked', title: 'DB' } : { status: 'unlinked' },
});
const workspace = (linked = false) => ({
  assignment_id: fx.ASSIGNMENT_ID,
  revision: 2,
  link_status: linked ? 'linked' : 'unlinked',
  card: workspaceCard(linked),
});
const preview = {
  id: PREVIEW,
  assignment_id: fx.ASSIGNMENT_ID,
  template_id: 'db-access-team-a',
  template_version: 1,
  preview_hash: fx.HASH,
  expires_at: '2099-01-01T00:00:00Z',
  assignment_revision: 2,
};
const proposal = (patch = {}) => ({
  id: PROPOSAL,
  report_id: fx.REPORT_ID,
  status: 'ready',
  origin: 'rule_based',
  changes: [
    {
      id: 'c1',
      field: 'sections.report-format.text',
      old_hash: fx.HASH,
      replacement: 'Проверяемый результат',
    },
  ],
  questions: [],
  proposal_revision: 1,
  preview_hash: fx.HASH,
  expires_at: '2099-01-01T00:00:00Z',
  base_hash: fx.HASH,
  base_version: 1,
  ...patch,
});
const comparison = (ready = false) => ({
  brief_id: fx.BRIEF_ID,
  section_id: 'report-format',
  reason: 'outcome_unclear',
  as_of: fx.STAMP,
  policy_revision: 1,
  comparable: true,
  synthetic: true,
  label: 'Синтетические наблюдения',
  state: ready ? 'ready' : 'insufficient_data',
  config_revision: 2,
  before: {
    version: 1,
    state: ready ? 'ready' : 'no_exposure',
    ...(ready ? { eligible: 10, affected: 6, rate: 0.6 } : {}),
  },
  after: {
    version: 2,
    state: ready ? 'ready' : 'no_exposure',
    ...(ready ? { eligible: 10, affected: 2, rate: 0.2 } : {}),
  },
  ...(ready ? { delta_pp: -40 } : {}),
});
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const selectReport = async () => {
  await screen.findByText(`${fx.content.title} · Формат · v1`);
  fireEvent.change(screen.getByLabelText('Отчёт о неясности'), { target: { value: fx.REPORT_ID } });
};
beforeEach(() => {
  vi.clearAllMocks();
  m.role = 'intern';
  m.assignments.mockResolvedValue([fx.assignment()]);
  m.reports.mockResolvedValue([fx.report({ section_id: 'report-format', section_title: 'Формат' })]);
  m.brief.mockResolvedValue(fx.brief());
  m.goal.mockResolvedValue({ steps: [{ id: 'check_connection', title: 'Подключение', status: 'blocked' }] });
  m.api.mockResolvedValue({ items: [workspaceCard()], unlinked_goals: [], as_of: fx.STAMP });
});
it('requires a preview before linking, uses its exact hash/revision, and lazily reads evidence', async () => {
  let linked = false;
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith('link-preview')) return preview;
    if (path.endsWith('link-confirm')) {
      linked = true;
      return workspace(true);
    }
    if (path.endsWith('evidence-timeline'))
      return {
        goal_id: GOAL,
        as_of: fx.STAMP,
        current: { status: 'blocked' },
        items: [
          {
            id: PREVIEW,
            kind: 'evidence',
            observed_at: fx.STAMP,
            label: 'IAM проверка',
            source: 'IAM',
            trusted: true,
            validity: 'current',
          },
          {
            id: PROPOSAL,
            kind: 'check',
            observed_at: fx.STAMP,
            label: 'Старый grant',
            source: 'IAM',
            trusted: true,
            validity: 'invalidated',
          },
          {
            id: fx.REPORT_ID,
            kind: 'access_request',
            observed_at: fx.STAMP,
            label: 'Отправка',
            source: 'intern',
            trusted: false,
            validity: 'current',
          },
        ],
      };
    return { items: [workspaceCard(linked)], unlinked_goals: [], as_of: fx.STAMP };
  });
  render(<LiveV4Page />);
  await screen.findByText('Рабочий отчёт');
  await click('Связать с технической целью');
  expect(m.api.mock.calls.some(([p]) => p.endsWith('link-confirm'))).toBe(false);
  await click('Отмена');
  expect(screen.queryByText('Подтвердите связь ТЗ с маршрутом')).not.toBeInTheDocument();
  await click('Связать с технической целью');
  await click('Подтвердить связь');
  expect(m.api).toHaveBeenCalledWith(
    `/api/v4/workspaces/${fx.ASSIGNMENT_ID}/link-confirm`,
    expect.objectContaining({ body: { preview_id: PREVIEW, preview_hash: fx.HASH, expected_revision: 2 } }),
  );
  await screen.findByText('DB_SSL_REQUIRED');
  expect(m.goal).not.toHaveBeenCalled();
  await click('Подзадачи и доказательства');
  expect(await screen.findByText('IAM проверка')).toBeInTheDocument();
  expect(screen.getByText(/Отозвано/)).toBeInTheDocument();
  expect(screen.getByText(/Не является доказательством/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Подключение · Есть препятствие' })).toHaveAttribute(
    'href',
    `#/onboarding/${GOAL}/steps/check_connection`,
  );
  await click('Подзадачи и доказательства');
  expect(screen.queryByText('Почему такой статус?')).not.toBeInTheDocument();
});
it('shows empty/error states and retries reads', async () => {
  m.api.mockRejectedValueOnce(new Error('down'));
  m.api.mockResolvedValueOnce({ items: [], unlinked_goals: [], as_of: fx.STAMP });
  render(<LiveV4Page />);
  await screen.findByRole('alert');
  await click('Повторить');
  expect(await screen.findByText('Пока нет назначенных ТЗ или целей.')).toBeInTheDocument();
});
it('link failure never claims a successful link and a confirm conflict dismisses stale preview', async () => {
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith('link-preview')) return preview;
    if (path.endsWith('link-confirm')) throw new Error('conflict');
    return { items: [workspaceCard()], unlinked_goals: [], as_of: fx.STAMP };
  });
  render(<LiveV4Page />);
  await screen.findByText('Рабочий отчёт');
  await click('Связать с технической целью');
  await click('Подтвердить связь');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Подтвердите связь ТЗ с маршрутом')).not.toBeInTheDocument();
  m.api.mockRejectedValueOnce(new Error('denied'));
  await click('Связать с технической целью');
  expect(screen.queryByText('Подтвердите связь ТЗ с маршрутом')).not.toBeInTheDocument();
});
it('keeps generation, selected apply, human publication and impact configuration separate', async () => {
  m.role = 'buddy';
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith('permitted-template')) return workspace();
    if (path.endsWith('revision-proposals')) return proposal();
    if (path.endsWith('/apply')) return proposal({ status: 'applied', proposal_revision: 2 });
    return comparison();
  });
  render(<LiveV4Page />);
  await screen.findByText(/intern-a/);
  await click('Разрешить DB-маршрут');
  expect(m.api).toHaveBeenCalledWith(
    `/api/v4/assignments/${fx.ASSIGNMENT_ID}/permitted-template`,
    expect.objectContaining({ body: expect.objectContaining({ expected_revision: 1 }) }),
  );
  await selectReport();
  fireEvent.change(screen.getByLabelText('Уточнение автора (для новой генерации)'), {
    target: { value: 'Нумерованный список' },
  });
  await click('Предложить уточнение');
  expect(screen.getByText(/Шаблон без LLM/)).toBeInTheDocument();
  expect(screen.getByText(/Было: Опишите шаги/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Применить в черновик' })).toBeDisabled();
  const change = screen.getByLabelText(/Формат отчёта/);
  fireEvent.click(change);
  fireEvent.click(change);
  fireEvent.click(change);
  await click('Применить в черновик');
  expect(m.api).toHaveBeenCalledWith(
    `/api/v4/revision-proposals/${PROPOSAL}/apply`,
    expect.objectContaining({
      body: {
        selected_change_ids: ['c1'],
        expected_draft_revision: null,
        proposal_revision: 1,
        preview_hash: fx.HASH,
      },
    }),
  );
  expect(screen.getByText(/Изменения сохранены в черновик/)).toBeInTheDocument();
  expect(m.api.mock.calls.some(([p]) => p.includes('publish'))).toBe(false);
  fireEvent.change(screen.getByLabelText('Версия до'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Версия после'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Начало набора когорт'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Конец набора когорт'), { target: { value: '2026-10-31' } });
  fireEvent.click(screen.getByLabelText(/Смысл выбранного раздела/));
  await click('Настроить сравнение');
  expect(screen.getByText('Недостаточно данных', { exact: true })).toBeInTheDocument();
  expect(m.api).toHaveBeenCalledWith(
    `/api/v4/task-briefs/${fx.BRIEF_ID}/impact-config`,
    expect.objectContaining({
      body: expect.objectContaining({
        before_version: 2,
        after_version: 3,
        expected_revision: 0,
        comparable: true,
        from_a: '2026-10-01T00:00:00Z',
      }),
    }),
  );
  m.api.mockResolvedValueOnce(comparison(true));
  await click('Загрузить сравнение');
  expect(screen.getByText('Разница: -40.0 п.п.')).toBeInTheDocument();
  expect(screen.getByText('Версия 1: 6 из 10, 60.0%')).toBeInTheDocument();
});
it('handles questions, a fresh generation error, apply conflict and configuration failure without success', async () => {
  m.role = 'buddy';
  m.brief.mockResolvedValue(fx.brief({ draft: fx.version(2, 'draft') }));
  m.api.mockResolvedValueOnce(
    proposal({ status: 'needs_input', changes: [], questions: ['Какой формат?'], origin: 'model' }),
  );
  render(<LiveV4Page />);
  await selectReport();
  await click('Предложить уточнение');
  expect(screen.getByText('Какой формат?')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Применить в черновик' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Уточнение автора (для новой генерации)'), {
    target: { value: 'Список' },
  });
  m.api.mockResolvedValueOnce(proposal());
  await click('Предложить уточнение');
  expect(m.api).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: expect.objectContaining({ answers: [{ question: 'Какой формат?', answer: 'Список' }] }),
    }),
  );
  fireEvent.click(screen.getByLabelText(/Формат отчёта/));
  m.api.mockRejectedValueOnce(new Error('conflict'));
  await click('Применить в черновик');
  expect(screen.queryByText(/Изменения сохранены в черновик/)).not.toBeInTheDocument();
  expect(m.api).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ body: expect.objectContaining({ expected_draft_revision: 3 }) }),
  );
  m.api.mockRejectedValueOnce(new Error('down'));
  await click('Предложить уточнение');
  m.api.mockRejectedValueOnce(new Error('down'));
  await click('Настроить сравнение');
  expect(screen.queryByText(/Сравнение настроено/)).not.toBeInTheDocument();
  m.api.mockRejectedValueOnce(new Error('down'));
  await click('Загрузить сравнение');
  expect(screen.getByText(/История экспозиций не выдумывается/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Отчёт о неясности'), { target: { value: '' } });
  expect(screen.queryByLabelText('Уточнение автора (для новой генерации)')).not.toBeInTheDocument();
});
it('denies other roles without any data request', () => {
  m.role = 'documentation_owner';
  render(<LiveV4Page />);
  expect(screen.getByText(/Этот раздел доступен/)).toBeInTheDocument();
  expect(m.api).not.toHaveBeenCalled();
});
it('renders individual read errors and never invents proof', async () => {
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith('evidence-timeline')) throw new Error('no proof');
    return {
      items: [],
      unlinked_goals: [{ ...workspaceCard(true), kind: 'goal', id: GOAL }],
      as_of: fx.STAMP,
    };
  });
  m.goal.mockRejectedValue(new Error('no goal'));
  render(<LiveV4Page />);
  await screen.findByText('Рабочий отчёт');
  await click('Подзадачи и доказательства');
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
  expect(screen.queryByText('Доверенный факт')).not.toBeInTheDocument();
});

it('polls a reserved generation and shows the pinned draft preview', async () => {
  m.role = 'buddy';
  m.api.mockResolvedValueOnce(proposal({ status: 'generating', changes: [] }));
  m.api.mockResolvedValueOnce(
    proposal({
      base_revision: 3,
      base_fields: [{ field: 'sections.report-format.text', label: 'Формат', text: 'Исходный черновик' }],
      answered_by: 'primary',
    }),
  );
  render(<LiveV4Page />);
  await selectReport();
  await click('Предложить уточнение');
  expect(screen.getByRole('button', { name: 'Предложить уточнение' })).toBeDisabled();
  expect(await screen.findByText('Было: Исходный черновик')).toBeInTheDocument();
  expect(m.api).toHaveBeenLastCalledWith(`/api/v4/revision-proposals/${PROPOSAL}`, expect.any(Object));
});

it('loads every workspace page before rendering all simultaneous results', async () => {
  m.api.mockResolvedValueOnce({
    items: [workspaceCard()],
    unlinked_goals: [],
    as_of: fx.STAMP,
    next_cursor: 'second',
  });
  m.api.mockResolvedValueOnce({
    items: [{ ...workspaceCard(), id: PREVIEW, title: 'Второй результат' }],
    unlinked_goals: [],
    as_of: fx.STAMP,
    next_cursor: null,
  });
  render(<LiveV4Page />);
  expect(await screen.findByText('Второй результат')).toBeInTheDocument();
  expect(screen.getByText('Рабочий отчёт')).toBeInTheDocument();
  expect(m.api).toHaveBeenLastCalledWith(
    '/api/v4/workspaces?cursor=second',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it('discards a reserved proposal and keeps the human editor available', async () => {
  m.role = 'buddy';
  m.api.mockResolvedValueOnce(proposal());
  render(<LiveV4Page />);
  await selectReport();
  expect(screen.getByRole('link', { name: 'Открыть редактор ТЗ' })).toHaveAttribute(
    'href',
    `#/mentor/briefs/${fx.BRIEF_ID}`,
  );
  await click('Предложить уточнение');
  m.api.mockResolvedValueOnce(proposal({ status: 'discarded', proposal_revision: 2 }));
  await click('Отклонить предложение');
  expect(screen.getByText(/Предложение отклонено/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Применить в черновик' })).toBeDisabled();
});
