import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { escalations } from '../fixtures/all-states';
import type { Escalation } from '../fixtures/all-states';
import { href } from '../lib/router';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { CheckStatusBadge, EscalationStatusBadge } from '../components/StatusBadge';

export function BuddyEscalationsPage({ view }: { view: ViewState }) {
  const result = useMockData<Escalation[]>(escalations, [], view);
  return (
    <>
      <PageHeader title="Обращения стажёров" subtitle="Только назначенные вам стажёры и разрешённые снимки" />
      {result.state === 'loading' && <Card><LoadingState /></Card>}
      {result.state === 'error' && <ErrorState onRetry={() => window.location.reload()} />}
      {result.state === 'empty' && (
        <EmptyState title="Обращений нет" message="Когда стажёр передаст вопрос, он появится здесь с диагностикой." />
      )}
      {result.state === 'data' && result.data && (
        <ul className="space-y-3">
          {result.data.map((e) => (
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

export function BuddyEscalationDetailPage({ id, view }: { id: string; view: ViewState }) {
  const escalation = escalations.find((e) => e.id === id) ?? escalations[0];
  const result = useMockData<Escalation>(escalation, escalation, view);
  const [answer, setAnswer] = useState('');
  const [sent, setSent] = useState(false);

  if (result.state === 'loading') return <Card><LoadingState /></Card>;
  if (result.state === 'error') return <ErrorState onRetry={() => window.location.reload()} />;
  if (result.state === 'empty') {
    return <EmptyState title="Обращение не найдено" message="Оно закрыто или вам не назначено." />;
  }
  const e = result.data!;
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
          <h4 className="mb-2 mt-4 text-sm font-medium">Проверки</h4>
          <ul className="space-y-1.5 text-sm">
            {snap.checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <CheckStatusBadge status={c.status} />
                <span className="text-text-secondary">{c.method}{c.error_code ? ` · ${c.error_code}` : ''}</span>
              </li>
            ))}
          </ul>
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
                    <a href={href(`/chat?doc=${s.document_id}`)} className="text-primary underline-offset-2 hover:underline">
                      {s.title} (v{s.version})
                    </a>
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
        ) : sent ? (
          <Card>
            <h3 className="mb-2 font-medium">Ваш ответ</h3>
            <p className="text-sm">{answer}</p>
            <p className="mt-2 text-xs text-text-secondary">
              Обращение закрыто. Ответ не публикуется в базу знаний автоматически.
            </p>
          </Card>
        ) : (
          <Card>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Ответ стажёру</span>
              <textarea
                value={answer}
                onChange={(ev) => setAnswer(ev.target.value)}
                rows={4}
                maxLength={4000}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                placeholder="Например: включи sslmode=require и повтори проверку"
              />
            </label>
            <div className="mt-3">
              <Button disabled={!answer.trim()} onClick={() => setSent(true)}>
                Ответить и закрыть
              </Button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Ответ не делает шаг проверенным — стажёр повторяет проверку сам.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
