import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunStreamHandlers } from '../lib/sse';
import { actions as fixtureActions } from '../fixtures/all-states';
import { LiveChatPage } from './LiveChatPage';

const mocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  createRun: vi.fn(),
  cancelRun: vi.fn(),
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
  getAction: vi.fn(),
  streamRunEvents: vi.fn(),
}));

vi.mock('../lib/endpoints', () => ({
  listConversations: mocks.listConversations,
  createConversation: mocks.createConversation,
  listMessages: mocks.listMessages,
  createRun: mocks.createRun,
  cancelRun: mocks.cancelRun,
  confirmAction: mocks.confirmAction,
  cancelAction: mocks.cancelAction,
  getAction: mocks.getAction,
}));

vi.mock('../lib/sse', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/sse')>();
  return { ...orig, streamRunEvents: mocks.streamRunEvents };
});

const CONV = '00000030-0000-4000-8000-000000000030';
const RUN = '00000031-0000-4000-8000-000000000031';
const MSG_U = '00000032-0000-4000-8000-000000000032';
const MSG_A = '00000033-0000-4000-8000-000000000033';
const T = '2026-11-11T09:00:00Z';

const conversation = { id: CONV, goal_id: null, step_id: null, created_at: T };
const run = { id: RUN, conversation_id: CONV, user_message_id: MSG_U, status: 'queued', action_ids: [], created_at: T, updated_at: T };
const userMessage = { id: MSG_U, conversation_id: CONV, role: 'user', content: 'Что мешает подключению?', status: 'completed', sources: [], created_at: T };
const assistantMessage = {
  id: MSG_A, conversation_id: CONV, role: 'assistant', content: 'Нужен sslmode=require.', status: 'completed', run_id: RUN, sources: [], created_at: T,
};

const pendingAction = fixtureActions[0];

async function renderChat() {
  const utils = render(<LiveChatPage />);
  await screen.findByLabelText('Сообщение AI-помощнику');
  return utils;
}

describe('LiveChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listConversations.mockResolvedValue([]);
    mocks.createConversation.mockResolvedValue(conversation);
    mocks.listMessages.mockResolvedValue([]);
    mocks.createRun.mockResolvedValue(run);
    mocks.cancelRun.mockResolvedValue({ ...run, status: 'cancelled' });
    mocks.confirmAction.mockResolvedValue({ ...pendingAction, status: 'executing' });
    mocks.cancelAction.mockResolvedValue({ ...pendingAction, status: 'cancelled' });
    mocks.getAction.mockResolvedValue({
      ...pendingAction, status: 'succeeded',
      result: { access_request_id: '00000048-0000-4000-8000-000000000048' },
    });
  });

  it('диалог шага создаётся с goal_id и step_id, а не пустым контекстом', async () => {
    render(<LiveChatPage goalId="goal-1" stepId="check_access" />);
    await screen.findByLabelText('Сообщение AI-помощнику');
    expect(mocks.createConversation).toHaveBeenCalledWith('goal-1', 'check_access');
    expect(screen.getByText(/Диалог шага check_access/)).toBeInTheDocument();
  });

  it('создаёт общий диалог и показывает пустое состояние', async () => {
    await renderChat();
    expect(mocks.createConversation).toHaveBeenCalledWith(null, null);
    expect(await screen.findByText('Сообщений пока нет')).toBeInTheDocument();
  });

  it('использует существующий диалог без создания', async () => {
    mocks.listConversations.mockResolvedValue([conversation]);
    await renderChat();
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it('отправка: run → SSE delta → источники → completed → refetch', async () => {
    mocks.listMessages.mockResolvedValue([userMessage]);
    await renderChat();
    expect(await screen.findByText('Что мешает подключению?')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Сообщение AI-помощнику'), { target: { value: 'Повтори проверку' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(mocks.createRun).toHaveBeenCalledWith(CONV, { content: 'Повтори проверку' });

    await waitFor(() => expect(mocks.streamRunEvents).toHaveBeenCalled());
    const handlers = mocks.streamRunEvents.mock.calls[0][1] as RunStreamHandlers;
    act(() => {
      handlers.onEvent({ type: 'run.started', data: { run_id: RUN } }, 1);
      handlers.onEvent({ type: 'message.delta', data: { run_id: RUN, text: 'Проверяю…' } }, 2);
    });
    expect(screen.getByText('Проверяю…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Остановить генерацию' })).toBeInTheDocument();

    act(() => {
      handlers.onEvent({ type: 'run.completed', data: { run_id: RUN, message_id: MSG_A } }, 3);
    });
    // после терминала — refetch сообщений (истина — GET)
    expect(mocks.listMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('action.proposed → ActionCard, confirm → executing → опрос до succeeded', async () => {
    await renderChat();
    fireEvent.change(screen.getByLabelText('Сообщение AI-помощнику'), { target: { value: 'Запроси доступ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(mocks.streamRunEvents).toHaveBeenCalled());
    const handlers = mocks.streamRunEvents.mock.calls[0][1] as RunStreamHandlers;
    act(() => {
      handlers.onEvent({ type: 'action.proposed', data: { run_id: RUN, action: pendingAction } }, 2);
    });
    expect(await screen.findByText('Заявка на доступ')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(mocks.confirmAction).toHaveBeenCalledWith(pendingAction.id);
    expect(await screen.findByText(/Заявка создана/, undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it('action.proposed → cancel действия', async () => {
    await renderChat();
    fireEvent.change(screen.getByLabelText('Сообщение AI-помощнику'), { target: { value: 'Запроси доступ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() => expect(mocks.streamRunEvents).toHaveBeenCalled());
    const handlers = mocks.streamRunEvents.mock.calls[0][1] as RunStreamHandlers;
    act(() => {
      handlers.onEvent({ type: 'action.proposed', data: { run_id: RUN, action: pendingAction } }, 2);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    expect(mocks.cancelAction).toHaveBeenCalledWith(pendingAction.id);
  });

  it('остановка генерации: cancelRun', async () => {
    await renderChat();
    fireEvent.change(screen.getByLabelText('Сообщение AI-помощнику'), { target: { value: 'Стоп' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Остановить генерацию' }));
    expect(mocks.cancelRun).toHaveBeenCalledWith(RUN);
  });

  it('run.failed: сообщение без потери данных', async () => {
    await renderChat();
    fireEvent.change(screen.getByLabelText('Сообщение AI-помощнику'), { target: { value: 'Вопрос' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() => expect(mocks.streamRunEvents).toHaveBeenCalled());
    const handlers = mocks.streamRunEvents.mock.calls[0][1] as RunStreamHandlers;
    act(() => {
      handlers.onEvent(
        { type: 'run.failed', data: { run_id: RUN, code: 'UPSTREAM_ERROR', message: 'Сервис недоступен' } },
        2,
      );
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Генерация не удалась (UPSTREAM_ERROR)');
  });

  it('истории сообщений: user и assistant с источниками', async () => {
    mocks.listMessages.mockResolvedValue([
      userMessage,
      {
        ...assistantMessage,
        sources: [{
          document_id: '0000000a-0000-4000-8000-00000000000a',
          version: 1,
          title: 'Синтетическая инструкция подключения',
          url: '/api/v2/knowledge/0000000a-0000-4000-8000-00000000000a',
          excerpt: 'фрагмент',
        }],
      },
    ]);
    await renderChat();
    expect(await screen.findByText('Нужен sslmode=require.')).toBeInTheDocument();
    expect(screen.getByText(/Синтетическая инструкция подключения \(v1\)/)).toBeInTheDocument();
  });
});
