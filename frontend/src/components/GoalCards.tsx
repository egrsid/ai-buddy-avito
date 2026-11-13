import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { z } from 'zod';
import type { GoalSummary } from '../contracts/v3';
import type { Goal } from '../fixtures/all-states';
import { getGoal } from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { Button, Card, ErrorState, LoadingState } from './ui';
import { StateBadge } from './StatusBadge';
import { StepList } from '../pages/OnboardingPage';

// V3-GOALS-FE: каждая цель — отдельная карточка с прогрессом из Go. Подзадачи грузятся
// существующим GET /goals/{id} при раскрытии. Раскрытие — только состояние экрана
// (на вкладку и аккаунт), прогресс не меняет и сам не сворачивается при обновлении.

type GoalSummaryT = z.infer<typeof GoalSummary>;

function storageKey(accountId: string) {
  return `buddy-expanded-goals:${accountId}`;
}

export function readExpanded(accountId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey(accountId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeExpanded(accountId: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(storageKey(accountId), JSON.stringify([...ids]));
  } catch {
    // Хранилище недоступно (приватный режим) — раскрытие живёт до перезагрузки.
  }
}

export function GoalCards({ goals, accountId }: { goals: GoalSummaryT[]; accountId: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(accountId));

  // Исчезнувшие цели убираем из набора раскрытых.
  useEffect(() => {
    const known = new Set(goals.map((g) => g.id));
    setExpanded((current) => {
      const next = new Set([...current].filter((id) => known.has(id)));
      if (next.size === current.size) return current;
      writeExpanded(accountId, next);
      return next;
    });
  }, [goals, accountId]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeExpanded(accountId, next);
      return next;
    });
  };

  return (
    <ul className="space-y-4" aria-label="Мои цели">
      {goals.map((goal) => (
        <li key={goal.id}>
          <GoalCard goal={goal} open={expanded.has(goal.id)} onToggle={() => toggle(goal.id)} />
        </li>
      ))}
    </ul>
  );
}

const statusHint: Record<GoalSummaryT['status'], string> = {
  unverified: 'Начало пути',
  ready: 'Можно выполнять следующий шаг',
  blocked: 'Есть препятствие — откройте подзадачи',
  waiting_external: 'Ждём внешнего решения',
  verified: 'Цель подтверждена проверками',
};

function GoalCard({ goal, open, onToggle }: { goal: GoalSummaryT; open: boolean; onToggle: () => void }) {
  const panelId = `goal-steps-${goal.id}`;
  const { verified, total, percent } = goal.progress;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{goal.title}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            {statusHint[goal.status]} · маршрут {goal.journey_id} v{goal.journey_version}
          </p>
        </div>
        <StateBadge state={goal.status} />
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={total === 0 ? 'Подзадачи ещё не заданы' : `Проверено ${verified} из ${total}`}
        aria-label={`Прогресс цели «${goal.title}»`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          {total === 0 ? 'Подзадачи ещё не заданы · 0%' : `Проверено ${verified} из ${total} подзадач (${percent}%)`}
        </p>
        <Button variant="ghost" onClick={onToggle} ariaExpanded={open} ariaControls={panelId}>
          <span className="inline-flex items-center gap-1">
            {open ? 'Свернуть подзадачи' : 'Раскрыть подзадачи'}
            {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </span>
        </Button>
      </div>
      {open && <GoalSteps goalId={goal.id} version={goal.version} panelId={panelId} />}
    </Card>
  );
}

function GoalSteps({ goalId, version, panelId }: { goalId: string; version: number; panelId: string }) {
  // Перечитываем при смене версии цели, чтобы шаги не расходились с прогрессом.
  const detail = useLiveData(() => getGoal(goalId), [goalId, version], null as Goal | null);
  return (
    <div className="mt-4" id={panelId}>
      {detail.state === 'loading' && <LoadingState label="Загружаем подзадачи…" />}
      {detail.state === 'error' && (
        <ErrorState title="Подзадачи не загрузились" message={userMessage(detail.error)} onRetry={detail.refetch} />
      )}
      {detail.state === 'data' && detail.data && <StepList goal={detail.data} />}
    </div>
  );
}
