import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BookOpenCheck,
  Bot,
  CheckSquare,
  ClipboardList,
  FileQuestion,
  Menu,
  MessageSquare,
  Target,
  X,
} from 'lucide-react';
import { href } from '../lib/router';
import type { ViewState } from '../lib/useMockData';
import type { User } from '../fixtures/all-states';
import { users } from '../fixtures/all-states';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function navFor(user: User): NavItem[] {
  if (user.roles.includes('intern')) {
    return [
      { to: '/onboarding', label: 'Моя цель', icon: <Target size={20} /> },
      { to: '/requests', label: 'Мои заявки', icon: <ClipboardList size={20} /> },
      { to: '/chat', label: 'AI-помощник', icon: <MessageSquare size={20} /> },
    ];
  }
  if (user.roles.includes('buddy')) {
    return [{ to: '/buddy/escalations', label: 'Обращения стажёров', icon: <MessageSquare size={20} /> }];
  }
  if (user.roles.includes('access_approver')) {
    return [{ to: '/approvals', label: 'Согласования', icon: <CheckSquare size={20} /> }];
  }
  return [{ to: '/knowledge-gaps', label: 'Пробелы знаний', icon: <BookOpenCheck size={20} /> }];
}

const viewLabels: Record<ViewState, string> = {
  data: 'Данные',
  loading: 'Загрузка',
  error: 'Ошибка',
  empty: 'Пусто',
};

export function AppShell({
  user,
  route,
  view,
  onUserChange,
  onViewChange,
  mode = 'fixtures',
  onModeChange,
  children,
  sidebar,
}: {
  user: User;
  route: string;
  view: ViewState;
  onUserChange: (account: string) => void;
  onViewChange: (view: ViewState) => void;
  mode?: 'fixtures' | 'live';
  onModeChange?: (mode: 'fixtures' | 'live') => void;
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const nav = navFor(user);

  const navBlock = (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <Bot size={26} className="text-primary" aria-hidden />
        <p className="text-lg font-bold">
          Avito <span className="text-primary">AI-buddy</span>
          <span className="ml-1.5 rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">
            beta
          </span>
        </p>
      </div>

      <label className="mb-4 block px-2">
        <span className="mb-1 block text-xs text-text-secondary">Демо-аккаунт</span>
        <select
          value={user.account_id}
          onChange={(e) => onUserChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        >
          {Object.values(users).map((u) => (
            <option key={u.account_id} value={u.account_id}>
              {u.display_name} ({u.roles.join(', ')})
            </option>
          ))}
        </select>
      </label>

      <nav aria-label="Основная навигация" className="flex-1 space-y-1">
        {nav.map((item) => {
          const active = route === item.to || route.startsWith(`${item.to}/`);
          return (
            <a
              key={item.to}
              href={href(item.to)}
              aria-current={active ? 'page' : undefined}
              onClick={() => setNavOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                active ? 'bg-primary-light text-primary' : 'text-text-primary hover:bg-surface-muted'
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="mt-4 rounded-2xl bg-primary-light p-4">
        <div className="mb-2 flex items-center gap-2">
          <Bot size={22} className="text-primary" aria-hidden />
          <p className="text-sm font-semibold">Твой AI-buddy</p>
        </div>
        <p className="text-xs leading-5 text-text-secondary">
          Помогаю довести цель до проверенного результата и связать с наставником.
        </p>
      </div>

      <div className="mt-4 px-2">
        <span className="mb-1 block text-xs text-text-secondary">Источник данных</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Источник данных">
          {(['fixtures', 'live'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange?.(m)}
              aria-pressed={mode === m}
              className={`rounded-lg px-2 py-1 text-xs font-medium ${
                mode === m ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:bg-border'
              }`}
            >
              {m === 'fixtures' ? 'Fixtures' : 'Live API'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'fixtures' && (
        <div className="mt-4 px-2">
          <span className="mb-1 block text-xs text-text-secondary">Состояние экрана (демо)</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Демо-состояние данных">
            {(Object.keys(viewLabels) as ViewState[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onViewChange(v)}
                aria-pressed={view === v}
                className={`rounded-lg px-2 py-1 text-xs font-medium ${
                  view === v ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:bg-border'
                }`}
              >
                {viewLabels[v]}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen">
      <button
        type="button"
        aria-label={navOpen ? 'Закрыть меню' : 'Открыть меню'}
        onClick={() => setNavOpen(!navOpen)}
        className="fixed left-4 top-4 z-40 rounded-xl border border-border bg-surface p-2 md:hidden"
      >
        {navOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-surface p-4 transition-transform md:static md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navBlock}
      </aside>

      <div className="flex flex-1 justify-center gap-6 px-4 py-6 md:px-8">
        <main className="w-full max-w-3xl pt-10 md:pt-0">{children}</main>
        {sidebar && (
          <aside className="hidden w-80 shrink-0 space-y-4 xl:block" aria-label="Контекст">
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}

export function DemoModeNote() {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs text-text-secondary">
      <FileQuestion size={14} aria-hidden />
      Демо-режим: синтетические данные и mock-проверки, реальные доступы не выдаются.
    </p>
  );
}
