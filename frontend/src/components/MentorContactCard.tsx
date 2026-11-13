import { useState } from 'react';
import { Copy, ExternalLink, Send } from 'lucide-react';
import { ApiError, userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import type { ContactPreviewT, MentorContactT } from '../lib/v3';
import { createContactPreview, exportContact, getMentorContact } from '../lib/v3';
import { Button, Card, LoadingState } from './ui';

// V3-CONTACT: личное сообщение наставнику в Telegram вместо внутреннего обращения.
// Go строит ссылку t.me и безопасный текст; браузер только копирует текст и открывает
// ссылку по явному нажатию. Статуса «доставлено» нет: отправляет сам стажёр.

export type ContactContext =
  | { goalId: string; stepId: string }
  | { assignmentId: string; sectionId?: string };

function previewRequest(context: ContactContext, question: string) {
  const extra = question.trim() ? { question: question.trim() } : {};
  if ('goalId' in context) return { goal_id: context.goalId, step_id: context.stepId, ...extra };
  return {
    assignment_id: context.assignmentId,
    ...(context.sectionId ? { section_id: context.sectionId } : {}),
    ...extra,
  };
}

function hhmm(stamp: string) {
  return new Date(stamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function openTelegram(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function MentorContactCard({ context, title = 'Написать наставнику' }: { context?: ContactContext; title?: string }) {
  const contact = useLiveData(() => getMentorContact(), [], null as MentorContactT | null);

  if (contact.state === 'loading') return <Card><LoadingState label="Ищем контакт наставника…" /></Card>;
  if (contact.state === 'error' || !contact.data) {
    return (
      <Card>
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="text-xs text-text-secondary">{userMessage(contact.error, 'Контакт наставника сейчас недоступен.')}</p>
      </Card>
    );
  }
  if (contact.data.status === 'missing') {
    return (
      <Card>
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="text-xs text-text-secondary">
          Telegram наставника не указан. Свяжитесь с ним привычным способом — ссылку добавит администратор.
        </p>
      </Card>
    );
  }
  return <ContactPanel contact={contact.data} context={context} title={title} />;
}

function ContactPanel({ contact, context, title }: {
  contact: Extract<MentorContactT, { status: 'available' }>;
  context?: ContactContext;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [preview, setPreview] = useState<ContactPreviewT | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    if (!context) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setPreview(await createContactPreview(previewRequest(context, question)));
    } catch (e) {
      setError(userMessage(e, 'Не удалось подготовить текст.'));
    } finally {
      setBusy(false);
    }
  };

  // Текст берём из export: Go заново проверяет права и что данные не изменились.
  const copy = async (thenOpen: boolean) => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const exported = await exportContact(preview);
      try {
        await navigator.clipboard.writeText(exported.text);
        setStatus('Текст скопирован.');
      } catch {
        setError('Браузер не дал скопировать — выделите текст ниже и скопируйте вручную.');
      }
      if (thenOpen) {
        openTelegram(exported.telegram_url);
        setStatus((s) => `${s ?? ''} Telegram открыт — вставьте текст и отправьте сообщение сами.`.trim());
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setPreview(null);
        setError('Данные шага или контакт изменились, либо текст устарел. Подготовьте сообщение заново.');
      } else {
        setError(userMessage(e, 'Не удалось получить текст.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Send size={16} className="text-primary" aria-hidden /> {title}
      </h3>
      <p className="text-xs text-text-secondary">
        Ваш наставник: {contact.display_name}. Сообщение отправляете вы сами в Telegram — система его не читает и не знает, ответил ли он.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {context && !open && (
          <Button onClick={() => setOpen(true)}>Подготовить сообщение</Button>
        )}
        <Button variant="secondary" onClick={() => openTelegram(contact.telegram_url)}>
          <ExternalLink size={14} className="mr-1 inline" aria-hidden /> Открыть Telegram
        </Button>
      </div>
      {open && context && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            Вопрос наставнику (необязательно)
            <textarea
              value={question}
              maxLength={500}
              onChange={(e) => { setQuestion(e.target.value); setPreview(null); }}
              className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
              rows={2}
              placeholder="Например: не понимаю, какой режим SSL выбрать"
            />
          </label>
          {!preview && <Button variant="secondary" disabled={busy} onClick={prepare}>Показать текст сообщения</Button>}
          {preview && (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                Так увидит наставник. Логов, паролей и личных данных здесь нет. Текст действует до {hhmm(preview.expires_at)}.
              </p>
              <pre aria-label="Текст для наставника" className="whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-xs">{preview.text}</pre>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => copy(true)}>
                  <Send size={14} className="mr-1 inline" aria-hidden /> Скопировать и открыть Telegram
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => copy(false)}>
                  <Copy size={14} className="mr-1 inline" aria-hidden /> Только скопировать
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {status && <p className="mt-2 text-xs text-success" role="status">{status}</p>}
      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-error" role="alert">{error}</p>}
    </Card>
  );
}
