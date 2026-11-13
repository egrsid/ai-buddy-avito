import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goalBlocked } from '../fixtures/all-states';
import { LiveOnboardingPage } from './LiveOnboardingPage';

const mocks = vi.hoisted(() => ({
  listJourneys: vi.fn(),
  createGoal: vi.fn(),
  getGoal: vi.fn(),
}));
const v3 = vi.hoisted(() => ({ listGoalSummaries: vi.fn() }));

vi.mock('../lib/endpoints', () => mocks);
vi.mock('../lib/v3', () => v3);

const journeys = [
  { journey_id: 'db-access-team-a', version: 1, title: 'Доступ к БД', resource_id: 'db-team-a-test' },
];

function summary(n: number, patch: Record<string, unknown> = {}) {
  return {
    id: `0000004${n}-0000-4000-8000-00000000004${n}`,
    title: `Цель ${n}`,
    journey_id: 'db-access-team-a',
    journey_version: 1,
    status: 'blocked',
    version: 3,
    progress: { verified: 1, total: 3, percent: 33 },
    step_count: 3,
    updated_at: '2026-11-13T10:00:00Z',
    ...patch,
  };
}

describe('LiveOnboardingPage · карточки целей', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    v3.listGoalSummaries.mockResolvedValue({ items: [summary(1), summary(2, { status: 'verified', progress: { verified: 3, total: 3, percent: 100 } })], next_cursor: null });
    mocks.listJourneys.mockResolvedValue(journeys);
    mocks.createGoal.mockResolvedValue(goalBlocked);
    mocks.getGoal.mockResolvedValue(goalBlocked);
  });

  it('каждая цель — своя карточка с прогрессом от сервера', async () => {
    render(<LiveOnboardingPage />);
    expect(await screen.findByText('Цель 1')).toBeInTheDocument();
    expect(screen.getByText('Цель 2')).toBeInTheDocument();
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['33', '100']);
    expect(screen.getByText('Проверено 1 из 3 подзадач (33%)')).toBeInTheDocument();
    expect(mocks.getGoal).not.toHaveBeenCalled();
  });

  it('раскрытие независимое, с aria-expanded и памятью на вкладку', async () => {
    const { unmount } = render(<LiveOnboardingPage />);
    const [first, second] = await screen.findAllByRole('button', { name: /Раскрыть подзадачи/ });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(first);
    expect(await screen.findByRole('list', { name: 'Шаги цели' })).toBeInTheDocument();
    expect(mocks.getGoal).toHaveBeenCalledWith(summary(1).id);
    expect(screen.getByRole('button', { name: /Свернуть подзадачи/ })).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    unmount();
    render(<LiveOnboardingPage />);
    expect(await screen.findByRole('button', { name: /Свернуть подзадачи/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Свернуть подзадачи/ }));
    expect(screen.queryByRole('list', { name: 'Шаги цели' })).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('buddy-expanded-goals:intern-a') ?? '[]')).toEqual([]);
  });

  it('исчезнувшая цель удаляется из раскрытых', async () => {
    sessionStorage.setItem('buddy-expanded-goals:intern-a', JSON.stringify(['gone', summary(1).id]));
    render(<LiveOnboardingPage />);
    await screen.findByRole('list', { name: 'Шаги цели' });
    expect(JSON.parse(sessionStorage.getItem('buddy-expanded-goals:intern-a') ?? '[]')).toEqual([summary(1).id]);
  });

  it('ошибка подзадач — локальный retry', async () => {
    mocks.getGoal.mockRejectedValueOnce(new Error('down'));
    render(<LiveOnboardingPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Раскрыть подзадачи/ }))[0]);
    expect(await screen.findByText('Подзадачи не загрузились')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('list', { name: 'Шаги цели' })).toBeInTheDocument();
  });

  it('постраничная подгрузка без дублей', async () => {
    v3.listGoalSummaries
      .mockResolvedValueOnce({ items: [summary(1)], next_cursor: 'abc' })
      .mockResolvedValueOnce({ items: [summary(1), summary(3)], next_cursor: null });
    render(<LiveOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё цели' }));
    expect(await screen.findByText('Цель 3')).toBeInTheDocument();
    expect(v3.listGoalSummaries).toHaveBeenLastCalledWith('abc');
    expect(screen.getAllByText('Цель 1')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Показать ещё цели' })).not.toBeInTheDocument();
  });

  it('ошибка подгрузки — сообщение, карточки на месте', async () => {
    v3.listGoalSummaries
      .mockResolvedValueOnce({ items: [summary(1)], next_cursor: 'abc' })
      .mockRejectedValueOnce(new Error('down'));
    render(<LiveOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё цели' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить ещё цели');
    expect(screen.getByText('Цель 1')).toBeInTheDocument();
  });

  it('целей нет: выбор маршрута и создание цели', async () => {
    v3.listGoalSummaries.mockResolvedValueOnce({ items: [], next_cursor: null });
    render(<LiveOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    expect(mocks.createGoal).toHaveBeenCalledWith('db-access-team-a', 1);
    expect(await screen.findByText('Цель 1')).toBeInTheDocument();
  });

  it('ошибка создания: сообщение без слома экрана', async () => {
    v3.listGoalSummaries.mockResolvedValue({ items: [], next_cursor: null });
    mocks.createGoal.mockRejectedValue(new Error('down'));
    render(<LiveOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать цель');
  });

  it('все цели проверены — можно начать новую', async () => {
    v3.listGoalSummaries.mockResolvedValue({ items: [summary(2, { status: 'verified', progress: { verified: 3, total: 3, percent: 100 } })], next_cursor: null });
    render(<LiveOnboardingPage />);
    expect(await screen.findByText('Все цели проверены — можно начать новую')).toBeInTheDocument();
  });

  it('цель без подзадач: 0%, а не 100%', async () => {
    v3.listGoalSummaries.mockResolvedValue({ items: [summary(4, { status: 'unverified', step_count: 0, progress: { verified: 0, total: 0, percent: 0 } })], next_cursor: null });
    render(<LiveOnboardingPage />);
    const card = (await screen.findByText('Цель 4')).closest('section')!;
    expect(within(card).getByText('Подзадачи ещё не заданы · 0%')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Подзадачи ещё не заданы');
  });

  it('ошибка списка — retry', async () => {
    v3.listGoalSummaries.mockRejectedValueOnce(new Error('down'));
    render(<LiveOnboardingPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Цель 1')).toBeInTheDocument();
  });
});
