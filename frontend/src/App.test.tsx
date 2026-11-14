import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { candidates, escalations, goalBlocked, goals, users } from './fixtures/all-states';
import { App } from './App';

const api = vi.hoisted(() => ({
  demoLogin: vi.fn(),
  logout: vi.fn(),
  listGoals: vi.fn(),
  listJourneys: vi.fn(),
  getStep: vi.fn(),
  getStepActions: vi.fn(),
  listAccessRequests: vi.fn(),
  listEscalations: vi.fn(),
  getEscalation: vi.fn(),
  listCandidates: vi.fn(),
  getCandidate: vi.fn(),
  listFrictionGroups: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  me: vi.fn().mockRejectedValue(new Error('anon')),
}));

vi.mock('./lib/endpoints', () => api);

const STATS = {
  view: 'mentor', source_kind: 'technical', as_of: '2026-11-13T10:00:00Z', timezone: 'Europe/Moscow',
  window: { from: '2026-10-15T21:00:00Z', to: '2026-11-13T10:00:00Z', days: 30 }, privacy_threshold: 2,
  summary: { affected_interns: 0, observations: 0, open_items: 0, suppressed: false }, rows: [], daily: [], next_cursor: null,
};
const v3 = vi.hoisted(() => ({
  listGoalSummaries: vi.fn(),
  getMentorContact: vi.fn(),
  listMessageOrigins: vi.fn(),
  listAssignments: vi.fn(),
  getAssignment: vi.fn(),
  listBriefs: vi.fn(),
  getBrief: vi.fn(),
  listReports: vi.fn(),
  getReport: vi.fn(),
  getStatistics: vi.fn(),
}));
vi.mock('./lib/v3', () => v3);

const CONV = { id: '00000030-0000-4000-8000-000000000030', goal_id: null, step_id: null, created_at: '2026-11-11T09:00:00Z' };

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

async function switchToLive() {
  fireEvent.click(screen.getByRole('button', { name: 'Live API' }));
  await act(async () => {
    await Promise.resolve();
  });
}

describe('App', () => {
  it('/onboarding: цель + контекстный сайдбар', async () => {
    window.location.hash = '#/onboarding';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Моя цель' })).toBeInTheDocument();
    expect(screen.getByLabelText('Контекст')).toHaveTextContent('Прогресс цели');
    expect(screen.getByText(/Демо-режим/)).toBeInTheDocument();
  });

  it('маршруты переключаются по hash', async () => {
    window.location.hash = '#/onboarding';
    render(<App />);
    await screen.findByRole('heading', { name: 'Моя цель' });

    go('#/requests');
    expect(await screen.findByRole('heading', { name: 'Мои заявки' })).toBeInTheDocument();

    go('#/approvals');
    expect(await screen.findByRole('heading', { name: 'Согласования' })).toBeInTheDocument();

    go('#/buddy/escalations');
    expect(await screen.findByText('Связь с наставником перенесена в Telegram.')).toBeInTheDocument();

    go('#/knowledge-gaps');
    expect(await screen.findByRole('heading', { name: 'Пробелы знаний' })).toBeInTheDocument();

    go('#/chat');
    expect(await screen.findByRole('heading', { name: 'AI-помощник' })).toBeInTheDocument();
  });

  it('неизвестный маршрут показывает чат', async () => {
    window.location.hash = '#/unknown';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'AI-помощник' })).toBeInTheDocument();
  });

  it('маршрут шага открывает StepPage с сайдбаром', async () => {
    const goal = goals[0];
    const step = goal.steps[0];
    window.location.hash = `#/onboarding/${goal.id}/steps/${step.id}`;
    render(<App />);
    expect(await screen.findByRole('heading', { name: step.title })).toBeInTheDocument();
    expect(screen.getByLabelText('Контекст')).toHaveTextContent('Прогресс цели');
  });

  it('детальные маршруты: обращение и кандидат', async () => {
    window.location.hash = `#/buddy/escalations/${escalations[0].id}`;
    render(<App />);
    expect(await screen.findByText('Связь с наставником перенесена в Telegram.')).toBeInTheDocument();
  });

  it('переключение демо-состояния на «Пусто»', async () => {
    window.location.hash = '#/requests';
    render(<App />);
    await screen.findByRole('heading', { name: 'Мои заявки' });
    fireEvent.click(screen.getByRole('button', { name: 'Пусто' }));
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
  });

  it('детальный маршрут кандидата на gap', async () => {
    window.location.hash = `#/knowledge-gaps/${candidates[0].id}`;
    render(<App />);
    expect(await screen.findByRole('heading', { name: /Кандидат:/ })).toBeInTheDocument();
  });

  it('переключение демо-аккаунта меняет навигацию под роль', async () => {
    window.location.hash = '#/onboarding';
    render(<App />);
    await screen.findByRole('heading', { name: 'Моя цель' });
    fireEvent.change(screen.getByLabelText('Демо-аккаунт'), { target: { value: 'buddy-a' } });
    expect(await screen.findByRole('link', { name: 'Понятность заданий' })).toBeInTheDocument();
    // Разделы v3 в fixtures не подделываются данными: предлагаем Live API.
    expect(await screen.findByRole('heading', { name: 'Раздел доступен в режиме Live API' })).toBeInTheDocument();
  });
});

describe('App · live-режим', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.demoLogin.mockResolvedValue({ user: users['intern-a'], csrf_token: 'tok' });
    api.logout.mockResolvedValue(undefined);
    api.listGoals.mockResolvedValue([]);
    api.listJourneys.mockResolvedValue([]);
    api.getStep.mockResolvedValue(goalBlocked.steps[2]);
    api.getStepActions.mockResolvedValue(['retry_check', 'escalate_to_buddy']);
    api.listAccessRequests.mockResolvedValue([]);
    api.listEscalations.mockResolvedValue(escalations);
    api.getEscalation.mockResolvedValue(escalations[0]);
    api.listCandidates.mockResolvedValue(candidates);
    api.getCandidate.mockResolvedValue(candidates[0]);
    api.listFrictionGroups.mockResolvedValue([]);
    api.listConversations.mockResolvedValue([CONV]);
    api.createConversation.mockResolvedValue(CONV);
    api.listMessages.mockResolvedValue([]);
    api.me.mockRejectedValue(new Error('anon'));
    v3.listGoalSummaries.mockResolvedValue({ items: [], next_cursor: null });
    v3.getMentorContact.mockResolvedValue({ status: 'missing' });
    v3.listMessageOrigins.mockResolvedValue([]);
    v3.listAssignments.mockResolvedValue([]);
    v3.listBriefs.mockResolvedValue([]);
    v3.listReports.mockResolvedValue([]);
    v3.getAssignment.mockRejectedValue(new Error('not found'));
    v3.getBrief.mockRejectedValue(new Error('not found'));
    v3.getReport.mockRejectedValue(new Error('not found'));
    v3.getStatistics.mockResolvedValue(STATS);
  });

  it('переключение в live делает demo-login и показывает живой чат', async () => {
    window.location.hash = '#/chat';
    render(<App />);
    await switchToLive();
    expect(api.demoLogin).toHaveBeenCalledWith('intern-a');
    expect(await screen.findByRole('heading', { name: 'AI-помощник' })).toBeInTheDocument();
    expect(await screen.findByText('Сообщений пока нет')).toBeInTheDocument();
    // DemoModeNote скрыт в live-режиме
    expect(screen.queryByText(/Демо-режим/)).not.toBeInTheDocument();
  });

  it('live: все маршруты рендерят live-страницы', async () => {
    window.location.hash = '#/chat';
    render(<App />);
    await switchToLive();
    await screen.findByText('Сообщений пока нет');

    go('#/onboarding');
    expect(await screen.findByText('Маршрутов нет')).toBeInTheDocument();

    go('#/requests');
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();

    go('#/approvals');
    expect(await screen.findByText('Нет заявок на согласование')).toBeInTheDocument();

    go('#/buddy/escalations');
    expect(await screen.findByText('Связь с наставником перенесена в Telegram.')).toBeInTheDocument();

    go('#/tasks');
    expect(await screen.findByText('Заданий пока нет')).toBeInTheDocument();
    go('#/tasks/00000031-0000-4000-8000-000000000031');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    go('#/mentor/briefs');
    expect(await screen.findByText('ТЗ пока нет')).toBeInTheDocument();
    go('#/mentor/briefs/00000032-0000-4000-8000-000000000032');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    go('#/mentor/reports');
    expect(await screen.findByText('Отчётов нет')).toBeInTheDocument();
    go('#/mentor/reports/00000033-0000-4000-8000-000000000033');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    go('#/mentor/stats');
    expect(await screen.findByText('Затруднений нет')).toBeInTheDocument();
    go('#/docs/stats');
    expect(await screen.findByRole('heading', { name: 'Статистика затруднений' })).toBeInTheDocument();

    go('#/knowledge-gaps');
    expect(await screen.findByRole('heading', { name: 'Пробелы знаний' })).toBeInTheDocument();

    const step = goalBlocked.steps[2];
    go(`#/onboarding/${goalBlocked.id}/steps/${step.id}`);
    expect(await screen.findByRole('heading', { name: step.title })).toBeInTheDocument();

    go(`#/buddy/escalations/${escalations[0].id}`);
    expect(await screen.findByText('Связь с наставником перенесена в Telegram.')).toBeInTheDocument();

    go(`#/knowledge-gaps/${candidates[0].id}`);
    expect(await screen.findByRole('heading', { name: /Кандидат:/ })).toBeInTheDocument();
  });

  it('live: ошибка входа показывает sessionError и не роняет приложение', async () => {
    api.demoLogin.mockRejectedValue(new Error('down'));
    window.location.hash = '#/chat';
    render(<App />);
    await switchToLive();
    expect(
      await screen.findByText('Не удалось войти в live-режим: backend недоступен или вход запрещён.'),
    ).toBeInTheDocument();
  });
});
