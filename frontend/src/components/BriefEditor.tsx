import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BriefContentT } from '../lib/v3';
import { Button } from './ui';

// Редактор текста ТЗ. id разделов и критериев стабильны: новые получают следующий
// свободный id, существующие сохраняют свой — по ним считаются отметки стажёров.

export function emptyBrief(): BriefContentT {
  return {
    title: '',
    goal: '',
    sections: [{ id: 'section-1', title: '', text: '' }],
    expected_result: '',
    acceptance_criteria: [{ id: 'criterion-1', text: '' }],
    refs: [],
  };
}

export function nextId(prefix: string, used: string[]): string {
  let n = used.length + 1;
  while (used.includes(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

// Пустые критерии отбрасываем, остальное сервер проверит по схеме.
export function cleanBrief(content: BriefContentT): BriefContentT {
  return {
    ...content,
    title: content.title.trim(),
    goal: content.goal.trim(),
    expected_result: content.expected_result.trim(),
    sections: content.sections.map((s) => ({ ...s, title: s.title.trim(), text: s.text.trim() })),
    acceptance_criteria: content.acceptance_criteria
      .map((c) => ({ ...c, text: c.text.trim() }))
      .filter((c) => c.text.length > 0),
  };
}

export function briefProblems(content: BriefContentT): string[] {
  const c = cleanBrief(content);
  const problems: string[] = [];
  if (!c.title) problems.push('Укажите название.');
  if (!c.goal) problems.push('Опишите цель задания.');
  if (!c.expected_result) problems.push('Опишите ожидаемый результат.');
  if (c.sections.length === 0) problems.push('Нужен хотя бы один раздел.');
  if (c.sections.some((s) => !s.title || !s.text)) problems.push('У каждого раздела нужны заголовок и текст.');
  return problems;
}

const field = 'mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary';

export function BriefEditor({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: BriefContentT;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (content: BriefContentT) => void;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState<BriefContentT>(initial);
  const [showProblems, setShowProblems] = useState(false);
  const problems = briefProblems(content);

  const set = (patch: Partial<BriefContentT>) => setContent((c) => ({ ...c, ...patch }));
  const setSection = (index: number, patch: Partial<BriefContentT['sections'][number]>) =>
    set({ sections: content.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const setCriterion = (index: number, text: string) =>
    set({ acceptance_criteria: content.acceptance_criteria.map((c, i) => (i === index ? { ...c, text } : c)) });

  const submit = () => {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    onSubmit(cleanBrief(content));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block text-sm font-medium">
        Название
        <input value={content.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} className={field} />
      </label>
      <label className="block text-sm font-medium">
        Цель задания
        <textarea value={content.goal} maxLength={2000} rows={2} onChange={(e) => set({ goal: e.target.value })} className={field} />
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Разделы</legend>
        {content.sections.map((section, index) => (
          <div key={section.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-secondary">Раздел {index + 1} · id {section.id}</span>
              {content.sections.length > 1 && (
                <Button
                  variant="ghost"
                  ariaLabel={`Удалить раздел ${index + 1}`}
                  onClick={() => set({ sections: content.sections.filter((_, i) => i !== index) })}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
            </div>
            <label className="block text-sm">
              Заголовок раздела
              <input value={section.title} maxLength={120} onChange={(e) => setSection(index, { title: e.target.value })} className={field} />
            </label>
            <label className="mt-2 block text-sm">
              Текст раздела
              <textarea value={section.text} maxLength={4000} rows={3} onChange={(e) => setSection(index, { text: e.target.value })} className={field} />
            </label>
          </div>
        ))}
        {content.sections.length < 20 && (
          <Button
            variant="secondary"
            onClick={() => set({ sections: [...content.sections, { id: nextId('section', content.sections.map((s) => s.id)), title: '', text: '' }] })}
          >
            <Plus size={14} className="mr-1 inline" aria-hidden /> Добавить раздел
          </Button>
        )}
      </fieldset>

      <label className="block text-sm font-medium">
        Ожидаемый результат
        <textarea value={content.expected_result} maxLength={2000} rows={2} onChange={(e) => set({ expected_result: e.target.value })} className={field} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Критерии приёмки</legend>
        {content.acceptance_criteria.map((criterion, index) => (
          <div key={criterion.id} className="flex items-center gap-2">
            <input
              aria-label={`Критерий ${index + 1}`}
              value={criterion.text}
              maxLength={1000}
              onChange={(e) => setCriterion(index, e.target.value)}
              className={field}
            />
            <Button
              variant="ghost"
              ariaLabel={`Удалить критерий ${index + 1}`}
              onClick={() => set({ acceptance_criteria: content.acceptance_criteria.filter((_, i) => i !== index) })}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
        ))}
        {content.acceptance_criteria.length < 20 && (
          <Button
            variant="secondary"
            onClick={() => set({
              acceptance_criteria: [...content.acceptance_criteria, { id: nextId('criterion', content.acceptance_criteria.map((c) => c.id)), text: '' }],
            })}
          >
            <Plus size={14} className="mr-1 inline" aria-hidden /> Добавить критерий
          </Button>
        )}
      </fieldset>

      {content.refs.length > 0 && (
        <p className="text-xs text-text-secondary">Связанные инструкции ({content.refs.length}) сохраняются без изменений.</p>
      )}
      {showProblems && problems.length > 0 && (
        <ul className="rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Отмена</Button>}
      </div>
    </form>
  );
}
