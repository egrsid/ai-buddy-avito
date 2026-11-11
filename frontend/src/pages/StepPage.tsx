import { useState } from 'react';
import { ArrowLeft, BookOpen, FlaskConical, MessageSquareWarning, RefreshCw } from 'lucide-react';
import type { Goal } from '../fixtures/all-states';
import { actions, checks, goals } from '../fixtures/all-states';
import { href } from '../lib/router';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import {
  ActionStatusBadge,
  BlockerStatusBadge,
  CheckStatusBadge,
  StateBadge,
} from '../components/StatusBadge';

// Демо-детали шага: зависимости, инструкция, evidence, blocker, проверки,
// action preview/confirm/cancel. Данные — FE fixtures, до подключения Go.

export function StepPage({ goalId, stepId, view }: { goalId: string; stepId: string; view: ViewState }) {
  const goal = goals.find((g) => g.id === goalId) ?? goals[0];
  const step = goal.steps.find((s) => s.id === stepId) ?? goal.steps[0];
  const result = useMockData<Goal>(goal, goal, view);
  const [showPreview, setShowPreview] = useState(false);
  const pendingAction = actions.find((a) => a.status === 'pending_confirmation');

  if (result.state === 'loading') return <Card><LoadingState /></Card>;
  if (result.state === 'error') return <ErrorState onRetry={() => window.location.reload()} />;
  if (result.state === 'empty') {
    return <EmptyState title="Шаг не найден" message="Такого шага нет в маршруте или он вам недоступен." />;
  }

  return (
    <>
      <a
        href={href('/onboarding')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary"
      >
        <ArrowLeft size={16} aria-hidden /> К цели
      </a>
      <PageHeader title={step.title} subtitle={step.description} />

      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StateBadge state={step.status} />
            <span className="text-xs text-text-secondary">версия {step.version}</span>
          </div>

          {step.dependencies.length > 0 && (
            <p className="mb-3 text-sm text-text-secondary">
              Зависит от: {step.dependencies.map((d) => d.step_id).join(', ')} (должен быть проверен)
            </p>
          )}

          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-primary hover:bg-primary-light focus-visible:outline-2 focus-visible:outline-primary"
          >
            <BookOpen size={16} aria-hidden />
            Инструкция (версия {step.instruction_reference.version}) — откроется в drawer после проверки доступа
          </button>

          {step.user_claim && (
            <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-text-secondary">
              Ваша отметка (не является проверкой): «{step.user_claim}»
            </p>
          )}
        </Card>

        {step.blockers.map((blocker) => (
          <Card key={blocker.id} className="border-error/40">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <BlockerStatusBadge status={blocker.status} />
              <code className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-error">{blocker.error_code}</code>
            </div>
            <p className="mb-3 text-sm">
              {blocker.error_code === 'DB_SSL_REQUIRED'
                ? 'Подключение требует SSL. В инструкции этот шаг не описан — гипотеза проверяется.'
                : 'Проверка завершилась ошибкой. Технические детали скрыты намеренно.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {blocker.recovery_actions.includes('retry_check') && (
                <Button variant="secondary">
                  <RefreshCw size={16} className="mr-1 inline" aria-hidden /> Повторить проверку
                </Button>
              )}
              {blocker.recovery_actions.includes('escalate_to_buddy') && (
                <Button variant="secondary" onClick={() => setShowPreview(true)}>
                  <MessageSquareWarning size={16} className="mr-1 inline" aria-hidden /> Спросить наставника
                </Button>
              )}
            </div>
          </Card>
        ))}

        {step.status === 'ready' && (
          <Card>
            <p className="mb-3 text-sm text-text-secondary">
              Проверка выполняется безопасным способом — без произвольных команд.
            </p>
            <Button>
              <FlaskConical size={16} className="mr-1 inline" aria-hidden /> Запустить проверку
            </Button>
          </Card>
        )}

        {showPreview && pendingAction && (
          <Card className="border-primary/40" aria-label="Предпросмотр действия">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">Предпросмотр передачи наставнику</p>
              <ActionStatusBadge status={pendingAction.status} />
            </div>
            <p className="mb-2 text-sm text-text-secondary">
              Наставник получит: цель, шаг, блокер, результаты проверок, разрешённые источники и гипотезы.
              Полная переписка не передаётся.
            </p>
            <div className="mb-3 rounded-xl bg-surface-muted p-3 text-xs text-text-secondary">
              <p>Получатель: Бадди A</p>
              <p>Действует до: {pendingAction.expires_at} (серверное время)</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowPreview(false)}>Подтвердить отправку</Button>
              <Button variant="ghost" onClick={() => setShowPreview(false)}>Отмена</Button>
            </div>
          </Card>
        )}

        {step.evidence.length > 0 && (
          <Card>
            <h3 className="mb-3 font-medium">Evidence</h3>
            <ul className="space-y-2">
              {step.evidence.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <CheckStatusBadge status={e.result === 'passed' ? 'passed' : 'failed'} />
                  <span className="text-text-secondary">
                    {e.method} · {e.observed_at} · {e.source} · синтетические данные
                  </span>
                  {e.invalidated_at && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      устарело {e.invalidated_at}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h3 className="mb-3 font-medium">Проверки</h3>
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <CheckStatusBadge status={c.status} />
                <span className="text-text-secondary">
                  {c.method}
                  {c.observed_at ? ` · ${c.observed_at}` : ''}
                  {c.error_code ? ` · ${c.error_code}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
