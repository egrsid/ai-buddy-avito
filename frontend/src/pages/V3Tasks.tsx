import { useState } from 'react';
import { useLiveData } from '../lib/live';
import { listAssignments, listBriefs, listReports, read3, write3, type Assignment, type Brief, type Content, type Report } from '../lib/v3';
import * as C from '../contracts/v3';
import { userMessage } from '../lib/api';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { MentorContact } from '../components/MentorContact';
import { href } from '../lib/router';

const input = 'mt-1 w-full rounded-xl border border-border bg-surface p-3 text-sm';
const reasons = { requirement_unclear: 'Неясно требование', outcome_unclear: 'Неясен результат', acceptance_unclear: 'Неясен критерий приёмки' } as const;
const states: Record<string, string> = { proposed: 'Новый', under_review: 'На рассмотрении', accepted: 'Принят', rejected: 'Отклонён', resolved: 'Исправлен' };
export function ContentView({ content }: { content: Content }) {
  return <div className="space-y-3 text-sm"><p className="whitespace-pre-wrap"><b>Цель: </b>{content.goal}</p>{content.sections.map(s => <section key={s.id}><h3 className="font-semibold">{s.title}</h3><p className="whitespace-pre-wrap">{s.text}</p></section>)}<p className="whitespace-pre-wrap"><b>Ожидаемый результат: </b>{content.expected_result}</p><h3 className="font-semibold">Критерии приёмки</h3><ul className="list-disc pl-5">{content.acceptance_criteria.map(c => <li key={c.id}>{c.text}</li>)}</ul></div>;
}

export function AssignmentsPage() {
  const q = useLiveData(listAssignments, [], []);
  return <><PageHeader title="Мои задания" subtitle="ТЗ наставника и закреплённые версии. Отзыв не заменяет техническую проверку." />
    {q.state === 'loading' && <LoadingState />}{q.state === 'error' && <ErrorState message={userMessage(q.error)} onRetry={q.refetch} />}
    {q.state === 'empty' && <EmptyState title="Заданий пока нет" message="Наставник назначит опубликованную версию ТЗ." />}
    <div className="space-y-4">{q.data?.map(a => <AssignmentCard key={`${a.id}:${a.revision}`} a={a} refresh={q.refetch} />)}</div></>;
}
function AssignmentCard({ a, refresh }: { a: Assignment; refresh: () => void }) {
  const [section, setSection] = useState('goal');
  const [reason, setReason] = useState<keyof typeof reasons>('requirement_unclear');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [next, setNext] = useState<{ version: number; content: Content } | null>(null);
  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return; setBusy(true); setNotice('');
    try { await action(); setNotice(message); }
    catch (e) { setNotice(userMessage(e)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3"><Card><h2 className="text-xl font-semibold">{a.content.title}</h2><p className="mb-4 text-xs text-text-secondary">Версия {a.brief_version} · {a.author.display_name} · Результат не проверен</p><ContentView content={a.content} />
    <div className="mt-4 rounded-xl bg-surface-muted p-4"><h3 className="font-medium">Что осталось непонятным?</h3><label className="block text-sm">Раздел<select className={input} value={section} onChange={e => setSection(e.target.value)}><option value="goal">Цель</option>{a.content.sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}<option value="expected_result">Ожидаемый результат</option><option value="acceptance_criteria">Критерии приёмки</option></select></label><label className="my-3 block text-sm">Причина<select className={input} value={reason} onChange={e => setReason(e.target.value as keyof typeof reasons)}>{Object.entries(reasons).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
    <Button disabled={busy} onClick={() => run(() => write3(`/task-assignments/${a.id}/frictions`, { section_id: section, reason }, C.FrictionReceipt), 'Затруднение сообщено. Повторная отметка не увеличивает число участников.')}>Сообщить о неясности</Button></div>
    {a.latest_published_version > a.brief_version && a.brief_state !== 'archived' && <div className="mt-4"><Button variant="secondary" disabled={busy} onClick={() => run(async () => { setNext(await read3(`/task-assignments/${a.id}/latest-version`, C.TaskBriefVersion)); }, '')}>Посмотреть новую версию</Button>{next && <div className="mt-4 space-y-3"><h3 className="font-semibold">Предпросмотр версии {next.version}</h3><ContentView content={next.content} /><p className="text-sm">Переход изменит закреплённый текст задания. Права и результаты проверок сохраняются.</p><Button disabled={busy} onClick={() => run(async () => { await write3(`/task-assignments/${a.id}/adopt-version`, { brief_version: next.version, expected_revision: a.revision }, C.TaskAssignment); refresh(); }, 'Версия обновлена.')}>Подтвердить переход</Button></div>}</div>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}</Card><MentorContact context={{ assignment_id: a.id, section_id: section }} /></div>;
}

const initial: Content = { title: '', goal: '', sections: [{ id: 'requirements', title: 'Требования', text: '' }], expected_result: '', acceptance_criteria: [{ id: 'criterion_1', text: '' }], refs: [] };
export function MentorTasksPage() {
  const q = useLiveData(listBriefs, [], []);
  const [edit, setEdit] = useState<Brief | 'new' | null>(null);
  return <><PageHeader title="Задания команды" subtitle="Создавайте ТЗ, публикуйте версии и назначайте стажёрам." />
    <div className="mb-4"><Button onClick={() => setEdit('new')}>Создать ТЗ</Button></div>
    {q.state === 'loading' && <LoadingState />}{q.state === 'error' && <ErrorState message={userMessage(q.error)} onRetry={q.refetch} />}
    {edit && <BriefEditor key={edit === 'new' ? 'new' : `${edit.id}:${edit.revision}`} brief={edit === 'new' ? null : edit} onDone={() => { setEdit(null); q.refetch(); }} />}
    {q.state === 'empty' && <EmptyState title="Пока нет ТЗ" message="Начните с цели, требований и критериев приёмки." />}
    <div className="mt-4 space-y-4">{q.data?.map(b => <BriefCard key={`${b.id}:${b.revision}`} brief={b} onEdit={() => setEdit(b)} refresh={q.refetch} />)}</div></>;
}
function BriefEditor({ brief, onDone }: { brief: Brief | null; onDone: () => void }) {
  const [content, setContent] = useState<Content>(brief?.draft?.content ?? brief?.latest_published_version?.content ?? initial);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const field = (name: 'title' | 'goal' | 'expected_result', label: string, max: number) => <label className="block text-sm">{label}<textarea required maxLength={max} className={input} value={content[name]} onChange={e => setContent({ ...content, [name]: e.target.value })} /></label>;
  return <Card><h2 className="mb-3 text-lg font-semibold">{brief ? 'Новая редакция ТЗ' : 'Черновик ТЗ'}</h2><form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { C.BriefContent.parse(content); await write3(brief ? `/task-briefs/${brief.id}/draft` : '/task-briefs', brief ? { content, expected_revision: brief.revision } : { content }, C.TaskBrief); onDone(); } catch (e) { setError(userMessage(e, 'Проверьте заполнение полей и стабильные ID разделов.')); } finally { setBusy(false); } }}>
    {field('title', 'Название ТЗ', 160)}{field('goal', 'Цель', 2000)}
    {content.sections.map((s, i) => <fieldset key={s.id} className="space-y-2 rounded-xl border border-border p-3"><legend className="text-sm">Раздел {i + 1} · {s.id}</legend><label className="block text-sm">Заголовок<input required maxLength={120} className={input} value={s.title} onChange={e => setContent({ ...content, sections: content.sections.map((v, j) => j === i ? { ...v, title: e.target.value } : v) })} /></label><label className="block text-sm">Требования<textarea required maxLength={4000} className={input} value={s.text} onChange={e => setContent({ ...content, sections: content.sections.map((v, j) => j === i ? { ...v, text: e.target.value } : v) })} /></label>{content.sections.length > 1 && <Button variant="ghost" onClick={() => setContent({ ...content, sections: content.sections.filter((_, j) => i !== j) })}>Удалить раздел</Button>}</fieldset>)}
    <Button variant="secondary" disabled={content.sections.length >= 20} onClick={() => setContent({ ...content, sections: [...content.sections, { id: `section_${crypto.randomUUID().slice(0,8)}`, title: '', text: '' }] })}>Добавить раздел</Button>
    {field('expected_result', 'Ожидаемый результат', 2000)}
    {content.acceptance_criteria.map((c, i) => <label key={c.id} className="block text-sm">Критерий приёмки {i + 1}<textarea required maxLength={1000} className={input} value={c.text} onChange={e => setContent({ ...content, acceptance_criteria: content.acceptance_criteria.map((v, j) => i === j ? { ...v, text: e.target.value } : v) })} /></label>)}
    <Button variant="secondary" disabled={content.acceptance_criteria.length >= 20} onClick={() => setContent({ ...content, acceptance_criteria: [...content.acceptance_criteria, { id: `criterion_${crypto.randomUUID().slice(0,8)}`, text: '' }] })}>Добавить критерий</Button>
    <p className="text-xs text-text-secondary">Сохранение создаёт черновик. Опубликованный текст изменится только в новой версии после отдельной публикации.</p>
    {error && <p role="alert">{error}</p>}<div className="flex gap-2"><Button type="submit" disabled={busy}>Сохранить черновик</Button><Button variant="ghost" disabled={busy} onClick={onDone}>Закрыть редактор</Button></div>
  </form></Card>;
}
function BriefCard({ brief: b, onEdit, refresh }: { brief: Brief; onEdit: () => void; refresh: () => void }) {
  const interns = useLiveData(s => read3('/mentor/interns', C.InternList, s).then(r => r.items), [], []);
  const [intern, setIntern] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  async function mutate(path: string, body: unknown, assignment = false) { if (busy) return; setBusy(true); setNotice(''); try { if (assignment) await write3(path, body, C.TaskAssignment); else await write3(path, body, C.TaskBrief); refresh(); } catch (e) { setNotice(userMessage(e)); } finally { setBusy(false); } }
  return <Card><h2 className="text-lg font-semibold">{b.title}</h2><p className="my-2 text-xs text-text-secondary">{b.state === 'archived' ? 'Архив' : b.draft ? 'Есть черновик' : 'Опубликовано'} · Версия {b.latest_published_version?.version ?? '—'} · Назначений: {b.assignment_count} · Открытых отчётов: {b.open_report_count}</p><details><summary className="cursor-pointer text-sm text-primary">Посмотреть текст</summary><ContentView content={(b.draft ?? b.latest_published_version)!.content} /></details>
    {b.state !== 'archived' && <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={onEdit}>Редактировать ТЗ</Button>{b.draft && <Button disabled={busy} onClick={() => mutate(`/task-briefs/${b.id}/publish`, { expected_revision: b.revision })}>Опубликовать версию {b.draft.version}</Button>}<Button variant="ghost" disabled={busy} onClick={() => mutate(`/task-briefs/${b.id}/archive`, { expected_revision: b.revision })}>В архив</Button></div>
    {b.latest_published_version && <div className="flex flex-wrap items-end gap-2"><label className="flex-1 text-sm">Назначить стажёру<select className={input} value={intern} onChange={e => setIntern(e.target.value)}><option value="">Выберите стажёра</option>{interns.data?.map(i => <option key={i.id} value={i.id}>{i.display_name}</option>)}</select></label><Button disabled={busy || !intern} onClick={() => mutate('/task-assignments', { brief_id: b.id, brief_version: b.latest_published_version!.version, intern_id: intern }, true)}>Назначить</Button></div>}
    {interns.state === 'error' && <ErrorState message={userMessage(interns.error)} onRetry={interns.refetch} />}</div>}{notice && <p role="alert" className="mt-3">{notice}</p>}</Card>;
}
export function ReportsPage({ id }: { id?: string }) {
  const q = useLiveData(listReports, [], []);
  const reports = q.data?.filter(r => !id || r.id === id);
  return <><PageHeader title="Понятность заданий" subtitle="Повторные затруднения по одной версии и разделу. Гипотезы требуют человеческого решения." /><div className="mb-4"><Button variant="secondary" onClick={q.refetch}>Обновить отчёты</Button></div>{q.state === 'loading' && <LoadingState />}{q.state === 'error' && <ErrorState message={userMessage(q.error)} onRetry={q.refetch} />}{reports?.length === 0 && <EmptyState title="Отчётов пока нет" message="Отчёт появится после отметок двух разных стажёров в одной группе за 30 дней." />}<div className="space-y-4">{reports?.map(r => <ReportCard key={`${r.id}:${r.version}`} r={r} refresh={q.refetch} />)}</div></>;
}
function ReportCard({ r, refresh }: { r: Report; refresh: () => void }) {
  const [reason, setReason] = useState(''); const [version, setVersion] = useState(r.latest_published_version); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const decisions = r.state === 'proposed' ? ['under_review'] : r.state === 'under_review' ? ['accepted', 'rejected'] : r.state === 'accepted' ? ['resolved'] : [];
  async function review(decision: string) { if (busy) return; setBusy(true); try { await write3(`/task-clarity-reports/${r.id}/review`, { decision, reason, expected_version: r.version, ...(decision === 'resolved' ? { resolved_version: version } : {}) }, C.TaskClarityReport); refresh(); } catch (e) { setNotice(userMessage(e)); } finally { setBusy(false); } }
  return <Card><h2 className="text-lg font-semibold">{r.brief_title}</h2><p className="my-2 text-sm text-text-secondary">Версия {r.brief_version} · {r.section_title} · {reasons[r.reason]} · {states[r.state]}</p><p className="text-sm">За 30 дней: {r.current_count} участников · Всего: {r.lifetime_count}</p><div className="my-3 rounded-xl bg-primary-light p-4 text-sm"><p><b>Гипотеза: </b>{r.hypothesis}</p><p className="mt-2"><b>Предложение: </b>{r.suggestion}</p></div><p className="text-xs text-text-secondary">{r.enrichment_status === 'pending' ? 'Гипотеза уточняется. Обновите отчёт позже.' : r.enrichment_status === 'failed' ? 'Использована безопасная шаблонная гипотеза.' : 'Гипотеза подготовлена. Проверьте её перед решением.'}</p><a className="my-3 block text-sm text-primary underline" href={href('/mentor/tasks')}>Открыть редактор заданий</a>
    {decisions.length > 0 && <><label className="block text-sm">Основание решения<textarea className={input} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>{r.state === 'accepted' && <label className="my-3 block text-sm">Опубликованная исправленная версия<input className={input} type="number" min={r.brief_version + 1} max={r.latest_published_version} value={version} onChange={e => setVersion(Number(e.target.value))} /></label>}<p className="my-3 text-xs text-text-secondary">Принятие не меняет ТЗ. Для закрытия вручную опубликуйте исправленную версию.</p><div className="flex gap-2">{decisions.map(d => <Button key={d} disabled={busy || !reason.trim() || (d === 'resolved' && version <= r.brief_version)} onClick={() => review(d)}>{d === 'under_review' ? 'Взять на рассмотрение' : d === 'accepted' ? 'Принять гипотезу' : d === 'rejected' ? 'Отклонить' : 'Связать исправление'}</Button>)}</div></>}{notice && <p role="alert" className="mt-3">{notice}</p>}</Card>;
}
