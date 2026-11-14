import { Sparkles, TriangleAlert } from 'lucide-react';
import type { AnswerOrigin } from '../lib/answerOrigin';

const LABELS: Record<AnswerOrigin, { label: string; hint: string; className: string }> = {
  unknown: {label: 'Источник ответа не подтверждён', hint: 'Нет сохранённых сведений о модели.', className: 'bg-surface-muted text-text-secondary'},
  mock: {label: 'Демо · без LLM', hint: 'Запущен offline-режим. Ответ подготовлен по разрешённым документам и шаблонам.', className: 'bg-amber-50 text-amber-800'},
  ai: {
    label: 'Сгенерировано ИИ',
    hint: 'Ответ написала языковая модель по разрешённым документам. Проверяйте по источникам.',
    className: 'bg-primary-light text-primary',
  },
  'ai-reserve': {
    label: 'Сгенерировано ИИ · резервная модель',
    hint: 'Основная модель не ответила, ответ написала резервная модель.',
    className: 'bg-primary-light text-primary',
  },
  fallback: {
    label: 'Fallback · без ИИ',
    hint: 'Языковая модель недоступна: ответ собран по шаблону из разрешённых документов. Он не подтверждает выполнение шага.',
    className: 'bg-amber-50 text-amber-800',
  },
};

export function AnswerOriginBadge({ origin, interrupted = false }: { origin: AnswerOrigin; interrupted?: boolean }) {
  const { label, hint, className } = LABELS[origin];
  const Icon = origin === 'fallback' ? TriangleAlert : Sparkles;
  return (
    <div className="mb-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
        title={hint}
      >
        <Icon size={12} aria-hidden />
        {label}
        {interrupted && ' · ответ прервался'}
      </span>
      {origin === 'fallback' && <p className="mt-1 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}
