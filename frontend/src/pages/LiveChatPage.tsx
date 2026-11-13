import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Square } from 'lucide-react';
import type { z } from 'zod';
import type { Action } from '../fixtures/all-states';
import { Message, Run } from '../contracts/public';
import { Source } from '../contracts/common';
import {
  cancelAction as apiCancelAction,
  cancelRun,
  confirmAction as apiConfirmAction,
  createConversation,
  createRun,
  getAction,
  listConversations,
  listMessages,
} from '../lib/endpoints';
import { isTerminalEvent, streamRunEvents } from '../lib/sse';
import type { SseEvent } from '../lib/sse';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { ActionCard } from '../components/ActionCard';

// RP-FE-02: live-чат. Без goal/step диалог общий.
// Со страницы шага открывается диалог этой цели и шага, чтобы черновик не терял контекст.
// Run запускается POST /runs, стрим — GET /runs/{id}/events (SSE).
// Истина после разрыва — GET run/messages (контракт: disconnect не гарантирует доставку).
// «Да» в чате ничего не исполняет: confirm — только кнопка ActionCard конкретного action.id.

type MessageT = z.infer<typeof Message>;
type RunT = z.infer<typeof Run>;
type SourceT = z.infer<typeof Source>;

export function LiveChatPage({
  goalId = null,
  stepId = null,
}: {
  goalId?: string | null;
  stepId?: string | null;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConversationId(null);
    setSetupError(null);
    (async () => {
      try {
        const existing = (await listConversations()).find(
          (c) => c.goal_id === goalId && c.step_id === stepId,
        );
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
  return <LiveChatConversation conversationId={conversationId} goalId={goalId} stepId={stepId} />;
}

function LiveChatConversation({
  conversationId,
  goalId,
  stepId,
}: {
  conversationId: string;
  goalId: string | null;
  stepId: string | null;
}) {
  const messages = useLiveData(() => listMessages(conversationId), [conversationId], []);
  const [draft, setDraft] = useState('');
  const [streamText, setStreamText] = useState('');
  const [streamSources, setStreamSources] = useState<SourceT[]>([]);
  const [activeRun, setActiveRun] = useState<RunT | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Опрос executing/unknown действия до терминала.
  useEffect(() => {
    if (!action || (action.status !== 'executing' && action.status !== 'unknown')) return;
    const timer = setInterval(() => {
      getAction(action.id).then(setAction).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [action]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
      default:
        if (isTerminalEvent(event.type)) {
          setActiveRun(null);
          setStreamText('');
          setStreamSources([]);
          messages.refetch();
          if (event.type === 'run.failed') {
            setNotice(`Генерация не удалась (${event.data.code}). Сообщение сохранено, действие не выполнялось.`);
          }
        }
    }
  };

  const send = async (content: string) => {
    setNotice(null);
    setStreamText('');
    setStreamSources([]);
    try {
      const run = await createRun(conversationId, { content });
      setActiveRun(run);
      setDraft('');
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
    }
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

  return (
    <>
      <PageHeader
        title="AI-помощник"
        subtitle={
          goalId && stepId
            ? `Диалог шага ${stepId} · ответы только по разрешённым источникам`
            : 'Ответы опираются на разрешённые источники · live API'
        }
      />
      {messages.state === 'loading' && <Card><LoadingState /></Card>}
      {messages.state === 'error' && (
        <ErrorState message={userMessage(messages.error)} onRetry={messages.refetch} />
      )}
      {(messages.state === 'empty' || messages.state === 'data') && (
        <Card className="flex min-h-[60vh] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto" aria-live="polite">
            {messages.state === 'empty' && (
              <EmptyState title="Сообщений пока нет" message="Спросите про цель, шаг, ошибку или следующее действие." />
            )}
            {messages.data?.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
            {streamText && (
              <div className="flex max-w-[85%] gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light" aria-hidden>
                  <Bot size={18} className="text-primary" />
                </span>
                <div className="rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3">
                  <p className="text-sm leading-6">{streamText}</p>
                  <p className="mt-1 text-[11px] text-text-secondary" role="status">генерация…</p>
                </div>
              </div>
            )}
            {streamSources.length > 0 && (
              <ul className="max-w-[85%] space-y-1 text-xs text-text-secondary" aria-label="Источники ответа">
                {streamSources.map((s) => (
                  <li key={s.document_id}>· {s.title} (v{s.version})</li>
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
              <Button type="submit" ariaLabel="Отправить" disabled={!draft.trim()}>
                <Send size={16} aria-hidden />
              </Button>
            )}
          </form>
          <p className="mt-2 text-[11px] text-text-secondary">
            Подтверждение действий выполняется только кнопкой в карточке — слово «да» в чате ничего не исполняет.
          </p>
        </Card>
      )}
    </>
  );
}

function ChatMessage({ message: m }: { message: MessageT }) {
  if (m.role === 'user') {
    return (
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary-light px-4 py-3">
        <p className="text-sm">{m.content}</p>
        <p className="mt-1 text-right text-[11px] text-text-secondary">{m.created_at}</p>
      </div>
    );
  }
  return (
    <div className="flex max-w-[85%] gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light" aria-hidden>
        <Bot size={18} className="text-primary" />
      </span>
      <div className="rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3">
        <p className="text-sm leading-6">{m.content}</p>
        {m.sources.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
            {m.sources.map((s) => (
              <li key={s.document_id}>· {s.title} (v{s.version})</li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-text-secondary">
          {m.created_at}
          {m.status !== 'completed' ? ` · ${m.status}` : ''}
        </p>
      </div>
    </div>
  );
}
