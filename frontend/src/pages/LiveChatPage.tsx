import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Square } from 'lucide-react';
import type { z } from 'zod';
import type { Action } from '../fixtures/all-states';
import { KnowledgeDocument, Message, Run } from '../contracts/public';
import { Source } from '../contracts/common';
import {
  cancelAction as apiCancelAction,
  cancelRun,
  confirmAction as apiConfirmAction,
  createConversation,
  createRun,
  getAction,
  getKnowledge,
  listConversations,
  listMessages,
} from '../lib/endpoints';
import { isTerminalEvent, streamRunEvents } from '../lib/sse';
import type { SseEvent } from '../lib/sse';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { ActionCard } from '../components/ActionCard';
import { FormattedText } from '../components/FormattedText';
import { SourceDrawer } from '../components/SourceDrawer';
import { AnswerOriginBadge } from '../components/AnswerOriginBadge';
import { classifyAnswer, originFromServer } from '../lib/answerOrigin';
import type { ResponseOrigin } from '../contracts/v3';
import { listMessageOrigins } from '../lib/v3';

// RP-FE-02: live-чат. Диалог goal_id/step_id = null (общий).
// Run запускается POST /runs, стрим — GET /runs/{id}/events (SSE).
// Истина после разрыва — GET run/messages (контракт: disconnect не гарантирует доставку).
// «Да» в чате ничего не исполняет: confirm — только кнопка ActionCard конкретного action.id.

type MessageT = z.infer<typeof Message>;
type RunT = z.infer<typeof Run>;
type SourceT = z.infer<typeof Source>;
type ResponseOriginT = z.infer<typeof ResponseOrigin>;

export function LiveChatPage({ goalId = null, stepId = null, embedded = false, onActionChanged }: {
  goalId?: string | null; stepId?: string | null; embedded?: boolean; onActionChanged?: () => void;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = goalId === null
          ? (await listConversations()).find((c) => c.goal_id === null) : null;
        const conversation = existing ?? (await createConversation(goalId, stepId));
        if (!cancelled) setConversationId(conversation.id);
      } catch (e) {
        if (!cancelled) setSetupError(userMessage(e, 'Не удалось открыть диалог.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goalId, stepId]);

  if (setupError) return <ErrorState title="Диалог недоступен" message={setupError} />;
  if (!conversationId) return <Card><LoadingState /></Card>;
  return <LiveChatConversation conversationId={conversationId} embedded={embedded} onActionChanged={onActionChanged} />;
}

function LiveChatConversation({ conversationId, embedded, onActionChanged }: {
  conversationId: string; embedded: boolean; onActionChanged?: () => void;
}) {
  // keepPrevious: после отправки лента не исчезает на время перечитывания — экран не прыгает.
  const messages = useLiveData(() => listMessages(conversationId), [conversationId], [], { keepPrevious: true });
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestData = useRef(messages.data);
  latestData.current = messages.data;
  const settleFrom = useRef<unknown>(undefined);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (!settling) return;
    if (messages.data !== settleFrom.current || messages.state === 'error') {
      setStreamText('');
      setStreamSources([]);
      setSettling(false);
    }
  }, [settling, messages.data, messages.state]);
  // Сохранённое сообщение уже пришло: поток прячем в той же отрисовке. Эффект выше очистит его
  // только после неё, и без этого ответ на один кадр виден дважды.
  const settled = settling && messages.data !== settleFrom.current;
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [streamText, setStreamText] = useState('');
  const [streamSources, setStreamSources] = useState<SourceT[]>([]);
  const [activeRun, setActiveRun] = useState<RunT | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [document, setDocument] = useState<z.infer<typeof KnowledgeDocument> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [streamOrigin, setStreamOrigin] = useState<ResponseOriginT>();
  const [origins, setOrigins] = useState<Record<string, ResponseOriginT>>({});
  // История происхождения ответов: после каждой перезагрузки сообщений. Ошибка — не критична,
  // тогда источник остаётся неподтверждённым.
  useEffect(() => {
    if (messages.state !== 'data') return;
    let active = true;
    listMessageOrigins(conversationId)
      .then((items) => {
        if (!active) return;
        setOrigins((current) => ({ ...current, ...Object.fromEntries(items.map((i) => [i.message_id, i.origin])) }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [conversationId, messages.state, messages.data]);
  const openDocument = async (id: string) => {
    setNotice(null);
    setDocument(null);
    try { setDocument(await getKnowledge(id)); }
    catch (e) { setNotice(userMessage(e, 'Не удалось открыть документ. Возможно, доступ изменился.')); }
  };

  // Опрос executing/unknown действия до терминала.
  useEffect(() => {
    if (!action || (action.status !== 'executing' && action.status !== 'unknown')) return;
    const timer = setInterval(() => {
      getAction(action.id).then(setAction).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [action]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Новое сообщение, кусок ответа или карточка действия — прокручиваем ленту к низу.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data, streamText, activeRun, action]);

  const handleEvent = (event: SseEvent) => {
    switch (event.type) {
      case 'message.delta':
        setStreamText((t) => t + event.data.text);
        break;
      case 'message.sources':
        setStreamSources(event.data.sources);
        break;
      case 'action.proposed':
        setAction(event.data.action);
        break;
      case 'message.origin':
        setStreamOrigin(event.data.origin);
        setOrigins((current) => ({ ...current, [event.data.message_id]: event.data.origin }));
        break;
      default:
        if (isTerminalEvent(event.type)) {
          setActiveRun(null);
          // Потоковый текст остаётся на экране, пока не придёт сохранённое сообщение,
          // иначе ответ на миг пропадает.
          settleFrom.current = latestData.current;
          setSettling(true);
          messages.refetch();
          if (event.type === 'run.failed') {
            setNotice(`Генерация не удалась (${event.data.code}). Сообщение сохранено, действие не выполнялось.`);
          }
        }
    }
  };

  const send = async (content: string) => {
    if (sendingRef.current || activeRun) return;
    sendingRef.current = true;
    setSending(true);
    setNotice(null);
    setStreamText('');
    setStreamOrigin(undefined);
    setStreamSources([]);
    try {
      const run = await createRun(conversationId, { content });
      setActiveRun(run);
      setDraft('');
      // Вопрос уже сохранён Go: показываем его сразу, не дожидаясь ответа.
      messages.refetch();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void streamRunEvents(run.id, {
        onEvent: handleEvent,
        onError: () => {
          setActiveRun(null);
          setNotice('Поток прерван. Состояние восстановлено из сохранённых данных.');
          messages.refetch();
        },
        signal: controller.signal,
      });
    } catch (e) {
      setNotice(userMessage(e, 'Сообщение не отправлено.'));
    } finally { sendingRef.current = false; setSending(false); }
  };

  const stop = async () => {
    if (!activeRun) return;
    try {
      await cancelRun(activeRun.id);
    } catch {
      // cancel идемпотентен; состояние подтянет refetch
    }
    abortRef.current?.abort();
    setActiveRun(null);
    setStreamText('');
    messages.refetch();
  };

  const confirm = async (id: string) => {
    try {
      setAction(await apiConfirmAction(id));
      onActionChanged?.();
    } catch (e) {
      setNotice(userMessage(e, 'Подтверждение не прошло.'));
    }
  };

  const cancelActionById = async (id: string) => {
    try {
      setAction(await apiCancelAction(id));
    } catch (e) {
      setNotice(userMessage(e, 'Отмена не прошла.'));
    }
  };

  const hints = embedded ? STEP_HINTS : CHAT_HINTS;
  return (
    // Как в веб-чатах: страница не листается, листается только лента, ввод всегда внизу.
    <div className={embedded ? '' : 'flex h-[calc(100dvh-5.5rem)] flex-col md:h-[calc(100dvh-3rem)]'}>
      <PageHeader title={embedded ? 'Помощь с этим шагом' : 'AI-помощник'} subtitle="Следующее действие и подходящие инструкции" />
      <SourceDrawer open={document !== null} title={document?.title ?? ''} content={document?.content ?? ''} version={document?.version ?? 1} onClose={() => setDocument(null)} />
      {messages.state === 'loading' && <Card><LoadingState /></Card>}
      {messages.state === 'error' && (
        <ErrorState message={userMessage(messages.error)} onRetry={messages.refetch} />
      )}
      {(messages.state === 'empty' || messages.state === 'data') && (
        <Card className={`flex min-h-0 flex-col ${embedded ? 'h-[34rem]' : 'flex-1'}`}>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite" aria-label="Переписка">
            {messages.state === 'empty' && (
              <EmptyState title="Сообщений пока нет" message="Спросите про цель, шаг, ошибку или следующее действие." />
            )}
            {messages.data?.map((m) => (
              <ChatMessage key={m.id} message={m} origin={origins[m.id]} onDocument={openDocument} />
            ))}
            {activeRun && !streamText && (
              <div className="flex max-w-[85%] gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light" aria-hidden>
                  <Bot size={18} className="text-primary" />
                </span>
                <div className="rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3">
                  <p className="animate-pulse text-sm text-text-secondary" role="status">ИИ готовит ответ…</p>
                </div>
              </div>
            )}
            {streamText && !settled && (
              <div className="flex max-w-[85%] gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light" aria-hidden>
                  <Bot size={18} className="text-primary" />
                </span>
                <div className="rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3">
                  <StreamingAnswer origin={streamOrigin} text={streamText} sources={streamSources} onDocument={openDocument} />
                  <p className="mt-1 text-[11px] text-text-secondary" role="status">генерация…</p>
                </div>
              </div>
            )}
            {streamSources.length > 0 && !settled && (
              <ul className="max-w-[85%] space-y-1 text-xs text-text-secondary" aria-label="Источники ответа">
                {streamSources.filter(s => !streamText.includes(`](${s.url})`)).map((s) => (
                  <li key={s.document_id}><DocumentLink source={s} onDocument={openDocument} /></li>
                ))}
              </ul>
            )}
            {action && (
              <div className="max-w-[85%]" aria-label="Предложенное действие">
                <ActionCard action={action} onConfirm={confirm} onCancel={cancelActionById} />
              </div>
            )}
          </div>

          {notice && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>}

          <div className="mt-3 flex flex-wrap gap-2" aria-label="Быстрые подсказки">
            {hints.map((hint) => (
              <button
                key={hint}
                type="button"
                disabled={sending || activeRun !== null}
                onClick={() => void send(hint)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hint}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && !activeRun) void send(draft.trim());
            }}
          >
            <label className="sr-only" htmlFor="chat-input">Сообщение AI-помощнику</label>
            <input
              id="chat-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={4000}
              placeholder="Спроси про цель, шаг, ошибку или следующее действие…"
              className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
            {activeRun ? (
              <Button type="button" variant="secondary" onClick={stop} ariaLabel="Остановить генерацию">
                <Square size={16} aria-hidden />
              </Button>
            ) : (
              <Button type="submit" ariaLabel="Отправить" disabled={sending || !draft.trim()}>
                <Send size={16} aria-hidden />
              </Button>
            )}
          </form>
          <p className="mt-2 text-[11px] text-text-secondary">
            Подтверждение действий выполняется только кнопкой в карточке — слово «да» в чате ничего не исполняет.
          </p>
        </Card>
      )}
    </div>
  );
}

// Подсказки уходят в чат сразу по нажатию — как обычный вопрос стажёра.
export const CHAT_HINTS = ['Что мне делать дальше?', 'Почему шаг заблокирован?', 'Как запросить доступ к тестовой БД?'];
export const STEP_HINTS = ['Что сделать на этом шаге?', 'Почему не проходит проверка?', 'Что написано в инструкции?'];

function DocumentLink({ source, onDocument }: { source: SourceT; onDocument: (id: string) => void }) {
  return <a href={source.url} className="text-primary underline underline-offset-4" onClick={e => { e.preventDefault(); onDocument(source.document_id); }}>{source.title}</a>;
}

function StreamingAnswer({ text, sources, onDocument, origin }: {
  origin?: ResponseOriginT; text: string; sources: SourceT[]; onDocument: (id: string) => void;
}) {
  const answer = classifyAnswer(text);
  return (
    <>
      <AnswerOriginBadge {...(originFromServer(origin) ?? {origin: 'unknown' as const})} />
      <FormattedText text={answer.text} documents={sources} onDocument={onDocument} />
    </>
  );
}

function ChatMessage({ message: m, origin, onDocument }: {
  message: MessageT; origin?: ResponseOriginT; onDocument: (id: string) => void;
}) {
  if (m.role === 'user') {
    return (
      <div data-chat-message className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary-light px-4 py-3">
        <p className="text-sm">{m.content}</p>
        <p className="mt-1 text-right text-[11px] text-text-secondary">{shortTime(m.created_at)}</p>
      </div>
    );
  }
  const answer = classifyAnswer(m.content);
  const trusted = originFromServer(origin);
  const badge = trusted ?? { origin: 'unknown' as const, interrupted: m.status !== 'completed' };
  return (
    <div data-chat-message className="flex max-w-[85%] gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light" aria-hidden>
        <Bot size={18} className="text-primary" />
      </span>
      <div className="rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3">
        <AnswerOriginBadge origin={badge.origin} interrupted={badge.interrupted} />
        <FormattedText text={answer.text} documents={m.sources} onDocument={onDocument} />
        {m.sources.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
            {m.sources.filter(s => !m.content.includes(`](${s.url})`)).map((s) => (
              <li key={s.document_id}><DocumentLink source={s} onDocument={onDocument} /></li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-text-secondary">
          {shortTime(m.created_at)}
          {m.status !== 'completed' ? ` · ${m.status}` : ''}
        </p>
      </div>
    </div>
  );
}

// «23:13» для сегодняшних сообщений, «13.11 23:13» — для более старых.
export function shortTime(stamp: string, now: Date = new Date()): string {
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return stamp;
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  return `${at.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${time}`;
}
