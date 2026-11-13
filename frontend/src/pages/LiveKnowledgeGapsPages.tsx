import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Candidate } from '../fixtures/all-states';
import { getCandidate, listCandidates, listFrictionGroups, reviewCandidate } from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { href } from '../lib/router';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { CandidateStateBadge, EnrichmentBadge } from '../components/StatusBadge';

// RP-FE-02: live-варианты пробелов знаний для documentation_owner.

export function LiveKnowledgeGapsPage() {
  const candidates = useLiveData(() => listCandidates(), [], []);
  const friction = useLiveData(() => listFrictionGroups(), [], []);
  return (
    <>
      <PageHeader
        title="Пробелы знаний"
        subtitle="Повторяющиеся затруднения стажёров — обезличенно · live API"
      />

      {friction.state === 'data' && friction.data && friction.data.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-2 text-sm font-medium">Агрегаты затруднений</h3>
          <ul className="space-y-1.5 text-sm">
            {friction.data.map((f) => (
              <li key={`${f.journey_id}-${f.step_id}-${f.error_code}`} className="flex flex-wrap gap-2">
                <code className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-error">{f.error_code}</code>
                <span className="text-text-secondary">
                  {f.journey_id} / {f.step_id} · стажёров: {f.affected_count}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {candidates.state === 'loading' && <Card><LoadingState /></Card>}
      {candidates.state === 'error' && (
        <ErrorState message={userMessage(candidates.error)} onRetry={candidates.refetch} />
      )}
      {candidates.state === 'empty' && (
        <EmptyState
          title="Предложений нет"
          message="Когда одинаковая ошибка повторится у нескольких стажёров, здесь появится карточка."
        />
      )}
      {candidates.state === 'data' && candidates.data && (
        <ul className="space-y-3">
          {candidates.data.map((c) => (
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

type Decision = 'under_review' | 'accepted' | 'rejected';

export function LiveKnowledgeGapDetailPage({ id }: { id: string }) {
  const candidate = useLiveData(() => getCandidate(id), [id], null as Candidate | null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (candidate.state === 'loading') return <Card><LoadingState /></Card>;
  if (candidate.state === 'error') {
    return <ErrorState message={userMessage(candidate.error)} onRetry={candidate.refetch} />;
  }
  if (candidate.state === 'empty' || !candidate.data) {
    return <EmptyState title="Карточка не найдена" message="Она недоступна в вашей области." />;
  }
  const c = candidate.data;

  const decide = async (decision: Decision) => {
    setBusy(true);
    setNotice(null);
    try {
      await reviewCandidate(c.id, { decision, reason, expected_version: c.version });
      candidate.refetch();
    } catch (e) {
      setNotice(userMessage(e, 'Решение не сохранено.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <a href={href('/knowledge-gaps')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К списку
      </a>
      <PageHeader title={`Кандидат: ${c.step_id}`} subtitle={`Создан ${c.created_at} · версия ${c.version}`} />

      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <CandidateStateBadge state={c.state} />
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

        {notice && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>}

        {c.state !== 'resolved' && (
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
              <Button variant="secondary" disabled={!reason.trim() || busy} onClick={() => decide('under_review')}>
                Взять в работу
              </Button>
              <Button disabled={!reason.trim() || busy} onClick={() => decide('accepted')}>
                Принять гипотезу
              </Button>
              <Button variant="danger" disabled={!reason.trim() || busy} onClick={() => decide('rejected')}>
                Отклонить
              </Button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Принятие не публикует изменения автоматически. «Решён» требует проверенной человеком
              исправленной версии документа.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
