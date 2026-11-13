import type { z } from 'zod';
import { useState } from 'react';
import { useLiveData } from '../lib/live';
import { createGoal, getGoal, listJourneys } from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { GoalSummaryList } from '../contracts/v3';
import { read3 } from '../lib/v3';
import { GoalView } from './OnboardingPage';

// RP-FE-02: live-вариант «Моя цель» на Go API.
// Целей нет → предлагаем доступные journeys и создаём goal серверным POST.

export function LiveOnboardingPage() {
  const goals = useLiveData(async signal => {
    const all = []; let cursor: string | null = null;
    do { const page: z.infer<typeof GoalSummaryList> = await read3('/goals' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), GoalSummaryList, signal); all.push(...page.items); cursor = page.next_cursor; } while (cursor);
    return all;
  }, [], []);
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const startGoal = async (journeyId: string, version: number) => {
    setCreating(journeyId);
    setCreateError(null);
    try {
      await createGoal(journeyId, version);
      goals.refetch();
    } catch (e) {
      setCreateError(userMessage(e, 'Не удалось создать цель.'));
    } finally {
      setCreating(null);
    }
  };

  return (
    <>
      <PageHeader title="Мои цели" subtitle="Проверенный прогресс и следующий шаг. Раскройте цель, чтобы увидеть подзадачи." />
      {goals.state === 'loading' && <Card><LoadingState /></Card>}
      {goals.state === 'error' && (
        <ErrorState message={userMessage(goals.error)} onRetry={goals.refetch} />
      )}
      {goals.state === 'empty' && <JourneyPicker creating={creating} error={createError} onStart={startGoal} />}
      {goals.state === 'data' && goals.data && <div className="space-y-4">{goals.data.map(g => <GoalCard key={g.id} goal={g} />)}</div>}
    </>
  );
}

function JourneyPicker({
  creating,
  error,
  onStart,
}: {
  creating: string | null;
  error: string | null;
  onStart: (journeyId: string, version: number) => void;
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
      <h2 className="mb-1 font-medium">Цель пока не выбрана</h2>
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

function GoalCard({ goal }: { goal: { id: string; title: string; progress: { verified: number; total: number; percent: number } } }) {
 const [expanded, setExpanded] = useState(false);
 const detail = useLiveData(() => getGoal(goal.id), [goal.id], null, { enabled: expanded });
 return <Card><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{goal.title}</h2><span className="font-semibold text-primary">{goal.progress.percent}%</span></div><div className="my-3 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={goal.title} aria-valuenow={goal.progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary" style={{width: `${goal.progress.percent}%`}} /></div><p className="mb-3 text-xs text-text-secondary">Проверено {goal.progress.verified} из {goal.progress.total} обязательных шагов</p><button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary-light focus-visible:outline-2" aria-expanded={expanded} aria-controls={`steps-${goal.id}`} onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть подзадачи' : 'Показать подзадачи'}</button>{expanded && <div id={`steps-${goal.id}`} className="mt-4">{detail.state === 'loading' && <LoadingState />}{detail.state === 'error' && <ErrorState message={userMessage(detail.error)} onRetry={detail.refetch} />}{detail.data && <GoalView goal={detail.data} />}</div>}</Card>;
}
