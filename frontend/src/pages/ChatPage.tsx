import { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import type { Action } from '../fixtures/all-states';
import { actions as fixtureActions } from '../fixtures/all-states';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { ActionCard } from '../components/ActionCard';

// Вспомогательный общий чат. Реальные runs/SSE/action confirm — RP-FE-02;
// здесь статичный каркас состояний на fixtures.
// ActionCard-демо: подтверждение только кнопкой карточки, текст в чате ничего не исполняет.

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  status?: string;
}

const demoMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'Что мешает подключению к БД?', time: '12:04' },
  {
    id: 'm2',
    role: 'assistant',
    content:
      'Проверка подключения завершилась ошибкой DB_SSL_REQUIRED: сервер требует SSL, а в инструкции этот шаг не описан. Могу предложить повторную проверку с ssl_mode=require или передать вопрос наставнику с диагностикой.',
    time: '12:04',
  },
];

export function ChatPage({ view }: { view: ViewState }) {
  const result = useMockData<ChatMessage[]>(demoMessages, [], view);
  // Демо action-card в контексте диалога: pending → confirm → executing → succeeded.
  const [chatAction, setChatAction] = useState<Action>(fixtureActions[0]);

  const confirmChatAction = () => {
    setChatAction((a) => ({ ...a, status: 'executing' }));
    setTimeout(() => {
      setChatAction((a) =>
        a.status === 'executing'
          ? { ...a, status: 'succeeded', result: { access_request_id: '00000048-0000-4000-8000-000000000048' } }
          : a,
      );
    }, 1200);
  };

  return (
    <>
      <PageHeader title="AI-помощник" subtitle="Вспомогательный чат · ответы опираются на разрешённые источники" />
      {result.state === 'loading' && <Card><LoadingState /></Card>}
      {result.state === 'error' && (
        <ErrorState
          title="Диалог недоступен"
          message="Состояние восстанавливается по сохранённым данным, действие не повторяется автоматически."
          onRetry={() => window.location.reload()}
        />
      )}
      {result.state === 'empty' && (
        <EmptyState
          title="Сообщений пока нет"
          message="Спросите про цель, шаг, ошибку или следующее действие."
        />
      )}
      {result.state === 'data' && result.data && (
        <Card className="flex min-h-[60vh] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto" aria-live="polite">
            {result.data.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary-light px-4 py-3">
                  <p className="text-sm">{m.content}</p>
                  <p className="mt-1 text-right text-[11px] text-text-secondary">{m.time}</p>
                </div>
              ) : (
                <div key={m.id} className="flex max-w-[85%] gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light" aria-hidden>
                    <Bot size={18} className="text-primary" />
                  </span>
                  <div className="rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3">
                    <p className="text-sm leading-6">{m.content}</p>
                    <p className="mt-1 text-[11px] text-text-secondary">{m.time}</p>
                  </div>
                </div>
              ),
            )}
            <div className="max-w-[85%]" aria-label="Предложенное действие">
              <ActionCard
                action={chatAction}
                onConfirm={confirmChatAction}
                onCancel={() => setChatAction((a) => ({ ...a, status: 'cancelled' }))}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="Быстрые подсказки">
            {['Проверить доступ', 'Что мешает подключению?', 'Повторить проверку'].map((hint) => (
              <button
                key={hint}
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-primary hover:text-primary"
              >
                {hint}
              </button>
            ))}
          </div>

          <form className="mt-3 flex gap-2" onSubmit={(e) => e.preventDefault()}>
            <label className="sr-only" htmlFor="chat-input">Сообщение AI-помощнику</label>
            <input
              id="chat-input"
              type="text"
              maxLength={4000}
              placeholder="Спроси про цель, шаг, ошибку или следующее действие…"
              className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
            <Button type="submit" aria-label="Отправить">
              <Send size={16} aria-hidden />
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-text-secondary">
            Подтверждение действий выполняется только кнопкой в карточке — слово «да» в чате ничего не исполняет.
          </p>
        </Card>
      )}
    </>
  );
}
