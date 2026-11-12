import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { escalations, goals } from './fixtures/all-states';
import { App } from './App';

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
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
    expect(await screen.findByRole('heading', { name: 'Обращения стажёров' })).toBeInTheDocument();

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
    expect(await screen.findByRole('heading', { name: /Обращение:/ })).toBeInTheDocument();
  });

  it('переключение демо-состояния на «Пусто»', async () => {
    window.location.hash = '#/requests';
    render(<App />);
    await screen.findByRole('heading', { name: 'Мои заявки' });
    fireEvent.click(screen.getByRole('button', { name: 'Пусто' }));
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
  });
});
