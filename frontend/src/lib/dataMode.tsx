import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from './endpoints';
import { demoLogin, logout as apiLogout, me } from './endpoints';
import type { User } from '../fixtures/all-states';
import { users as fixtureUsers } from '../fixtures/all-states';

// RP-FE-02: источник данных приложения.
// fixtures — офлайн-демо на FE fixtures (поведение RP-FE-01);
// live — реальный Go API (cookie-сессия + CSRF через endpoints).
// Смена аккаунта в live выполняет demo-login (только local/test окружение Go).

export type DataMode = 'fixtures' | 'live';

interface DataModeValue {
  mode: DataMode;
  /** false, пока первый auth/me не ответил. Live-страницы до этого не монтируются. */
  ready: boolean;
  setMode: (mode: DataMode) => Promise<void> | void;
  /** Пользователь текущего аккаунта: fixture в fixtures-режиме, сессия в live. */
  user: User;
  accountId: string;
  switchAccount: (accountId: string) => Promise<void> | void;
  sessionError: string | null;
}

const DataModeContext = createContext<DataModeValue | null>(null);

const LOGIN_ERROR = 'Не удалось войти в live-режим: backend недоступен или вход запрещён.';

export function DataModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataMode>('fixtures');
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState('intern-a');
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const userChose = useRef(false);

  // Cookie HttpOnly переживает reload. Пока auth/me не ответил, live-страницы не монтируются,
  // иначе первые GET уходят без сессии и рисуют 401 как настоящие данные.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await me();
        if (cancelled || userChose.current) return;
        setSession(restored);
        setAccountId(restored.user.account_id);
        setMode('live');
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginAs = useCallback(async (id: string) => {
    setSessionError(null);
    const next = await demoLogin(id);
    setSession(next);
    setAccountId(next.user.account_id);
    setMode('live');
    return next;
  }, []);

  const switchAccount = useCallback(
    async (id: string) => {
      userChose.current = true;
      if (mode !== 'live') {
        setAccountId(id);
        return;
      }
      try {
        await loginAs(id);
      } catch {
        setSessionError(LOGIN_ERROR);
      }
    },
    [mode, loginAs],
  );

  const changeMode = useCallback(
    async (next: DataMode) => {
      userChose.current = true;
      if (next === 'live') {
        try {
          await loginAs(accountId);
        } catch {
          setSession(null);
          setMode('fixtures');
          setSessionError(LOGIN_ERROR);
        }
        return;
      }
      setMode('fixtures');
      setSession(null);
      setSessionError(null);
      try {
        await apiLogout();
      } catch {
        // Выход из уже закрытой сессии не возвращает пользователя в live.
      }
    },
    [accountId, loginAs],
  );

  const value = useMemo<DataModeValue>(() => {
    const user = mode === 'live' && session ? session.user : (fixtureUsers[accountId] ?? fixtureUsers['intern-a']);
    return {
      mode,
      ready,
      setMode: changeMode,
      user: user as User,
      accountId,
      switchAccount,
      sessionError,
    };
  }, [mode, ready, changeMode, session, accountId, switchAccount, sessionError]);

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode(): DataModeValue {
  const ctx = useContext(DataModeContext);
  if (!ctx) {
    // Страницы и компоненты тестируются без провайдера — безопасный дефолт fixtures.
    return {
      mode: 'fixtures',
      ready: true,
      setMode: () => undefined,
      user: fixtureUsers['intern-a'],
      accountId: 'intern-a',
      switchAccount: () => undefined,
      sessionError: null,
    };
  }
  return ctx;
}
