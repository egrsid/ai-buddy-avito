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

  it.each(['live', 'fixtures'] as const)('дополнительные аккаунты доступны отдельно для проверки feedback loop и ACL (%s)', (mode) => {
    render(<AppShell user={users['intern-a']} route="/onboarding" view="data" mode={mode} onUserChange={() => {}} onViewChange={() => {}}>Демо</AppShell>);
    expect(screen.getAllByRole('option')).toHaveLength(4);
    fireEvent.click(screen.getByLabelText('Дополнительные участники'));
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'Стажёр', 'Наставник', 'Согласующий доступ', 'Владелец документации',
      'Второй стажёр', 'Стажёр другой команды', 'Наставник другой команды',
    ]);
  });

  it('источник данных переключается и в демо-сборке, состояние экрана — в fixtures', () => {
    vi.stubEnv('VITE_DATA_MODE', 'live');
    const onModeChange = vi.fn();
    const onViewChange = vi.fn();
    render(<AppShell user={users['intern-a']} route="/onboarding" view="data" mode="fixtures" onModeChange={onModeChange} onUserChange={() => {}} onViewChange={onViewChange}>Демо</AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Live API' }));
    expect(onModeChange).toHaveBeenCalledWith('live');
    const states = screen.getByRole('group', { name: 'Демо-состояние данных' });
    expect(states).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('в fixtures видны наставник и стажёр другой команды', () => {
    renderShell('buddy-b', '/buddy/escalations');
    expect(screen.getByRole('option', { name: 'Наставник другой команды' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toHaveTextContent('Архив обращений');
  });
  it('intern: цели/задания/заявки/чат, активный пункт помечен', () => {
    renderShell('intern-a');
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav).toHaveTextContent('Мои цели');
    expect(nav).toHaveTextContent('Мои задания');
    expect(nav).toHaveTextContent('Мои заявки');
    expect(nav).toHaveTextContent('AI-помощник');
    expect(screen.getByRole('link', { name: 'Мои цели' })).toHaveAttribute('aria-current', 'page');
  });

  it('buddy v3: задания, понятность, статистика и архив обращений без ответа', () => {
    renderShell('buddy-a', '/mentor/reports/abc');
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav).toHaveTextContent('Мои задания');
    expect(nav).toHaveTextContent('Понятность заданий');
    expect(nav).toHaveTextContent('Статистика');
    expect(nav).toHaveTextContent('Архив обращений');
    expect(nav).not.toHaveTextContent('Мои цели');
    expect(screen.getByRole('link', { name: 'Понятность заданий' })).toHaveAttribute('aria-current', 'page');
  });

  it('approver: только согласования', () => {
    renderShell('approver-a', '/approvals');
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toHaveTextContent('Согласования');
  });

  it('documentation_owner: пробелы знаний и статистика', () => {
    renderShell('docs-owner-a', '/knowledge-gaps');
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toHaveTextContent('Пробелы знаний');
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toHaveTextContent('Статистика');
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
