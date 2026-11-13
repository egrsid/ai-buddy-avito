import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from './endpoints';
import { demoLogin, me, logout as apiLogout } from './endpoints';
import { ApiError } from './api';
import type { User } from '../fixtures/all-states';
import { users as fixtureUsers } from '../fixtures/all-states';

// RP-FE-02: источник данных приложения.
// fixtures — офлайн-демо на FE fixtures (поведение RP-FE-01);
// live — реальный Go API (cookie-сессия + CSRF через endpoints).
// Смена аккаунта в live выполняет demo-login (только local/test окружение Go).

export type DataMode = 'fixtures' | 'live';

interface DataModeValue {
  mode: DataMode;
  setMode: (mode: DataMode) => void;
  /** Пользователь текущего аккаунта: fixture в fixtures-режиме, сессия в live. */
  user: User;
  accountId: string;
  switchAccount: (accountId: string) => Promise<void> | void;
  sessionError: string | null;
  sessionReady: boolean;
}

const DataModeContext = createContext<DataModeValue | null>(null);

// v3: по умолчанию — живой Go API (разделы ТЗ, отчётов и статистики есть только там).
// VITE_DATA_MODE=live принудительно включает live (демо-стенд); fixtures — офлайн-демо,
// его можно выбрать переключателем, выбор помнится до закрытия вкладки.
export function defaultMode(): DataMode {
  const preset = import.meta.env.VITE_DATA_MODE;
  if (preset === 'live') return 'live';
  const stored = sessionStorage.getItem('buddy-data-mode');
  if (stored === 'live' || stored === 'fixtures') return stored;
  return preset === 'fixtures' ? 'fixtures' : 'live';
}

export function DataModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataMode>(() => defaultMode());
  const [accountId, setAccountId] = useState('intern-a');
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(mode === 'fixtures');
  const generation = useRef(0);
  const initialMode = useRef(mode);

  const loginAs = useCallback(async (id: string) => {
    const attempt = ++generation.current;
    setSessionReady(false);
    setSessionError(null);
    try {
      const next = await demoLogin(id);
      if (attempt !== generation.current) return;
      setSession(next);
      setAccountId(next.user.account_id);
      setSessionReady(true);
    } catch {
      if (attempt !== generation.current) return;
      setSession(null);
      setSessionError('Не удалось войти в live-режим: backend недоступен или вход запрещён.');
    }
  }, []);

  useEffect(() => {
    if (initialMode.current !== 'live') return;
    let active = true;
    const attempt = ++generation.current;
    me().then((next) => {
      if (!active || attempt !== generation.current) return;
      setSession(next);
      setAccountId(next.user.account_id);
      setSessionReady(true);
    }).catch((error) => {
      if (!active || attempt !== generation.current) return;
      if (error instanceof ApiError && error.status === 401) void loginAs('intern-a');
      else setSessionError('Не удалось восстановить сессию. Повторите вход в Live API.');
    });
    return () => { active = false; };
  }, [loginAs]);

  const switchAccount = useCallback(
    (id: string) => {
      if (mode === 'live') return loginAs(id);
      setAccountId(id);
      return undefined;
    },
    [mode, loginAs],
  );

  const changeMode = useCallback(
    (next: DataMode) => {
      ++generation.current;
      sessionStorage.setItem('buddy-data-mode', next);
      setSessionError(null);
      setMode(next);
      if (next === 'live') void loginAs(accountId);
      else {
        setSessionReady(true);
        setSession(null);
        void apiLogout().catch(() => undefined);
      }
    },
    [accountId, loginAs],
  );

  const value = useMemo<DataModeValue>(() => {
    const user = mode === 'live' && session ? session.user : (fixtureUsers[accountId] ?? fixtureUsers['intern-a']);
    return {
      mode,
      setMode: changeMode,
      user: user as User,
      accountId,
      switchAccount,
      sessionError,
      sessionReady,
    };
  }, [mode, changeMode, session, accountId, switchAccount, sessionError, sessionReady]);

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode(): DataModeValue {
  const ctx = useContext(DataModeContext);
  if (!ctx) {
    // Страницы и компоненты тестируются без провайдера — безопасный дефолт fixtures.
    return {
      mode: 'fixtures',
      setMode: () => undefined,
      user: fixtureUsers['intern-a'],
      accountId: 'intern-a',
      switchAccount: () => undefined,
      sessionError: null,
      sessionReady: true,
    };
  }
  return ctx;
}
