import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import * as C from '../contracts/v4';
import { apiFetch, newIdempotencyKey, serverNow, userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { useDataMode } from '../lib/dataMode';
import { getBrief, listAssignments, listReports, type TaskBriefT } from '../lib/v3';
import { getGoal } from '../lib/endpoints';
import { revisionFieldLabel, revisionOriginal } from './revisionOriginal';
import { Button, Card, LoadingState, ErrorState, PageHeader } from '../components/ui';
const statusText: Record<string, string> = {
  generating: 'Генерация предложения',
  ready: 'Готово к проверке',
  blocked: 'Есть препятствие',
  verified: 'Проверено',
  unverified: 'Не проверено',
  unknown: 'Нет сведений',
  waiting_external: 'Ожидается внешнее действие',
  needs_input: 'Нужны уточнения автора',
  unavailable: 'Предложение недоступно',
  applied: 'Сохранено в черновик',
  discarded: 'Отклонено',
  expired: 'Истёк срок предложения',
  insufficient_data: 'Недостаточно данных',
  no_exposure: 'Нет наблюдённой экспозиции',
  not_comparable: 'Версии несопоставимы',
};
const get = async <T,>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) =>
  schema.parse(await apiFetch('/api/v4' + path, { signal }));
const post = async <T,>(path: string, body: unknown, schema: z.ZodType<T>) =>
  schema.parse(
    await apiFetch('/api/v4' + path, {
      method: 'POST',
      body,
      idempotencyKey: newIdempotencyKey(),
    }),
  );
export function LiveV4Page() {
  const { user } = useDataMode();
  return user.roles.includes('intern') ? (
    <Workspaces />
  ) : user.roles.includes('buddy') ? (
    <MentorTools />
  ) : (
    <Card className="my-4">Этот раздел доступен стажёру и автору ТЗ.</Card>
  );
}
function Workspaces() {
  const q = useLiveData(
    async (signal) => {
      let page = await get('/workspaces', C.WorkspaceList, signal);
      const result = { ...page, items: [...page.items], unlinked_goals: [...page.unlinked_goals] };
      const seen = new Set<string>();
      while (page.next_cursor) {
        if (seen.has(page.next_cursor)) throw new Error('Повтор курсора');
        seen.add(page.next_cursor);
        page = await get(
          '/workspaces?cursor=' + encodeURIComponent(page.next_cursor),
          C.WorkspaceList,
          signal,
        );
        result.items.push(...page.items);
        result.unlinked_goals.push(...page.unlinked_goals);
      }
      return result;
    },
    [],
    null,
  );
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<z.infer<typeof C.LinkPreview> | null>(null);
  async function prepare(id: string) {
    setBusy(true);
    setNotice('');
    try {
      setPreview(
        await post(
          `/workspaces/${id}/link-preview`,
          { template_id: 'db-access-team-a', template_version: 1 },
          C.LinkPreview,
        ),
      );
    } catch (e) {
      setNotice(userMessage(e, 'Автор ещё не разрешил связь с техническим маршрутом.'));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      await post(
        `/workspaces/${preview.assignment_id}/link-confirm`,
        {
          preview_id: preview.id,
          preview_hash: preview.preview_hash,
          expected_revision: preview.assignment_revision,
        },
        C.Workspace,
      );
      setPreview(null);
      q.refetch();
    } catch (e) {
      setNotice(userMessage(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Задания и цели"
        subtitle="Здесь видно, что поручил наставник и какие технические шаги нужны для выполнения задания."
      />
      <Card className="my-4">
        <h2 className="font-semibold">Как пользоваться этим разделом</h2>
        <p className="mt-2 text-sm">
          Откройте ТЗ, чтобы прочитать требования и задать вопрос наставнику. Если для задания нужен доступ к
          БД, здесь появится связанная цель с проверяемыми подзадачами. Выполняйте их по порядку.
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          «Мои цели» — все технические проверки. «ТЗ от наставника» — тексты заданий. Здесь они собраны
          вместе; успешная проверка доступа ещё не означает приёмку отчёта наставником.
        </p>
      </Card>
      {q.state === 'loading' && <LoadingState />}
      {q.state === 'error' && <ErrorState message={userMessage(q.error)} onRetry={q.refetch} />}
      {notice && <p role="alert">{notice}</p>}
      {preview && (
        <Card className="my-4">
          <h2 className="font-semibold">Подтвердите связь ТЗ с маршрутом</h2>
          <p className="my-3">
            Доступ к БД команды A · версия {preview.template_version}. Связь не выдаёт прав и не подтверждает
            выполнение.
          </p>
          <Button disabled={busy} onClick={confirm}>
            Подтвердить связь
          </Button>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Отмена
          </Button>
        </Card>
      )}
      <div className="mt-4 space-y-4">
        {[...(q.data?.items ?? []), ...(q.data?.unlinked_goals ?? [])].map((w) => (
          <Card key={`${w.kind}:${w.id}`}>
            <h2 className="text-lg font-semibold">{w.title}</h2>
            <p className="my-2">
              {w.link_status === 'unlinked'
                ? 'Техническая цель пока не связана с заданием'
                : `Техническая готовность: ${statusText[w.technical_status]}`}
            </p>
            <p className="text-xs text-text-secondary">Приёмка результата ТЗ автоматически не выполняется.</p>
            {w.blocker_code && <p className="my-2 text-error">{w.blocker_code}</p>}
            {w.kind === 'assignment' && (
              <a className="my-2 block text-primary underline" href={`#/tasks/${w.id}`}>
                Открыть ТЗ
              </a>
            )}
            {w.link_status === 'unlinked' && w.kind === 'assignment' && w.can_link !== false && (
              <Button disabled={busy} onClick={() => prepare(w.id)}>
                Связать с технической целью
              </Button>
            )}
            {w.can_link === false && w.link_status === 'unlinked' && (
              <p className="my-2 text-sm text-text-secondary">
                Выполняйте требования ТЗ. Если понадобится техническая проверка доступа, наставник добавит её
                к этому назначению.
              </p>
            )}
            {w.goal.id && (
              <>
                <p className="my-3 text-sm font-medium">Связанная цель: {w.goal.title}</p>
                <GoalDetails id={w.goal.id} />
              </>
            )}
          </Card>
        ))}
      </div>
      {q.data && !q.data.items.length && !q.data.unlinked_goals.length && (
        <Card className="my-4">Пока нет назначенных ТЗ или целей.</Card>
      )}
    </>
  );
}
function GoalDetails({ id }: { id: string }) {
  const controls = useId();
  const [open, setOpen] = useState(false);
  const goal = useLiveData(() => getGoal(id), [id], null, { enabled: open });
  const proof = useLiveData(
    async (signal) => {
      let page = await get(`/goals/${id}/evidence-timeline`, C.EvidenceTimeline, signal);
      const result = { ...page, items: [...page.items] };
      const seen = new Set<string>();
      while (page.next_cursor) {
        if (seen.has(page.next_cursor)) throw new Error('Повтор курсора');
        seen.add(page.next_cursor);
        page = await get(
          `/goals/${id}/evidence-timeline?cursor=` + encodeURIComponent(page.next_cursor),
          C.EvidenceTimeline,
          signal,
        );
        result.items.push(...page.items);
      }
      return result;
    },
    [id],
    null,
    {
      enabled: open,
    },
  );
  return (
    <>
      <Button variant="secondary" ariaExpanded={open} ariaControls={controls} onClick={() => setOpen(!open)}>
        Подзадачи и доказательства
      </Button>
      {open && (
        <div id={controls} className="mt-3 space-y-3">
          {goal.state === 'error' && <ErrorState message={userMessage(goal.error)} onRetry={goal.refetch} />}
          <ul>
            {goal.data?.steps.map((s) => (
              <li key={s.id} className="my-2">
                <a className="text-primary underline" href={`#/onboarding/${id}/steps/${s.id}`}>
                  {s.title} · {statusText[s.status] ?? 'Ожидается проверка'}
                </a>
              </li>
            ))}
          </ul>
          <h3 className="font-semibold">Почему такой статус?</h3>
          {proof.data && <p>Текущий статус: {statusText[proof.data.current.status] ?? 'Нет сведений'}</p>}
          {proof.data?.items.length === 0 && <p>История пока недоступна. Текущий статус хранит сервер.</p>}
          {proof.state === 'error' && (
            <ErrorState message={userMessage(proof.error)} onRetry={proof.refetch} />
          )}
          <ol className="space-y-2">
            {proof.data?.items.map((e) => (
              <li key={e.id} className="border-l-2 border-primary pl-3 text-sm">
                {e.label}
                <p className="text-xs text-text-secondary">
                  {e.source} · {e.observed_at} ·{' '}
                  {e.validity === 'invalidated'
                    ? 'Отозвано'
                    : e.trusted
                      ? 'Доверенный факт'
                      : 'Не является доказательством'}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
function MentorTools() {
  const reports = useLiveData(() => listReports(), [], []);
  const assignments = useLiveData(() => listAssignments(), [], []);
  // Короткий список раскрыт сразу, длинный свёрнут; решение принимается один раз, когда список
  // загрузился, дальше панель открывает и закрывает только пользователь.
  const [routesOpen, setRoutesOpen] = useState<boolean>();
  const routesShown = routesOpen ?? (assignments.data ? assignments.data.length <= 3 : false);
  const [report, setReport] = useState('');
  const [brief, setBrief] = useState<TaskBriefT | null>(null);
  const [proposal, setProposal] = useState<z.infer<typeof C.RevisionProposal> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [impact, setImpact] = useState<z.infer<typeof C.ImpactComparison> | null>(null);
  useEffect(() => {
    if (proposal?.status !== 'generating') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const updated = await get(`/revision-proposals/${proposal.id}`, C.RevisionProposal);
        if (cancelled) return;
        setProposal(updated);
        if (updated.status === 'generating') timer = setTimeout(poll, 500);
      } catch (error) {
        if (!cancelled) setNotice(userMessage(error));
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [proposal?.id, proposal?.status]);
  const [routeChoices, setRouteChoices] = useState<string[]>([]);
  const [enabledRoutes, setEnabledRoutes] = useState<string[]>([]);
  const current = reports.data?.find((r) => r.id === report);
  async function generate() {
    if (!current || busy) return;
    setBusy(true);
    setNotice('');
    try {
      setBrief(await getBrief(current.brief_id));
      setProposal(
        await post(
          `/task-clarity-reports/${current.id}/revision-proposals`,
          {
            expected_report_version: current.version,
            base_brief_version: current.brief_version,
            ...(answer.trim()
              ? {
                  answers: [
                    {
                      question: proposal?.questions[0] ?? 'Уточните требования',
                      answer: answer.trim(),
                    },
                  ],
                }
              : {}),
          },
          C.RevisionProposal,
        ),
      );
      setSelected([]);
    } catch (e) {
      setNotice(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!proposal || !brief || !selected.length || busy) return;
    setBusy(true);
    try {
      setProposal(
        await post(
          `/revision-proposals/${proposal.id}/apply`,
          {
            selected_change_ids: selected,
            expected_draft_revision: (
              proposal.draft_version !== undefined ? proposal.draft_version !== null : !!brief.draft
            )
              ? (proposal.base_revision ?? brief.revision)
              : null,
            proposal_revision: proposal.proposal_revision,
            preview_hash: proposal.preview_hash,
          },
          C.RevisionProposal,
        ),
      );
      setNotice('Изменения сохранены в черновик. Откройте ТЗ, проверьте и опубликуйте отдельно.');
    } catch (e) {
      setNotice(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      setProposal(
        await post(
          `/revision-proposals/${proposal.id}/discard`,
          { expected_revision: proposal.proposal_revision },
          C.RevisionProposal,
        ),
      );
      setSelected([]);
      setNotice('Предложение отклонено. Черновик и публикация не менялись.');
    } catch (error) {
      setNotice(userMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function permit(id: string) {
    setBusy(true);
    try {
      const a = assignments.data!.find((a) => a.id === id)!;
      await post(
        `/assignments/${id}/permitted-template`,
        {
          template_id: 'db-access-team-a',
          template_version: 1,
          expected_revision: a.revision,
        },
        C.Workspace,
      );
      setEnabledRoutes((ids) => [...ids, id]);
      setNotice(
        'Цель доступа к БД добавлена к назначению. Следующий шаг: стажёр открывает «Задания и цели», проверяет связь и нажимает «Подтвердить связь». После этого он выполняет подзадачи и отдельно запрашивает доступ у согласующего.',
      );
      assignments.refetch();
    } catch (e) {
      setNotice(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Улучшение заданий"
        subtitle="Исправляйте формулировки, которые затруднили работу нескольких стажёров: выберите отчёт → проверьте AI-правку → опубликуйте новую версию ТЗ."
      />
      {notice && (
        <p role="status" className="my-3">
          {notice}
        </p>
      )}
      <Card className="my-4">
        <details
          open={routesShown}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            if (open !== routesShown || routesOpen !== undefined) setRoutesOpen(open);
          }}
        >
          <summary className="cursor-pointer font-semibold">
            Дополнительно: технические цели назначений ({assignments.data?.length ?? 0})
          </summary>
          <p className="my-3 text-sm text-text-secondary">
            Необязательная настройка для заданий, которым действительно нужен доступ к БД команды A. Связь
            действует только для выбранного ТЗ и стажёра. Обычному отчёту или другому заданию без работы с БД
            её добавлять не нужно. Задание само по себе не даёт прав на БД.
          </p>
          <ul>
            {assignments.data?.map((a) => (
              <li key={a.id} className="my-3 text-sm">
                <p className="font-medium">
                  {a.content.title} · версия {a.brief_version}
                </p>
                <p className="my-2">Назначено: {a.intern.display_name}</p>
                {a.db_route_enabled || enabledRoutes.includes(a.id) ? (
                  <p className="text-sm text-success">
                    Цель «Доступ к БД команды A» подключена. Стажёр подтверждает связь в «Заданиях и целях»,
                    затем выполняет проверки. Сам доступ одобряет согласующий.
                  </p>
                ) : (
                  <>
                    <label className="my-2 block">
                      <input
                        type="checkbox"
                        checked={routeChoices.includes(a.id)}
                        onChange={() =>
                          setRouteChoices((ids) =>
                            ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id],
                          )
                        }
                      />{' '}
                      Для этого назначения нужен доступ к БД команды A
                    </label>
                    {routeChoices.includes(a.id) && (
                      <Button disabled={busy} variant="secondary" onClick={() => permit(a.id)}>
                        Добавить цель доступа к БД
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {assignments.state === 'error' && <ErrorState message={userMessage(assignments.error)} />}
        </details>
      </Card>
      <Card className="my-4">
        <h2 className="mb-3 font-semibold">1. Выберите, какое ТЗ нужно улучшить</h2>
        <p className="mb-3 text-sm text-text-secondary">
          Отчёт появляется, когда как минимум два разных стажёра отмечают одну причину неясности в одном
          разделе одной версии ТЗ. Это сигнал о тексте задания, а не оценка людей.
        </p>
        <label className="block text-sm">
          Отчёт о неясности
          <select
            disabled={busy}
            className="my-3 w-full rounded-xl border border-border p-2"
            value={report}
            onChange={(e) => {
              setReport(e.target.value);
              setProposal(null);
              setImpact(null);
              setAnswer('');
              setNotice('');
            }}
          >
            <option value="">Выберите отчёт</option>
            {reports.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.brief_title} · {r.section_title} · v{r.brief_version}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={
            !current ||
            busy ||
            current.brief_version !== current.latest_published_version ||
            proposal?.status === 'generating'
          }
          onClick={generate}
        >
          Предложить уточнение
        </Button>
        {reports.state === 'error' && <ErrorState message={userMessage(reports.error)} />}
      </Card>
      {current && current.brief_version !== current.latest_published_version && (
        <p className="my-3 text-sm text-text-secondary">
          Отчёт относится к прежней версии. Для новой правки выберите отчёт текущей версии; сравнение версий
          остаётся доступным.
        </p>
      )}
      {current && (
        <Card className="my-4">
          <h2 className="font-semibold">Вы работаете с заданием «{current.brief_title}»</h2>
          <p className="mt-2 text-sm">
            Версия {current.brief_version} · раздел «{current.section_title}» · отметили{' '}
            {current.current_count} участника. AI предлагает изменения только для этого контекста. Сначала
            просмотрите предложение, затем сохраните выбранные правки в черновик. Публикация — отдельный шаг в
            редакторе ТЗ.
          </p>
        </Card>
      )}
      {current && (
        <a className="my-3 block text-primary underline" href={`#/mentor/briefs/${current.brief_id}`}>
          Открыть редактор ТЗ
        </a>
      )}
      {current && (
        <label className="my-3 block text-sm">
          Уточнение автора (для новой генерации)
          <textarea
            disabled={busy}
            maxLength={1000}
            className="mt-1 w-full rounded-xl border border-border p-3"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </label>
      )}
      {proposal && (
        <Card className="my-4">
          <h2 className="font-semibold">Предложение: {statusText[proposal.status]}</h2>
          <p className="my-2 text-xs">
            {proposal.status === 'generating'
              ? 'Ожидаем ответ'
              : proposal.origin === 'rule_based'
                ? 'Шаблон без LLM'
                : proposal.answered_by === 'secondary'
                  ? 'Ответ резервной модели'
                  : 'Ответ модели'}{' '}
            · истекает {proposal.expires_at}
          </p>
          {proposal.questions.map((q, i) => (
            <p key={i}>{q}</p>
          ))}
          {proposal.changes.map((c) => (
            <label key={c.id} className="my-3 block rounded-xl border border-border p-3">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() =>
                  setSelected((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                }
              />
              <span className="ml-2">
                {proposal.base_fields?.find((f) => f.field === c.field)?.label ??
                  revisionFieldLabel(brief, c.field)}
              </span>
              <p className="my-2 text-sm text-text-secondary">
                Было:{' '}
                {proposal.base_fields?.find((f) => f.field === c.field)?.text ??
                  revisionOriginal(brief, proposal.base_version, c.field)}
              </p>
              <p className="whitespace-pre-wrap text-sm">Предлагается: {c.replacement}</p>
              {c.rationale && <p className="mt-2 text-sm text-text-secondary">Почему: {c.rationale}</p>}
            </label>
          ))}
          <Button
            disabled={
              busy ||
              proposal.status !== 'ready' ||
              !selected.length ||
              Date.parse(proposal.expires_at) <= serverNow().getTime()
            }
            onClick={apply}
          >
            Применить в черновик
          </Button>
          {!['applied', 'discarded', 'expired'].includes(proposal.status) && (
            <Button variant="ghost" disabled={busy} onClick={discard}>
              Отклонить предложение
            </Button>
          )}
          {proposal.rationale && <p className="my-3 text-sm">Обоснование: {proposal.rationale}</p>}
        </Card>
      )}
      {current && (
        <Card className="my-4">
          <h2 className="font-semibold">Наблюдения по версиям</h2>
          <ImpactSetup
            key={current.id}
            briefId={current.brief_id}
            sectionId={current.section_id}
            reason={current.reason}
            revision={impact?.config_revision ?? 0}
            onSaved={setImpact}
          />
          <p className="my-2 text-sm">
            Сравнение требует опубликованных версий, настроенной области и 7 суток достоверных экспозиций. Это
            не доказательство причинного эффекта.
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                setImpact(await get(`/task-briefs/${current.brief_id}/impact`, C.ImpactComparison));
              } catch {
                setNotice('Сравнение ещё не настроено или недоступно. История экспозиций не выдумывается.');
              }
            }}
          >
            Загрузить сравнение
          </Button>
          {impact && (
            <div className="mt-3">
              <p>{impact.label}</p>
              <p>{statusText[impact.state ?? 'insufficient_data']}</p>
              {[impact.before, impact.after].map((s) => (
                <p key={s.version}>
                  Версия {s.version}:{' '}
                  {s.state === 'ready'
                    ? `${s.affected} из ${s.eligible}, ${(s.rate! * 100).toFixed(1)}%`
                    : 'Недостаточно данных для раскрытия чисел'}
                </p>
              ))}
              {impact.delta_pp !== undefined && <p>Разница: {impact.delta_pp.toFixed(1)} п.п.</p>}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function ImpactSetup({
  briefId,
  sectionId,
  reason,
  revision,
  onSaved,
}: {
  briefId: string;
  sectionId: string;
  reason: string;
  revision: number;
  onSaved: (c: z.infer<typeof C.ImpactComparison>) => void;
}) {
  const [before, setBefore] = useState(1);
  const [after, setAfter] = useState(2);
  const [comparable, setComparable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  return (
    <form
      className="my-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          onSaved(
            await post(
              `/task-briefs/${briefId}/impact-config`,
              {
                before_version: before,
                after_version: after,
                section_id: sectionId,
                reason,
                comparable,
                from_a: from + 'T00:00:00Z',
                to_a: to + 'T00:00:00Z',
                from_b: from + 'T00:00:00Z',
                to_b: to + 'T00:00:00Z',
                expected_revision: revision,
              },
              C.ImpactComparison,
            ),
          );
          setNotice('Сравнение настроено. Недостаточная история не считается нулевым затруднением.');
        } catch (e) {
          setNotice(userMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm">
        Версия до
        <input
          required
          type="number"
          min={1}
          value={before}
          onChange={(e) => setBefore(Number(e.target.value))}
          className="ml-2 w-20 border border-border p-2"
        />
      </label>
      <label className="block text-sm">
        Версия после
        <input
          required
          type="number"
          min={2}
          value={after}
          onChange={(e) => setAfter(Number(e.target.value))}
          className="ml-2 w-20 border border-border p-2"
        />
      </label>
      <label className="block text-sm">
        Начало набора когорт
        <input required type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="block text-sm">
        Конец набора когорт
        <input required type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className="block text-sm">
        <input type="checkbox" checked={comparable} onChange={(e) => setComparable(e.target.checked)} /> Смысл
        выбранного раздела сопоставим между версиями
      </label>
      <Button type="submit" disabled={busy}>
        Настроить сравнение
      </Button>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
