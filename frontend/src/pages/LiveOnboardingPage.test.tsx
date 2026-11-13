import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goalBlocked } from '../fixtures/all-states';
import { LiveOnboardingPage } from './LiveOnboardingPage';

const mocks = vi.hoisted(() => ({
  listGoals: vi.fn(),
  listJourneys: vi.fn(),
  createGoal: vi.fn(),
}));

vi.mock('../lib/endpoints', () => mocks);

const journeys = [
  { journey_id: 'db-access-team-a', version: 1, title: 'Доступ к БД', resource_id: 'db-team-a-test' },
];

describe('LiveOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listGoals.mockResolvedValue([goalBlocked]);
    mocks.listJourneys.mockResolvedValue(journeys);
    mocks.createGoal.mockResolvedValue(goalBlocked);
  });

  it('data: показывает цель из API', async () => {
    render(<LiveOnboardingPage />);
    expect(await screen.findByText('Следующий шаг')).toBeInTheDocument();
    expect(screen.getByText('Следующий шаг')).toBeInTheDocument();
    expect(mocks.listGoals).toHaveBeenCalledTimes(1);
  });

  it('empty: выбор маршрута и создание цели', async () => {
    mocks.listGoals.mockResolvedValueOnce([]); // первый ответ пустой, после создания — цель
    render(<LiveOnboardingPage />);
    const start = await screen.findByRole('button', { name: 'Начать' });
    fireEvent.click(start);
    expect(mocks.createGoal).toHaveBeenCalledWith('db-access-team-a', 1);
    // после создания — refetch, цель появляется
    expect(await screen.findByText('Следующий шаг')).toBeInTheDocument();
  });

  it('empty + ошибка создания: сообщение без слома экрана', async () => {
    mocks.listGoals.mockResolvedValue([]);
    mocks.createGoal.mockRejectedValue(new Error('down'));
    render(<LiveOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Начать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать цель');
  });

  it('error: состояние ошибки с retry', async () => {
    mocks.listGoals.mockRejectedValueOnce(new Error('down'));
    render(<LiveOnboardingPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Следующий шаг')).toBeInTheDocument();
  });
});
