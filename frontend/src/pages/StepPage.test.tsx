import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { goals } from '../fixtures/all-states';
import { StepPage } from './StepPage';

const blockedGoal = goals.find((g) => g.steps.some((s) => s.blockers.length > 0))!;
const blockedStep = blockedGoal.steps.find((s) => s.blockers.length > 0)!;
const readyGoal = goals.find((g) => g.steps.some((s) => s.status === 'ready'))!;
const readyStep = readyGoal.steps.find((s) => s.status === 'ready')!;

function renderBlocked() {
  return render(<StepPage goalId={blockedGoal.id} stepId={blockedStep.id} view="data" />);
}

describe('StepPage', () => {
  it('data: заголовок шага, блокер, evidence и проверки', async () => {
    renderBlocked();
    expect(await screen.findByRole('heading', { name: blockedStep.title })).toBeInTheDocument();
    expect(screen.getAllByText('DB_SSL_REQUIRED').length).toBeGreaterThan(0);
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('Проверки')).toBeInTheDocument();
  });

  it('инструкция открывается в drawer и закрывается Escape', async () => {
    renderBlocked();
    fireEvent.click(await screen.findByRole('button', { name: /Инструкция/ }));
    expect(screen.getByRole('dialog', { name: 'Источник: Синтетическая инструкция подключения' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('эскалация: preview → подтверждение → выполнение → успех', async () => {
    renderBlocked();
    fireEvent.click(await screen.findByRole('button', { name: /Спросить наставника/ }));
    expect(screen.getByText('Передача вопроса наставнику')).toBeInTheDocument();
    expect(screen.getByText('Ждёт подтверждения')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(screen.getByRole('status')).toHaveTextContent('Выполняется, результат появится автоматически');

    expect(
      await screen.findByText(/Вопрос передан наставнику/, undefined, { timeout: 2500 }),
    ).toBeInTheDocument();
  });

  it('эскалация: отмена убирает карточку', async () => {
    renderBlocked();
    fireEvent.click(await screen.findByRole('button', { name: /Спросить наставника/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByText('Передача вопроса наставнику')).not.toBeInTheDocument();
  });

  it('ready-шаг: кнопка запуска проверки', async () => {
    render(<StepPage goalId={readyGoal.id} stepId={readyStep.id} view="data" />);
    expect(await screen.findByRole('button', { name: /Запустить проверку/ })).toBeInTheDocument();
  });

  it('error: состояние ошибки', async () => {
    render(<StepPage goalId={blockedGoal.id} stepId={blockedStep.id} view="error" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить данные');
  });

  it('empty: шаг не найден', async () => {
    render(<StepPage goalId={blockedGoal.id} stepId={blockedStep.id} view="empty" />);
    expect(await screen.findByText('Шаг не найден')).toBeInTheDocument();
  });
});
