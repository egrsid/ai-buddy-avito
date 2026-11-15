import { useState } from 'react';
import type { z } from 'zod';
import type { GoalSummary } from '../contracts/v3';
import { useLiveData } from '../lib/live';
import { createGoal, listJourneys } from '../lib/endpoints';
import { listGoalSummaries } from '../lib/v3';
import { userMessage } from '../lib/api';
import { useDataMode } from '../lib/dataMode';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { GoalCards, rememberExpanded } from '../components/GoalCards';

// V3: «Мои цели» — все цели стажёра карточками (GET /api/v3/goals, по 20 на страницу).
// Целей нет или все проверены → можно начать разрешённый маршрут серверным POST.

type GoalSummaryT = z.infer<typeof GoalSummary>;

interface GoalPage {
  items: GoalSummaryT[];
  next: string | null;
}

export function LiveOnboardingPage() {
  const { accountId } = useDataMode();
  const first = useLiveData<GoalPage>(async () => {
    const items: GoalSummaryT[] = [];
    let cursor: string | undefined;
    do { const page = await listGoalSummaries(cursor); items.push(...page.items); cursor = page.next_cursor ?? undefined; } while (cursor);
    // Earlier rehearsals may contain repeated instances; keep their history in the DB.
    const unique = new Map<string, GoalSummaryT>();
    for (const goal of items) { const old = unique.get(goal.journey_id); if (!old || (old.status === 'verified' && goal.status !== 'verified')) unique.set(goal.journey_id, goal); }
    return { items: [...unique.values()], next: null };
  }, [], { items: [], next: null });
  const [more, setMore] = useState<GoalPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = () => {
    setMore(null);
    first.refetch();
  };

  const startGoal = async (journeyId: string, version: number) => {
    setCreating(journeyId);
    setCreateError(null);
    try {
      const goal = await createGoal(journeyId, version);
      if (goal?.id) rememberExpanded(accountId, goal.id);
      refresh();
    } catch (e) {
      setCreateError(userMessage(e, 'Не удалось создать цель.'));
    } finally {
      setCreating(null);
    }
  };

  const page = first.data;
  const goals = page ? [...page.items, ...(more?.items ?? [])] : [];
  const next = more ? more.next : page?.next ?? null;

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const fresh = await listGoalSummaries(next);
      // Курсор стабилен: новые и уже показанные цели не дублируются.
      const known = new Set(goals.map((g) => g.id));
      setMore({ items: [...(more?.items ?? []), ...fresh.items.filter((g) => !known.has(g.id))], next: fresh.next_cursor });
    } catch (e) {
      setMoreError(userMessage(e, 'Не удалось загрузить ещё цели.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const allVerified = goals.length > 0 && goals.every((g) => g.status === 'verified');

  return (
    <>
      <PageHeader title="Мои цели" subtitle="Прогресс считает сервер по проверкам · раскройте карточку, чтобы увидеть подзадачи" />
      {first.state === 'loading' && <Card><LoadingState /></Card>}
      {first.state === 'error' && <ErrorState message={userMessage(first.error)} onRetry={refresh} />}
      {page && goals.length === 0 && first.state !== 'loading' && first.state !== 'error' && (
        <JourneyPicker creating={creating} error={createError} onStart={startGoal} />
      )}
      {goals.length > 0 && first.state !== 'error' && (
        <>
          <GoalCards goals={goals} accountId={accountId} />
          {next && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? 'Загружаем…' : 'Показать ещё цели'}
              </Button>
            </div>
          )}
          {moreError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{moreError}</p>}
          {allVerified && (
            <Card className="mt-6"><h2 className="font-semibold text-success">Все текущие задачи выполнены. Поздравляем!</h2><p className="mt-2 text-sm text-text-secondary">Новые цели появятся, когда будут назначены. Выполненные цели остаются доступны для просмотра.</p></Card>
          )}
        </>
      )}
    </>
  );
}

function JourneyPicker({
  creating,
  error,
  onStart,
  title = 'Цель пока не выбрана',
}: {
  creating: string | null;
  error: string | null;
  onStart: (journeyId: string, version: number) => void;
  title?: string;
}) {
  const journeys = useLiveData(() => listJourneys(), [], []);

  if (journeys.state === 'loading') return <Card><LoadingState /></Card>;
  if (journeys.state === 'error') {
    return <ErrorState message={userMessage(journeys.error)} onRetry={journeys.refetch} />;
  }
  if (journeys.state === 'empty' || !journeys.data) {
    return <EmptyState title="Маршрутов нет" message="Для вашей роли пока не разрешён ни один маршрут." />;
  }
  return (
    <Card>
      <h2 className="mb-1 font-medium">{title}</h2>
      <p className="mb-4 text-sm text-text-secondary">Выберите разрешённый маршрут — сервер привяжет ресурс.</p>
      {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
      <ul className="space-y-2">
        {journeys.data.map((j) => (
          <li key={j.journey_id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{j.title}</p>
              <p className="text-xs text-text-secondary">{j.journey_id} · версия {j.version}</p>
            </div>
            <Button disabled={creating !== null} onClick={() => onStart(j.journey_id, j.version)}>
              {creating === j.journey_id ? 'Создаём…' : 'Начать'}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
