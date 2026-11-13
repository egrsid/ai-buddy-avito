import { useState } from 'react';
import { ArrowLeft, ArrowRight, HelpCircle, RefreshCw } from 'lucide-react';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { href } from '../lib/router';
import type { FrictionReasonT, TaskAssignmentT } from '../lib/v3';
import { adoptVersion, getAssignment, listAssignments, reportFriction } from '../lib/v3';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { MentorContactCard } from '../components/MentorContactCard';

// V3-TASK/FRICTION (стажёр): задания наставника по опубликованной версии ТЗ.
// «Непонятно» — структурированная отметка раздела и причины; это не проверка результата
// и не сообщение наставнику. Повторная отметка того же раздела ничего не добавляет.

export const REASONS: Record<FrictionReasonT, string> = {
  requirement_unclear: 'Неясно требование',
  outcome_unclear: 'Неясен результат',
  acceptance_unclear: 'Неясен критерий приёмки',
};

export function InternTasksPage() {
  const tasks = useLiveData(() => listAssignments(), [], []);
  return (
    <>
      <PageHeader title="Мои задания" subtitle="ТЗ от наставника. Если раздел непонятен — отметьте его, автор увидит обобщённый отчёт." />
      {tasks.state === 'loading' && <Card><LoadingState /></Card>}
      {tasks.state === 'error' && <ErrorState message={userMessage(tasks.error)} onRetry={tasks.refetch} />}
      {tasks.state === 'empty' && (
        <EmptyState title="Заданий пока нет" message="Когда наставник назначит ТЗ, оно появится здесь." />
      )}
      {tasks.state === 'data' && tasks.data && (
        <ul className="space-y-3">
          {tasks.data.map((t) => (
            <li key={t.id}>
              <a href={href(`/tasks/${t.id}`)} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="transition-shadow hover:shadow-[0_6px_20px_#17172212]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{t.content.title}</p>
                      <p className="text-sm text-text-secondary">Версия {t.brief_version} · автор {t.author.display_name}</p>
                    </div>
                    <ArrowRight size={18} className="text-text-secondary" aria-hidden />
                  </div>
                  {t.latest_published_version > t.brief_version && (
                    <p className="mt-2 text-xs text-primary">Опубликована версия {t.latest_published_version}</p>
                  )}
                </Card>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function InternTaskDetailPage({ id }: { id: string }) {
  const task = useLiveData(() => getAssignment(id), [id], null as TaskAssignmentT | null);
  const [current, setCurrent] = useState<TaskAssignmentT | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contactSection, setContactSection] = useState<string | undefined>(undefined);
  // Свежие отметки показываем сразу, не перезагружая страницу (иначе пропадёт подтверждение).
  const [extraMarks, setExtraMarks] = useState<{ section_id: string; reason: FrictionReasonT }[]>([]);

  if (task.state === 'loading') return <Card><LoadingState /></Card>;
  if (task.state === 'error') return <ErrorState message={userMessage(task.error)} onRetry={task.refetch} />;
  if (!task.data) return <EmptyState title="Задание не найдено" message="Оно удалено или вам недоступно." />;
  const t = current && current.id === task.data.id && current.revision >= task.data.revision ? current : task.data;

  const adopt = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setCurrent(await adoptVersion(t.id, t.latest_published_version, t.revision));
    } catch (e) {
      setNotice(userMessage(e, 'Не удалось перейти на новую версию.'));
      task.refetch();
    } finally {
      setBusy(false);
    }
  };

  const marked = (sectionId: string) => {
    const reasons = [...t.reported_sections, ...extraMarks].filter((r) => r.section_id === sectionId).map((r) => r.reason);
    return [...new Set(reasons)];
  };
  const onMarked = (sectionId: string, reason: FrictionReasonT) =>
    setExtraMarks((marks) => [...marks, { section_id: sectionId, reason }]);

  const sections = [
    { id: 'goal', title: 'Цель задания', text: t.content.goal },
    ...t.content.sections,
    { id: 'expected_result', title: 'Ожидаемый результат', text: t.content.expected_result },
    {
      id: 'acceptance_criteria',
      title: 'Критерии приёмки',
      text: t.content.acceptance_criteria.length ? t.content.acceptance_criteria.map((c) => `• ${c.text}`).join('\n') : 'Критерии не заданы.',
    },
  ];

  return (
    <>
      <a href={href('/tasks')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={16} aria-hidden /> К заданиям
      </a>
      <PageHeader title={t.content.title} subtitle={`Версия ${t.brief_version} · автор ${t.author.display_name} · результат не проверяется автоматически`} />
      <div className="space-y-4">
        {t.brief_state === 'archived' && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-text-secondary">Автор перенёс это ТЗ в архив. Текст сохранён для справки.</p>
        )}
        {t.latest_published_version > t.brief_version && t.brief_state !== 'archived' && (
          <Card className="border-primary/30 bg-primary-light/40">
            <p className="text-sm">
              Автор опубликовал версию {t.latest_published_version}. Вы работаете по версии {t.brief_version} — она не меняется без вашего решения.
            </p>
            <div className="mt-3">
              <Button disabled={busy} onClick={adopt}>
                <RefreshCw size={14} className="mr-1 inline" aria-hidden /> Перейти на версию {t.latest_published_version}
              </Button>
            </div>
          </Card>
        )}
        {notice && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>}
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            assignmentId={t.id}
            section={section}
            marked={marked(section.id)}
            onMarked={onMarked}
            onAsk={() => setContactSection(section.id)}
          />
        ))}
        <MentorContactCard
          key={contactSection ?? 'task'}
          context={{ assignmentId: t.id, sectionId: contactSection }}
          title={contactSection ? 'Спросить наставника про этот раздел' : 'Написать наставнику в Telegram'}
        />
      </div>
    </>
  );
}

function SectionCard({ assignmentId, section, marked, onMarked, onAsk }: {
  assignmentId: string;
  section: { id: string; title: string; text: string };
  marked: FrictionReasonT[];
  onMarked: (sectionId: string, reason: FrictionReasonT) => void;
  onAsk: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FrictionReasonT>('requirement_unclear');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const receipt = await reportFriction(assignmentId, section.id, reason);
      setResult(receipt.status === 'recorded'
        ? 'Затруднение сообщено. Автор увидит обобщённый отчёт, если раздел непонятен нескольким стажёрам.'
        : 'Вы уже отмечали этот раздел с такой причиной — отметка учтена один раз.');
      setOpen(false);
      onMarked(section.id, reason);
    } catch (e) {
      setError(userMessage(e, 'Отметка не сохранилась.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-2 font-medium">{section.title}</h3>
      <p className="whitespace-pre-wrap text-sm">{section.text}</p>
      {marked.length > 0 && (
        <p className="mt-2 text-xs text-text-secondary">Вы отметили: {marked.map((r) => REASONS[r]).join(', ')}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!open && (
          <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); }}>
            <HelpCircle size={14} className="mr-1 inline" aria-hidden /> Непонятно
          </Button>
        )}
        <Button variant="ghost" onClick={onAsk}>Спросить наставника</Button>
      </div>
      {open && (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-sm font-medium">Что именно неясно?</legend>
          {(Object.keys(REASONS) as FrictionReasonT[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`reason-${section.id}`} checked={reason === key} onChange={() => setReason(key)} />
              {REASONS[key]}
            </label>
          ))}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={submit}>Отметить</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
          </div>
        </fieldset>
      )}
      {result && <p className="mt-2 text-xs text-success" role="status">{result}</p>}
      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-error" role="alert">{error}</p>}
    </Card>
  );
}
