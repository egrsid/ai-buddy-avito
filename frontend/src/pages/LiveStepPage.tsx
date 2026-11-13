import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, FlaskConical, MessageSquareWarning, RefreshCw } from 'lucide-react';
import type { z } from 'zod';
import type { Action, Step } from '../fixtures/all-states';
import { KnowledgeDocument } from '../contracts/public';
import {
  confirmAction as apiConfirmAction,
  cancelAction as apiCancelAction,
  createAction,
  createCheck,
  createConversation,
  getAction,
  getGoal,
  getKnowledge,
  getStep,
  getStepActions,
} from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { href } from '../lib/router';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { ActionCard } from '../components/ActionCard';
import { SourceDrawer } from '../components/SourceDrawer';
import { BlockerStatusBadge, CheckStatusBadge, StateBadge } from '../components/StatusBadge';

// RP-FE-02: live-вариант страницы шага.
// Данные — GET step/actions; проверка — POST checks; эскалация — POST actions
// (snapshot собирается из разрешённых данных шага, Go пересобирает/валидирует).
// Confirm/cancel — только кнопкой ActionCard конкретного action.id.

type KnowledgeDocumentT = z.infer<typeof KnowledgeDocument>;

export function LiveStepPage({ goalId, stepId }: { goalId: string; stepId: string }) {
  const step = useLiveData(() => getStep(goalId, stepId), [goalId, stepId], null as Step | null);
  const [action, setAction] = useState<Action | null>(null);
  const [drawerDoc, setDrawerDoc] = useState<KnowledgeDocumentT | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sslMode, setSslMode] = useState<'disable' | 'require'>('disable');
  const [reason, setReason] = useState('Нужен доступ к синтетической БД команды A.');

  // Опрос executing/unknown действия до терминального статуса.
  useEffect(() => {
    if (!action || (action.status !== 'executing' && action.status !== 'unknown')) return;
    const timer = setInterval(() => {
      getAction(action.id)
        .then((fresh) => setAction(fresh))
        .catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [action]);

  if (step.state === 'loading') return <Card><LoadingState /></Card>;
  if (step.state === 'error') return <ErrorState message={userMessage(step.error)} onRetry={step.refetch} />;
  if (step.state === 'empty' || !step.data) {
    return <EmptyState title="Шаг не найден" message="Такого шага нет в маршруте или он вам недоступен." />;
  }
  const s = step.data;

  const openInstruction = () => {
    getKnowledge(s.instruction_reference.document_id)
      .then(setDrawerDoc)
      .catch((e) => setNotice(userMessage(e, 'Не удалось открыть источник.')));
  };

  const runCheck = async () => {
    setNotice(null);
    try {
      await createCheck(goalId, stepId, {
        method: s.verification_method,
        options: s.verification_method === 'mock_db_connection' ? { ssl_mode: sslMode } : {},
        expected_version: s.version,
      });
      step.refetch();
    } catch (e) {
      setNotice(userMessage(e, 'Проверка не запустилась.'));
    }
  };

  const requestAccess = async () => {
    setNotice(null);
    try {
      const goal = await getGoal(goalId);
      const conversation = await createConversation(goalId, s.id);
      const created = await createAction({
        conversation_id: conversation.id,
        goal_id: goalId,
        step_id: s.id,
        type: 'create_access_request',
        parameters: {
          resource_id: goal.resource_id,
          requested_role: 'db_reader',
          reason,
          additional_fields: {},
        },
      });
      setAction(created);
    } catch (e) {
      setNotice(userMessage(e, 'Не удалось подготовить заявку.'));
    }
  };

  const escalate = async () => {
    setNotice(null);
    const blocker = s.blockers.find((b) => b.status === 'open') ?? s.blockers[0];
    if (!blocker) {
      setNotice('Эскалация возможна только из контекста активного блокера.');
      return;
    }
    const question = 'Нужна помощь наставника с этим шагом.';
    try {
      // Драфт привязан к диалогу цель/шаг; snapshot Go пересобирает и валидирует.
      const conversation = await createConversation(goalId, s.id);
      const created = await createAction({
        conversation_id: conversation.id,
        goal_id: goalId,
        step_id: s.id,
        type: 'escalate_to_buddy',
        parameters: {
          question,
          diagnostic_snapshot: {
            goal: { id: goalId, title: 'Цель' },
            step: { id: s.id, title: s.title },
            blocker: { id: blocker.id, type: blocker.type, error_code: blocker.error_code },
            checks: [],
            attempted_actions: [],
            instruction_refs: [],
            hypotheses: [],
            question,
          },
        },
      });
      setAction(created);
    } catch (e) {
      setNotice(userMessage(e, 'Не удалось подготовить передачу наставнику.'));
    }
  };

  const confirm = async (id: string) => {
    try {
      setAction(await apiConfirmAction(id));
    } catch (e) {
      setNotice(userMessage(e, 'Подтверждение не прошло.'));
    }
  };

  const cancel = async (id: string) => {
    try {
      setAction(await apiCancelAction(id));
    } catch (e) {
      setNotice(userMessage(e, 'Отмена не прошла.'));
    }
  };

  return (
    <>
      <a href={href('/onboarding')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К цели
      </a>
      <PageHeader title={s.title} subtitle={s.description} />

      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StateBadge state={s.status} />
            <span className="text-xs text-text-secondary">версия {s.version}</span>
          </div>
          {s.dependencies.length > 0 && (
            <p className="mb-3 text-sm text-text-secondary">
              Зависит от: {s.dependencies.map((d) => d.step_id).join(', ')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openInstruction}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-primary hover:bg-primary-light focus-visible:outline-2 focus-visible:outline-primary"
            >
              <BookOpen size={16} aria-hidden />
              Инструкция (версия {s.instruction_reference.version})
            </button>
            <a
              href={href(`/chat/${goalId}/${s.id}`)}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-primary hover:bg-primary-light focus-visible:outline-2 focus-visible:outline-primary"
            >
              <MessageSquareWarning size={16} aria-hidden />
              Диалог этого шага
            </a>
          </div>
          {s.user_claim && (
            <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-text-secondary">
              Ваша отметка (не является проверкой): «{s.user_claim}»
            </p>
          )}
        </Card>

        {notice && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>
        )}

        {s.blockers.map((blocker) => (
          <Card key={blocker.id} className="border-error/40">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <BlockerStatusBadge status={blocker.status} />
              <code className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-error">{blocker.error_code}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              {blocker.recovery_actions.includes('create_access_request') && (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm">
                    Основание заявки
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-border px-3 py-2"
                    />
                  </label>
                  <Button onClick={requestAccess}>Запросить доступ</Button>
                </div>
              )}
              {s.verification_method === 'mock_db_connection' && blocker.recovery_actions.includes('retry_check') && (
                <label className="text-sm">
                  SSL
                  <select
                    aria-label="Режим SSL"
                    value={sslMode}
                    onChange={(event) => setSslMode(event.target.value as 'disable' | 'require')}
                    className="ml-2 rounded-xl border border-border px-2 py-2"
                  >
                    <option value="disable">disable</option>
                    <option value="require">require</option>
                  </select>
                </label>
              )}
              {blocker.recovery_actions.includes('retry_check') && (
                <Button variant="secondary" onClick={runCheck}>
                  <RefreshCw size={16} className="mr-1 inline" aria-hidden /> Повторить проверку
                </Button>
              )}
              {blocker.recovery_actions.includes('escalate_to_buddy') && (
                <Button variant="secondary" onClick={escalate}>
                  <MessageSquareWarning size={16} className="mr-1 inline" aria-hidden /> Спросить наставника
                </Button>
              )}
            </div>
          </Card>
        ))}

        {s.status === 'ready' && (
          <Card>
            <p className="mb-3 text-sm text-text-secondary">
              Проверка выполняется безопасным способом — без произвольных команд.
            </p>
            {s.verification_method === 'mock_db_connection' && (
              <label className="mb-3 block text-sm">
                SSL
                <select
                  aria-label="Режим SSL"
                  value={sslMode}
                  onChange={(event) => setSslMode(event.target.value as 'disable' | 'require')}
                  className="ml-2 rounded-xl border border-border px-2 py-2"
                >
                  <option value="disable">disable</option>
                  <option value="require">require</option>
                </select>
              </label>
            )}
            <Button onClick={runCheck}>
              <FlaskConical size={16} className="mr-1 inline" aria-hidden /> Запустить проверку
            </Button>
          </Card>
        )}

        {action && <ActionCard action={action} onConfirm={confirm} onCancel={cancel} />}

        {s.evidence.length > 0 && (
          <Card>
            <h3 className="mb-3 font-medium">Evidence</h3>
            <ul className="space-y-2">
              {s.evidence.map((e) => (
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
      </div>

      <SourceDrawer
        open={drawerDoc !== null}
        title={drawerDoc?.title ?? ''}
        content={drawerDoc?.content ?? ''}
        version={drawerDoc?.version ?? s.instruction_reference.version}
        onClose={() => setDrawerDoc(null)}
      />
    </>
  );
}

// Подсказка доступных действий шага (allowlist с сервера).
export function LiveStepActionsHint({ goalId, stepId }: { goalId: string; stepId: string }) {
  const actions = useLiveData(() => getStepActions(goalId, stepId), [goalId, stepId], []);
  if (actions.state !== 'data' || !actions.data) return null;
  return (
    <p className="text-xs text-text-secondary">
      Допустимые действия: {actions.data.join(', ')}
    </p>
  );
}
