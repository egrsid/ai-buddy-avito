import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escalationPendingAction, goalBlocked, goalReady, knowledgeDoc } from '../fixtures/all-states';
import { LiveStepActionsHint, LiveStepPage } from './LiveStepPage';

const mocks = vi.hoisted(() => ({
  getStep: vi.fn(),
  getStepActions: vi.fn(),
  getKnowledge: vi.fn(),
  createCheck: vi.fn(),
  createConversation: vi.fn(),
  createAction: vi.fn(),
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
  getAction: vi.fn(),
}));

vi.mock('../lib/endpoints', () => mocks);

const blockedGoal = goalBlocked;
const blockedStep = blockedGoal.steps[2];
const readyGoal = goalReady;
const readyStep = readyGoal.steps[2];
const CONV = '00000030-0000-4000-8000-000000000030';

describe('LiveStepPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStep.mockResolvedValue(blockedStep);
    mocks.getStepActions.mockResolvedValue(['retry_check', 'escalate_to_buddy']);
    mocks.getKnowledge.mockResolvedValue(knowledgeDoc);
    mocks.createCheck.mockResolvedValue({});
    mocks.createConversation.mockResolvedValue({
      id: CONV, goal_id: blockedGoal.id, step_id: blockedStep.id, created_at: '2026-11-11T09:00:00Z',
    });
    mocks.createAction.mockResolvedValue(escalationPendingAction);
    mocks.confirmAction.mockResolvedValue({ ...escalationPendingAction, status: 'executing' });
    mocks.cancelAction.mockResolvedValue({ ...escalationPendingAction, status: 'cancelled' });
    mocks.getAction.mockResolvedValue({
      ...escalationPendingAction,
      status: 'succeeded',
      result: { escalation_id: '00000052-0000-4000-8000-000000000052' },
    });
  });

  it('data: шаг, блокер, evidence', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    expect(await screen.findByRole('heading', { name: blockedStep.title })).toBeInTheDocument();
    expect(screen.getAllByText('DB_SSL_REQUIRED').length).toBeGreaterThan(0);
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('инструкция грузится отдельным запросом и открывается в drawer', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Инструкция/ }));
    expect(mocks.getKnowledge).toHaveBeenCalledWith(knowledgeDoc.id === '0000000a-0000-4000-8000-00000000000a' ? knowledgeDoc.id : knowledgeDoc.id);
    expect((await screen.findByRole('dialog')).textContent).toContain('Синтетическая инструкция подключения');
  });

  it('повторная проверка: POST checks с expected_version и refetch', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Повторить проверку/ }));
    expect(mocks.createCheck).toHaveBeenCalledWith(blockedGoal.id, blockedStep.id, {
      method: 'mock_db_connection',
      options: { ssl_mode: 'require' },
      expected_version: blockedStep.version,
    });
  });

  it('ready-шаг: кнопка запуска проверки вызывает createCheck', async () => {
    mocks.getStep.mockResolvedValue(readyStep);
    render(<LiveStepPage goalId={readyGoal.id} stepId={readyStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Запустить проверку/ }));
    expect(mocks.createCheck).toHaveBeenCalledWith(readyGoal.id, readyStep.id, {
      method: 'mock_db_connection',
      options: { ssl_mode: 'require' },
      expected_version: readyStep.version,
    });
  });

  it('эскалация: conversation → action → confirm → опрос до succeeded', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Спросить наставника/ }));
    expect(mocks.createConversation).toHaveBeenCalledWith(blockedGoal.id, blockedStep.id);
    // карточка действия появляется после createAction
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить' }));
    expect(mocks.createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: CONV,
        goal_id: blockedGoal.id,
        step_id: blockedStep.id,
        type: 'escalate_to_buddy',
      }),
    );
    expect(mocks.confirmAction).toHaveBeenCalledWith(escalationPendingAction.id);
    // статус executing → опрос getAction до succeeded
    expect(await screen.findByText(/Вопрос передан наставнику/, undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it('эскалация: cancel', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Спросить наставника/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    expect(mocks.cancelAction).toHaveBeenCalledWith(escalationPendingAction.id);
    expect(await screen.findByText('Действие отменено и не выполнялось.')).toBeInTheDocument();
  });

  it('error: состояние ошибки с retry', async () => {
    mocks.getStep.mockRejectedValueOnce(new Error('down'));
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('heading', { name: blockedStep.title })).toBeInTheDocument();
  });

  it('проверка упала: notice об ошибке запуска', async () => {
    mocks.createCheck.mockRejectedValueOnce(new Error('boom'));
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Повторить проверку/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Проверка не запустилась.');
  });

  it('эскалация упала на createAction: notice без карточки', async () => {
    mocks.createAction.mockRejectedValueOnce(new Error('conflict'));
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Спросить наставника/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подготовить передачу наставнику.');
  });

  it('отмена действия упала: notice об ошибке', async () => {
    mocks.cancelAction.mockRejectedValueOnce(new Error('gone'));
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Спросить наставника/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Отмена не прошла.');
  });

  it('drawer закрывается кнопкой', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Инструкция/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Закрыть/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('LiveStepActionsHint: allowlist с сервера', async () => {
    render(<LiveStepActionsHint goalId={blockedGoal.id} stepId={blockedStep.id} />);
    expect(
      await screen.findByText(/Допустимые действия: retry_check, escalate_to_buddy/),
    ).toBeInTheDocument();
  });

  it('LiveStepActionsHint: пусто до загрузки данных', () => {
    mocks.getStepActions.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<LiveStepActionsHint goalId={blockedGoal.id} stepId={blockedStep.id} />);
    expect(container).toBeEmptyDOMElement();
  });
});
