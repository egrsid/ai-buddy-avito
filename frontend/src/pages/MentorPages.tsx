import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Archive, FilePlus2, Send, Sparkles } from 'lucide-react';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { href, navigate } from '../lib/router';
import type { BriefContentT, TaskAssignmentT, TaskBriefT, TaskClarityReportT } from '../lib/v3';
import {
  archiveBrief,
  assignBrief,
  createBrief,
  getBrief,
  getReport,
  listAssignments,
  listBriefs,
  listMentorInterns,
  listReports,
  publishBrief,
  reviewReport,
  saveDraft,
} from '../lib/v3';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { CandidateStateBadge } from '../components/StatusBadge';
import { BriefEditor, emptyBrief } from '../components/BriefEditor';
import { REASONS } from './InternTaskPages';

// V3 кабинет наставника: свои ТЗ (черновик → публикация → архив), назначения стажёрам
// и обобщённые отчёты о понятности. Отчёт не показывает, кто из стажёров что отметил.

const briefStateLabel: Record<TaskBriefT['state'], string> = {
  draft: 'Черновик',
  published: 'Опубликовано',
  archived: 'В архиве',
};

function BriefStateBadge({ state }: { state: TaskBriefT['state'] }) {
  const tone = state === 'published' ? 'bg-green-50 text-success' : state === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-surface-muted text-text-secondary';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{briefStateLabel[state]}</span>;
}

export function MentorBriefsPage() {
  const briefs = useLiveData(() => listBriefs(), [], []);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (content: BriefContentT) => {
    setBusy(true);
    setError(null);
    try {
      const brief = await createBrief(content);
      navigate(`/mentor/briefs/${brief.id}`);
    } catch (e) {
      setError(userMessage(e, 'ТЗ не сохранилось.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Мои задания" subtitle="ТЗ для стажёров: черновик, публикация версии, назначение" />
      {!creating && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>
            <FilePlus2 size={16} className="mr-1 inline" aria-hidden /> Новое ТЗ
          </Button>
        </div>
      )}
      {creating && (
        <Card className="mb-4">
          <h2 className="mb-3 font-medium">Новое ТЗ — черновик</h2>
          {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
          <BriefEditor initial={emptyBrief()} submitLabel="Сохранить черновик" busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />
        </Card>
      )}
      {briefs.state === 'loading' && <Card><LoadingState /></Card>}
      {briefs.state === 'error' && <ErrorState message={userMessage(briefs.error)} onRetry={briefs.refetch} />}
      {briefs.state === 'empty' && !creating && (
        <EmptyState title="ТЗ пока нет" message="Создайте первое задание: стажёры увидят его после публикации и назначения." />
      )}
      {briefs.state === 'data' && briefs.data && (
        <ul className="space-y-3">
          {briefs.data.map((b) => (
            <li key={b.id}>
              <a href={href(`/mentor/briefs/${b.id}`)} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="transition-shadow hover:shadow-[0_6px_20px_#17172212]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{b.title}</p>
                      <p className="text-sm text-text-secondary">
                        {b.latest_published_version ? `Опубликована версия ${b.latest_published_version.version}` : 'Ещё не опубликовано'}
                        {b.draft ? ` · черновик версии ${b.draft.version}` : ''}
                        {` · назначений: ${b.assignment_count}`}
                      </p>
                      {b.open_report_count > 0 && (
                        <p className="mt-1 text-xs font-medium text-primary">Отчётов о понятности: {b.open_report_count}</p>
                      )}
                    </div>
                    <BriefStateBadge state={b.state} />
                  </div>
                </Card>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function MentorBriefDetailPage({ id }: { id: string }) {
  const loaded = useLiveData(() => getBrief(id), [id], null as TaskBriefT | null);
  const [brief, setBrief] = useState<TaskBriefT | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignTick, setAssignTick] = useState(0);

  useEffect(() => { setBrief(loaded.data ?? null); }, [loaded.data]);

  if (loaded.state === 'loading' && !brief) return <Card><LoadingState /></Card>;
  if (loaded.state === 'error') return <ErrorState message={userMessage(loaded.error)} onRetry={loaded.refetch} />;
  if (!brief) return <EmptyState title="ТЗ не найдено" message="Оно удалено или принадлежит другому наставнику." />;

  const run = async (work: () => Promise<TaskBriefT>, failure: string) => {
    setBusy(true);
    setNotice(null);
    try {
      setBrief(await work());
      setEditing(false);
    } catch (e) {
      setNotice(userMessage(e, failure));
      loaded.refetch();
    } finally {
      setBusy(false);
    }
  };

  const published = brief.latest_published_version;
  const base = brief.draft?.content ?? published?.content ?? emptyBrief();
  const archived = brief.state === 'archived';

  return (
    <>
      <a href={href('/mentor/briefs')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К заданиям
      </a>
      <PageHeader title={brief.title} subtitle={`Редакция ${brief.revision} · версий: ${brief.versions.length}`} />
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <BriefStateBadge state={brief.state} />
            {brief.versions.map((v) => (
              <span key={v.version} className="rounded-lg bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
                v{v.version} · {v.state === 'published' ? 'опубликована' : 'черновик'}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            Опубликованная версия не меняется: правка создаёт черновик следующей версии. Назначенные стажёры остаются на своей версии, пока сами не перейдут.
          </p>
          {notice && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>}
          {!archived && (
            <div className="mt-3 flex flex-wrap gap-2">
              {brief.draft && (
                <Button disabled={busy} onClick={() => run(() => publishBrief(brief.id, brief.revision), 'Публикация не прошла.')}>
                  <Send size={14} className="mr-1 inline" aria-hidden /> Опубликовать версию {brief.draft.version}
                </Button>
              )}
              {!editing && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {brief.draft ? 'Редактировать черновик' : `Подготовить версию ${(published?.version ?? 0) + 1}`}
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => run(() => archiveBrief(brief.id, brief.revision), 'Архивация не прошла.')}>
                <Archive size={14} className="mr-1 inline" aria-hidden /> В архив
              </Button>
            </div>
          )}
        </Card>

        {editing && (
          <Card>
            <h2 className="mb-3 font-medium">{brief.draft ? `Черновик версии ${brief.draft.version}` : 'Новая версия — черновик'}</h2>
            <BriefEditor
              key={brief.revision}
              initial={base}
              submitLabel="Сохранить черновик"
              busy={busy}
              onSubmit={(content) => run(() => saveDraft(brief.id, content, brief.revision), 'Черновик не сохранился: возможно, ТЗ изменилось в другой вкладке.')}
              onCancel={() => setEditing(false)}
            />
          </Card>
        )}

        {!editing && brief.draft && <BriefText title={`Черновик версии ${brief.draft.version}`} content={brief.draft.content} />}
        {published && <BriefText title={`Опубликованная версия ${published.version}`} content={published.content} />}

        {published && !archived && (
          <AssignPanel brief={brief} onAssigned={() => setAssignTick((t) => t + 1)} />
        )}
        <BriefAssignments briefId={brief.id} tick={assignTick} />
        <a href={href('/mentor/reports')} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Отчёты о понятности <ArrowRight size={14} aria-hidden />
        </a>
      </div>
    </>
  );
}

export function BriefText({ title, content }: { title: string; content: BriefContentT }) {
  return (
    <Card>
      <h2 className="mb-1 font-medium">{title}</h2>
      <p className="text-sm text-text-secondary">{content.title}</p>
      <dl className="mt-3 space-y-3 text-sm">
        <div><dt className="font-medium">Цель</dt><dd className="whitespace-pre-wrap">{content.goal}</dd></div>
        {content.sections.map((s) => (
          <div key={s.id}><dt className="font-medium">{s.title}</dt><dd className="whitespace-pre-wrap">{s.text}</dd></div>
        ))}
        <div><dt className="font-medium">Ожидаемый результат</dt><dd className="whitespace-pre-wrap">{content.expected_result}</dd></div>
        <div>
          <dt className="font-medium">Критерии приёмки</dt>
          <dd>{content.acceptance_criteria.length ? (
            <ul className="list-disc pl-5">{content.acceptance_criteria.map((c) => <li key={c.id}>{c.text}</li>)}</ul>
          ) : 'Не заданы'}</dd>
        </div>
      </dl>
    </Card>
  );
}

function AssignPanel({ brief, onAssigned }: { brief: TaskBriefT; onAssigned: () => void }) {
  const interns = useLiveData(() => listMentorInterns(), [], []);
  const [internId, setInternId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const version = brief.latest_published_version!.version;

  const assign = async () => {
    if (!internId) return;
    setBusy(true);
    setMessage(null);
    try {
      const assignment = await assignBrief(brief.id, version, internId);
      setMessage({ ok: true, text: `Назначено: ${assignment.intern.display_name}, версия ${assignment.brief_version}.` });
      onAssigned();
    } catch (e) {
      setMessage({ ok: false, text: userMessage(e, 'Не удалось назначить. Возможно, стажёр уже получил это ТЗ.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-2 font-medium">Назначить стажёру (версия {version})</h2>
      {interns.state === 'loading' && <LoadingState label="Загружаем стажёров…" />}
      {interns.state === 'error' && <p className="text-sm text-error" role="alert">{userMessage(interns.error)}</p>}
      {interns.state === 'empty' && <p className="text-sm text-text-secondary">В вашей команде нет стажёров.</p>}
      {interns.state === 'data' && interns.data && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Кому назначить
            <select
              value={internId}
              onChange={(e) => setInternId(e.target.value)}
              className="ml-2 rounded-xl border border-border px-2 py-2 text-sm"
            >
              <option value="">— выберите —</option>
              {interns.data.map((i) => <option key={i.id} value={i.id}>{i.display_name}</option>)}
            </select>
          </label>
          <Button disabled={busy || !internId} onClick={assign}>Назначить</Button>
        </div>
      )}
      {message && (
        <p className={`mt-2 text-sm ${message.ok ? 'text-success' : 'text-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>
      )}
    </Card>
  );
}

function BriefAssignments({ briefId, tick }: { briefId: string; tick: number }) {
  const all = useLiveData(() => listAssignments(), [tick], [] as TaskAssignmentT[]);
  const items = (all.data ?? []).filter((a) => a.brief_id === briefId);
  if (all.state !== 'data' || items.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-2 font-medium">Назначения</h2>
      <ul className="space-y-1 text-sm">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-2">
            <span>{a.intern.display_name}</span>
            <span className="text-text-secondary">
              версия {a.brief_version}{a.latest_published_version > a.brief_version ? ` (доступна ${a.latest_published_version})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- отчёты о понятности ---

export function MentorReportsPage() {
  const reports = useLiveData(() => listReports(), [], []);
  return (
    <>
      <PageHeader title="Понятность заданий" subtitle="Повторяющиеся неясности в ваших ТЗ: от 2 разных стажёров за 30 дней" />
      {reports.state === 'loading' && <Card><LoadingState /></Card>}
      {reports.state === 'error' && <ErrorState message={userMessage(reports.error)} onRetry={reports.refetch} />}
      {reports.state === 'empty' && (
        <EmptyState title="Отчётов нет" message="Когда один и тот же раздел ТЗ окажется непонятным нескольким стажёрам, здесь появится отчёт." />
      )}
      {reports.state === 'data' && reports.data && (
        <ul className="space-y-3">
          {reports.data.map((r) => (
            <li key={r.id}>
              <a href={href(`/mentor/reports/${r.id}`)} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="transition-shadow hover:shadow-[0_6px_20px_#17172212]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.brief_title} · v{r.brief_version}</p>
                      <p className="text-sm text-text-secondary">«{r.section_title}» — {REASONS[r.reason].toLowerCase()}</p>
                    </div>
                    <CandidateStateBadge state={r.state} />
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    Разных стажёров за 30 дней: {r.current_count} · всего: {r.lifetime_count}
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

const nextDecisions: Record<TaskClarityReportT['state'], { decision: 'under_review' | 'accepted' | 'rejected' | 'resolved'; label: string }[]> = {
  proposed: [{ decision: 'under_review', label: 'Взять в работу' }],
  under_review: [{ decision: 'accepted', label: 'Принять гипотезу' }, { decision: 'rejected', label: 'Отклонить' }],
  accepted: [{ decision: 'resolved', label: 'Закрыть опубликованной версией' }],
  rejected: [],
  resolved: [],
};

export function MentorReportDetailPage({ id, pollMs = 3000 }: { id: string; pollMs?: number }) {
  const loaded = useLiveData(() => getReport(id), [id], null as TaskClarityReportT | null);
  const [report, setReport] = useState<TaskClarityReportT | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (loaded.data) setReport(loaded.data); }, [loaded.data]);

  // Гипотезу модели Go дописывает в фоне: пока она готовится, тихо перечитываем отчёт.
  useEffect(() => {
    if (report?.enrichment_status !== 'pending') return;
    const timer = setInterval(() => {
      getReport(id).then(setReport).catch(() => undefined);
    }, pollMs);
    return () => clearInterval(timer);
  }, [id, report?.enrichment_status, pollMs]);

  if (loaded.state === 'loading' && !report) return <Card><LoadingState /></Card>;
  if (loaded.state === 'error') return <ErrorState message={userMessage(loaded.error)} onRetry={loaded.refetch} />;
  if (!report) return <EmptyState title="Отчёт не найден" message="Он недоступен или относится к чужому ТЗ." />;
  const r = report;

  const decide = async (decision: 'under_review' | 'accepted' | 'rejected' | 'resolved') => {
    setBusy(true);
    setNotice(null);
    try {
      const fresh = await reviewReport(r.id, {
        decision,
        reason: reason.trim() || 'Решение наставника',
        expected_version: r.version,
        ...(decision === 'resolved' ? { resolved_version: r.latest_published_version } : {}),
      });
      setReport(fresh);
      setReason('');
    } catch (e) {
      setNotice(userMessage(e, 'Решение не сохранилось.'));
    } finally {
      setBusy(false);
    }
  };

  const decisions = nextDecisions[r.state].filter(
    (d) => d.decision !== 'resolved' || r.latest_published_version > r.brief_version,
  );

  return (
    <>
      <a href={href('/mentor/reports')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К отчётам
      </a>
      <PageHeader title={`«${r.section_title}»`} subtitle={`${r.brief_title} · версия ${r.brief_version}`} />
      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CandidateStateBadge state={r.state} />
            <span className="rounded-lg bg-surface-muted px-2 py-0.5 text-xs">{REASONS[r.reason]}</span>
          </div>
          <p className="text-sm">
            Разных стажёров за последние 30 дней: <strong>{r.current_count}</strong> (всего {r.lifetime_count}). Последняя отметка: {new Date(r.last_seen_at).toLocaleString('ru-RU')}.
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            Это наблюдение о тексте задания, а не оценка людей. Кто именно отметил раздел, не показывается.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-medium">
            <Sparkles size={16} className="text-primary" aria-hidden /> Гипотеза и предложение
          </h2>
          <p className="mb-2 text-xs text-text-secondary" role="status">
            {r.enrichment_status === 'completed' && 'Написано ИИ по тексту раздела. Это предложение, решение за вами.'}
            {r.enrichment_status === 'pending' && 'ИИ готовит гипотезу — пока показан шаблонный текст.'}
            {r.enrichment_status === 'failed' && 'ИИ недоступен — показан шаблонный текст без модели.'}
          </p>
          <p className="whitespace-pre-wrap text-sm">{r.hypothesis}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{r.suggestion}</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-medium">Решение</h2>
          {r.state === 'accepted' && r.latest_published_version <= r.brief_version && (
            <p className="mb-3 text-sm text-text-secondary">
              Принятие ничего не публикует. Исправьте ТЗ и опубликуйте новую версию — затем закройте отчёт ссылкой на неё.
            </p>
          )}
          {r.state === 'resolved' && <p className="text-sm">Закрыто версией {r.resolved_version}.</p>}
          {r.state === 'rejected' && <p className="text-sm text-text-secondary">Гипотеза отклонена. Новые отметки этого раздела в той же версии не откроют отчёт заново.</p>}
          {decisions.length > 0 && (
            <>
              <label className="block text-sm">
                Комментарий к решению
                <input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {decisions.map((d) => (
                  <Button key={d.decision} variant={d.decision === 'rejected' ? 'danger' : 'primary'} disabled={busy} onClick={() => decide(d.decision)}>
                    {d.decision === 'resolved' ? `Закрыть версией ${r.latest_published_version}` : d.label}
                  </Button>
                ))}
              </div>
            </>
          )}
          {notice && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>}
          <a href={href(`/mentor/briefs/${r.brief_id}`)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Открыть ТЗ <ArrowRight size={14} aria-hidden />
          </a>
        </Card>
      </div>
    </>
  );
}
