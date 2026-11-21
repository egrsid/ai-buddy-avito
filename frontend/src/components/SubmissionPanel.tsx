import { useState } from 'react';
import { SubmissionView } from '../contracts/v4';
import { apiFetch, newIdempotencyKey, userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { Button, Card, ErrorState, LoadingState } from './ui';

type Props = {
  assignmentId: string;
  version: number;
  reviewer?: boolean;
  archived: boolean;
};

const labels = { submitted: 'У наставника на проверке', returned: 'Возвращено на доработку', accepted: 'Работа принята' };
const formatDate = (value: string) => new Date(value).toLocaleString('ru-RU');

export function SubmissionPanel({ assignmentId, version, reviewer = false, archived }: Props) {
  const [open, setOpen] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/api/v4/assignments/${assignmentId}/submission`;
  const load = useLiveData(async signal => SubmissionView.parse(await apiFetch(path, { signal })),
    [assignmentId, version], null, { enabled: open });
  const current = load.data;
  const latest = current?.latest;
  const proof = current?.proof;

  async function save(decision?: 'accepted' | 'returned') {
    if (!current || current.brief_version !== version || busy || archived) return;
    const body = decision
      ? { submission_id: latest?.id, decision, comment: comment.trim() }
      : { brief_version: version, attempt: (latest?.attempt ?? 0) + 1, evidence_id: proof?.id, conclusion: conclusion.trim() };
    setBusy(true);
    setError('');
    try {
      await apiFetch(decision ? path + '/review' : path, { method: 'POST', body, idempotencyKey: newIdempotencyKey() });
      setConclusion('');
      setComment('');
    } catch (e) {
      setError(userMessage(e, 'Не удалось сохранить результат.'));
    } finally {
      load.refetch();
      setBusy(false);
    }
  }

  return <div className="my-3 w-full">
    <Button variant="secondary" ariaExpanded={open} onClick={() => setOpen(!open)}>
      {reviewer ? 'Проверка работы' : 'Сдача работы'}
    </Button>
    {open && <Card className="mt-2 space-y-3">
      {load.state === 'loading' && <LoadingState />}
      {load.state === 'error' && <ErrorState message={userMessage(load.error)} onRetry={load.refetch} />}
      {error && <p role="alert" className="text-error">{error}</p>}
      {current && current.brief_version !== version && <p role="alert">Версия ТЗ изменилась. Обновите страницу.</p>}
      {current?.brief_version === version && <>
        {latest && <section className="space-y-2">
          <h3 className="font-semibold" role="status">{labels[latest.status]}</h3>
          <p className="text-xs text-text-secondary">Попытка {latest.attempt} · версия ТЗ {version} · {formatDate(latest.submitted_at)}</p>
          <p>Подключение к тестовой БД подтверждено {formatDate(latest.observed_at)}.</p>
          <p className="break-all text-xs text-text-secondary">Доказательство {latest.evidence_id}</p>
          <p className="whitespace-pre-wrap break-words">{latest.conclusion}</p>
          {latest.comment && <p className="whitespace-pre-wrap break-words"><strong>Комментарий наставника. </strong>{latest.comment}</p>}
        </section>}
        {reviewer && !archived && !latest && <p>Стажёр ещё не сдал работу по этой версии ТЗ.</p>}
        {!reviewer && !archived && (!latest || latest.status === 'returned') && (proof ? <>
          <p>К выводу будет приложена успешная проверка подключения к тестовой БД от {formatDate(proof.observed_at)}.</p>
          <label className="block text-sm">Что подтвердила проверка?
            <textarea className="mt-1 w-full rounded-xl border border-border p-2" rows={3} maxLength={1500}
              value={conclusion} onChange={e => setConclusion(e.target.value)} />
          </label>
          <Button disabled={busy || !conclusion.trim()} onClick={() => save()}>Передать наставнику</Button>
        </> : <p>Для сдачи свяжите задание с целью и пройдите проверку подключения. <a href="#/workspaces" className="text-primary underline">Задания и цели</a></p>)}
        {reviewer && !archived && latest?.status === 'submitted' && <>
          <label className="block text-sm">Комментарий стажёру (обязателен при возврате)
            <textarea className="mt-1 w-full rounded-xl border border-border p-2" rows={2} maxLength={1500}
              value={comment} onChange={e => setComment(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => save('accepted')}>Принять работу</Button>
            <Button variant="secondary" disabled={busy || !comment.trim()} onClick={() => save('returned')}>Вернуть на доработку</Button>
          </div>
        </>}
        {archived && !latest && <p>По этой версии ТЗ нет сданной работы.</p>}
      </>}
    </Card>}
  </div>;
}
