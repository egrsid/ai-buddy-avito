import { ArrowLeft } from 'lucide-react';
import type { Escalation } from '../fixtures/all-states';
import { getEscalation, listEscalations } from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { href } from '../lib/router';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { CheckStatusBadge, EscalationStatusBadge } from '../components/StatusBadge';

// v3: внутренние обращения стажёров к наставнику отключены — стажёры пишут в Telegram.
// Старые обращения остаются только для чтения по прежним правам доступа.

export function LiveBuddyEscalationsPage() {
  const escalations = useLiveData(() => listEscalations(), [], []);
  return (
    <>
      <PageHeader title="Архив обращений" subtitle="Обращения до перехода на Telegram · только чтение" />
      {escalations.state === 'loading' && <Card><LoadingState /></Card>}
      {escalations.state === 'error' && (
        <ErrorState message={userMessage(escalations.error)} onRetry={escalations.refetch} />
      )}
      {escalations.state === 'empty' && (
        <EmptyState title="Обращений нет" message="Новые вопросы стажёры присылают вам в Telegram, здесь хранятся только старые." />
      )}
      {escalations.state === 'data' && escalations.data && (
        <ul className="space-y-3">
          {escalations.data.map((e) => (
            <li key={e.id}>
              <a href={href(`/buddy/escalations/${e.id}`)} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="transition-shadow hover:shadow-[0_6px_20px_#17172212]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{e.intern.display_name}</p>
                      <p className="text-sm text-text-secondary">
                        {e.diagnostic_snapshot.goal.title} · {e.diagnostic_snapshot.step.title}
                      </p>
                    </div>
                    <EscalationStatusBadge status={e.status} />
                  </div>
                  <p className="mt-2 text-sm">«{e.diagnostic_snapshot.question}»</p>
                </Card>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function LiveBuddyEscalationDetailPage({ id }: { id: string }) {
  const escalation = useLiveData(() => getEscalation(id), [id], null as Escalation | null);

  if (escalation.state === 'loading') return <Card><LoadingState /></Card>;
  if (escalation.state === 'error') {
    return <ErrorState message={userMessage(escalation.error)} onRetry={escalation.refetch} />;
  }
  if (escalation.state === 'empty' || !escalation.data) {
    return <EmptyState title="Обращение не найдено" message="Оно закрыто или вам не назначено." />;
  }
  const e = escalation.data;
  const snap = e.diagnostic_snapshot;

  return (
    <>
      <a href={href('/buddy/escalations')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К обращениям
      </a>
      <PageHeader title={`Обращение: ${e.intern.display_name}`} subtitle={`Создано ${e.created_at} · версия ${e.version}`} />

      <div className="space-y-4">
        <Card>
          <h3 className="mb-2 font-medium">Вопрос</h3>
          <p className="text-sm">{snap.question}</p>
        </Card>

        <Card>
          <h3 className="mb-3 font-medium">Диагностика (разрешённый снимок)</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2"><dt className="w-28 shrink-0 text-text-secondary">Цель</dt><dd>{snap.goal.title}</dd></div>
            <div className="flex gap-2"><dt className="w-28 shrink-0 text-text-secondary">Шаг</dt><dd>{snap.step.title}</dd></div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-text-secondary">Блокер</dt>
              <dd><code className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-error">{snap.blocker.error_code}</code></dd>
            </div>
          </dl>
          {snap.checks.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-sm font-medium">Проверки</h4>
              <ul className="space-y-1.5 text-sm">
                {snap.checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <CheckStatusBadge status={c.status} />
                    <span className="text-text-secondary">{c.method}{c.error_code ? ` · ${c.error_code}` : ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {snap.hypotheses.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-sm font-medium">Гипотезы</h4>
              <ul className="space-y-1.5 text-sm">
                {snap.hypotheses.map((h, i) => (
                  <li key={i}>
                    {h.text} <span className="text-xs text-text-secondary">(уверенность: {h.confidence})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {snap.instruction_refs.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-sm font-medium">Источники</h4>
              <ul className="space-y-1.5 text-sm">
                {snap.instruction_refs.map((s) => (
                  <li key={s.document_id}>
                    {s.title} (v{s.version})
                    <span className="ml-1 text-xs text-text-secondary">— доступ перепроверяется при открытии</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {e.status === 'resolved' ? (
          <Card>
            <h3 className="mb-2 font-medium">Ваш ответ</h3>
            <p className="text-sm">{e.answer}</p>
            <p className="mt-2 text-xs text-text-secondary">Закрыто {e.resolved_at}</p>
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-text-secondary">
              Обращение осталось без ответа до перехода на Telegram. Ответить здесь больше нельзя — напишите стажёру напрямую.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
