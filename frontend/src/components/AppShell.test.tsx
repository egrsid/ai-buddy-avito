import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { users } from '../fixtures/all-states';
import { AppShell, DemoModeNote } from './AppShell';

function renderShell(account: string, route = '/onboarding') {
  const onUserChange = vi.fn();
  const onViewChange = vi.fn();
  render(
    <AppShell
      user={users[account]}
      route={route}
      view="data"
      onUserChange={onUserChange}
      onViewChange={onViewChange}
      sidebar={<p>Сайдбар</p>}
    >
      <p>Контент страницы</p>
    </AppShell>,
  );
  return { onUserChange, onViewChange };
}

describe('AppShell', () => {
  it('по умолчанию четыре понятных роли без технических дополнений', () => {
    renderShell('intern-a');
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Стажёр', 'Наставник', 'Согласующий доступ', 'Владелец документации']);
  });

  it('дополнительные аккаунты доступны отдельно для проверки feedback loop и ACL', () => {
    render(<AppShell user={users['intern-a']} route="/onboarding" view="data" mode="live" onUserChange={() => {}} onViewChange={() => {}}>Демо</AppShell>);
    expect(screen.getAllByRole('option')).toHaveLength(4);
    fireEvent.click(screen.getByLabelText('Дополнительные участники'));
    expect(screen.getAllByRole('option')).toHaveLength(7);
    expect(screen.getByRole('option', { name: 'Второй стажёр' })).toBeInTheDocument();
  });
  it('intern: навигация цель/заявки/чат, активный пункт помечен', () => {
    renderShell('intern-a');
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav).toHaveTextContent('Моя цель');
    expect(nav).toHaveTextContent('Мои заявки');
    expect(nav).toHaveTextContent('AI-помощник');
    expect(screen.getByRole('link', { name: 'Моя цель' })).toHaveAttribute('aria-current', 'page');
  });

  it('buddy: только обращения стажёров', () => {
    renderShell('buddy-a', '/buddy/escalations');
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav).toHaveTextContent('Обращения стажёров');
    expect(nav).not.toHaveTextContent('Моя цель');
  });

  it('approver: только согласования', () => {
    renderShell('approver-a', '/approvals');
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toHaveTextContent('Согласования');
  });

  it('documentation_owner: только пробелы знаний', () => {
    renderShell('docs-owner-a', '/knowledge-gaps');
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toHaveTextContent('Пробелы знаний');
  });

  it('смена демо-аккаунта вызывает onUserChange', () => {
    const { onUserChange } = renderShell('intern-a');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'buddy-a' } });
    expect(onUserChange).toHaveBeenCalledWith('buddy-a');
  });

  it('переключатель состояния экрана вызывает onViewChange', () => {
    const { onViewChange } = renderShell('intern-a');
    fireEvent.click(screen.getByRole('button', { name: 'Ошибка' }));
    expect(onViewChange).toHaveBeenCalledWith('error');
  });

  it('мобильное меню открывается и закрывается', () => {
    renderShell('intern-a');
    const toggle = screen.getByRole('button', { name: 'Открыть меню' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toBeInTheDocument();
    // клик по пункту навигации закрывает меню
    fireEvent.click(screen.getByRole('link', { name: 'Мои заявки' }));
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toBeInTheDocument();
  });

  it('рендерит children и sidebar', () => {
    renderShell('intern-a');
    expect(screen.getByText('Контент страницы')).toBeInTheDocument();
    expect(screen.getByLabelText('Контекст')).toHaveTextContent('Сайдбар');
  });
});

describe('DemoModeNote', () => {
  it('предупреждает о синтетических данных', () => {
    render(<DemoModeNote />);
    expect(screen.getByText(/Демо-режим/)).toBeInTheDocument();
  });
});
