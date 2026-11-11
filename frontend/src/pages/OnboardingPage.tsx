import { useState } from 'react';
import { ArrowRight, ChevronRight, Lock } from 'lucide-react';
import type { Goal } from '../fixtures/all-states';
import { goals } from '../fixtures/all-states';
import { href } from '../lib/router';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { BlockerStatusBadge, StateBadge } from '../components/StatusBadge';

const fixtureLabels: Record<string, string> = {
  blocked: 'Блокер (SSL)',
  ready: 'Готов к проверке',
  waiting_external: 'Ждём согласование',
  verified: 'Цель проверена',
  unverified: 'Начало пути',
};

export function OnboardingPage({ view }: { view: ViewState }) {
  const [fixtureKey, setFixtureKey] = useState('blocked');
  const goal = goals.find((g) => g.status === fixtureKey) ?? goals[0];
  const result = useMockData<Goal>(goal, goal, view);

  return (
    <>
      <PageHeader title="Моя цель" subtitle="Доступ к тестовой БД и проверка подключения" />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Сценарий демо-цели">
        <span className="text-xs text-text-secondary">Сценарий:</span>
        {Object.entries(fixtureLabels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFixtureKey(key)}
            aria-pressed={fixtureKey === key}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              fixtureKey === key ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:bg-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {result.state === 'loading' && <Card><LoadingState /></Card>}
      {result.state === 'error' && <ErrorState onRetry={() => window.location.reload()} />}
      {result.state === 'empty' && (
        <EmptyState
          title="Цель пока не выбрана"
          message="Когда появится разрешённая цель, здесь будет маршрут с шагами и проверками."
        />
      )}
      {result.state === 'data' && result.data && <GoalView goal={result.data} />}
    </>
  );
}

function GoalView({ goal }: { goal: Goal }) {
  const nextStep = goal.steps.find((s) => s.status === 'ready' || s.status === 'blocked');
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Получить доступ к БД и проверить подключение</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Маршрут {goal.journey_id} · версия {goal.journey_version} · ресурс {goal.resource_id}
            </p>
          </div>
          <StateBadge state={goal.status} />
        </div>
        <div
          role="progressbar"
          aria-valuenow={goal.progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Прогресс цели"
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${goal.progress.percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          Проверено {goal.progress.verified} из {goal.progress.total} шагов ({goal.progress.percent}%)
        </p>
      </Card>

      {nextStep && (
        <Card className="border-primary/30 bg-primary-light/40">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">Следующий шаг</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{nextStep.title}</p>
              <p className="text-sm text-text-secondary">{nextStep.description}</p>
            </div>
            <a href={href(`/onboarding/${goal.id}/steps/${nextStep.id}`)}>
              <Button>
                Открыть <ArrowRight size={16} className="ml-1 inline" aria-hidden />
              </Button>
            </a>
          </div>
        </Card>
      )}

      <ol className="space-y-3" aria-label="Шаги цели">
        {goal.steps.map((step, i) => (
          <li key={step.id}>
            <a
              href={href(`/onboarding/${goal.id}/steps/${step.id}`)}
              className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Card className="transition-shadow hover:shadow-[0_6px_20px_#17172212]">
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text-secondary"
                  >
                    {step.status === 'verified' ? '✓' : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{step.title}</p>
                      <StateBadge state={step.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-text-secondary">{step.description}</p>
                    {step.blockers.map((b) => (
                      <p key={b.id} className="mt-1 flex items-center gap-2 text-xs text-error">
                        <BlockerStatusBadge status={b.status} /> {b.error_code}
                      </p>
                    ))}
                  </div>
                  {step.status === 'unverified' && step.dependencies.length > 0 ? (
                    <Lock size={18} className="shrink-0 text-text-secondary" aria-label="Зависит от предыдущего шага" />
                  ) : (
                    <ChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden />
                  )}
                </div>
              </Card>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
