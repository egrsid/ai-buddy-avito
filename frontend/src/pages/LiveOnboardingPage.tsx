import { useState } from 'react';
import { useLiveData } from '../lib/live';
import { createGoal, listGoals, listJourneys } from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { GoalView } from './OnboardingPage';

// RP-FE-02: live-вариант «Моя цель» на Go API.
// Целей нет → предлагаем доступные journeys и создаём goal серверным POST.

export function LiveOnboardingPage() {
  const goals = useLiveData(() => listGoals(), [], []);
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
      <PageHeader title="Моя цель" subtitle="Доступ к тестовой БД и проверка подключения · live API" />
      {goals.state === 'loading' && <Card><LoadingState /></Card>}
      {goals.state === 'error' && (
        <ErrorState message={userMessage(goals.error)} onRetry={goals.refetch} />
      )}
      {goals.state === 'empty' && <JourneyPicker creating={creating} error={createError} onStart={startGoal} />}
      {goals.state === 'data' && goals.data && <GoalView goal={goals.data[0]} />}
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
