import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { candidates } from '../fixtures/all-states';
import type { Candidate } from '../fixtures/all-states';
import { href } from '../lib/router';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { CandidateStateBadge, EnrichmentBadge } from '../components/StatusBadge';

export function KnowledgeGapsPage({ view }: { view: ViewState }) {
  const result = useMockData<Candidate[]>(candidates, [], view);
  return (
    <>
      <PageHeader
        title="Пробелы знаний"
        subtitle="Повторяющиеся затруднения стажёров — обезличенно, без переписок и логов"
      />
      {result.state === 'loading' && <Card><LoadingState /></Card>}
      {result.state === 'error' && <ErrorState onRetry={() => window.location.reload()} />}
      {result.state === 'empty' && (
        <EmptyState
          title="Предложений нет"
          message="Когда одинаковая ошибка повторится у нескольких стажёров, здесь появится карточка."
        />
      )}
      {result.state === 'data' && result.data && (
        <ul className="space-y-3">
          {result.data.map((c) => (
            <li key={c.id}>
              <a href={href(`/knowledge-gaps/${c.id}`)} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="transition-shadow hover:shadow-[0_6px_20px_#17172212]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{c.step_id}</p>
                      <p className="text-xs text-text-secondary">
                        {c.journey_id} · затронуто стажёров: {c.affected_count}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CandidateStateBadge state={c.state} />
                      <EnrichmentBadge status={c.enrichment_status} />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    <code className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-error">{c.error_code}</code>{' '}
                    {c.hypothesis}
                  </p>
                </Card>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type Decision = 'under_review' | 'accepted' | 'rejected' | 'resolved';

export function KnowledgeGapDetailPage({ id, view }: { id: string; view: ViewState }) {
  const candidate = candidates.find((c) => c.id === id) ?? candidates[0];
  const result = useMockData<Candidate>(candidate, candidate, view);
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);

  if (result.state === 'loading') return <Card><LoadingState /></Card>;
  if (result.state === 'error') return <ErrorState onRetry={() => window.location.reload()} />;
  if (result.state === 'empty') {
    return <EmptyState title="Карточка не найдена" message="Она недоступна в вашей области." />;
  }
  const c = result.data!;

  return (
    <>
      <a href={href('/knowledge-gaps')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К списку
      </a>
      <PageHeader title={`Кандидат: ${c.step_id}`} subtitle={`Создан ${c.created_at} · версия ${c.version}`} />

      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <CandidateStateBadge state={decision ?? c.state} />
            <EnrichmentBadge status={c.enrichment_status} />
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-text-secondary">Маршрут / шаг</dt><dd>{c.journey_id} / {c.step_id}</dd></div>
            <div className="flex gap-2">
              <dt className="w-40 shrink-0 text-text-secondary">Ошибка</dt>
              <dd><code className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-error">{c.error_code}</code></dd>
            </div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-text-secondary">Затронуто</dt><dd>{c.affected_count} стажёра (обезличенно)</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-text-secondary">Инструкция</dt><dd>документ {c.instruction_refs[0].document_id.slice(0, 13)}… · версия {c.instruction_refs[0].version}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-text-secondary">Гипотеза</dt><dd>{c.hypothesis}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-text-secondary">Предложенный fix</dt><dd>{c.proposed_fix}</dd></div>
          </dl>
          {c.state === 'resolved' && c.resolved_reference && (
            <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-success">
              Решён: исправленная версия {c.resolved_reference.version} проверена человеком.
            </p>
          )}
        </Card>

        {c.state !== 'resolved' && !decision && (
          <Card>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Основание решения</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={1000}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!reason.trim()} onClick={() => setDecision('under_review')}>
                Взять в работу
              </Button>
              <Button disabled={!reason.trim()} onClick={() => setDecision('accepted')}>
                Принять гипотезу
              </Button>
              <Button variant="danger" disabled={!reason.trim()} onClick={() => setDecision('rejected')}>
                Отклонить
              </Button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Принятие не публикует изменения автоматически. «Решён» требует проверенной человеком
              исправленной версии документа.
            </p>
          </Card>
        )}

        {decision && (
          <Card>
            <p className="text-sm">
              Решение сохранено: <CandidateStateBadge state={decision} />
            </p>
            <p className="mt-1 text-xs text-text-secondary">Основание: {reason}</p>
          </Card>
        )}
      </div>
    </>
  );
}
