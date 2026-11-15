import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, escalationPendingAction, goalBlocked, goalReady, knowledgeDoc } from '../fixtures/all-states';
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
  getGoal: vi.fn(),
}));

vi.mock('../lib/endpoints', () => mocks);
vi.mock('../components/MentorContactCard', () => ({
  MentorContactCard: ({ context, title }: { context: { goalId: string; stepId: string }; title: string }) =>
    <div aria-label="Telegram наставника" data-goal={context.goalId} data-step={context.stepId}>{title}</div>,
}));
vi.mock('./LiveChatPage', () => ({
  LiveChatPage: ({ goalId, stepId }: { goalId: string; stepId: string }) =>
    <div aria-label="Контекст AI" data-goal={goalId} data-step={stepId} />,
}));

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
    mocks.getGoal.mockResolvedValue(blockedGoal);
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

  it('заявка на доступ собирается из цели и подтверждается отдельной карточкой', async () => {
    const accessStep = {
      ...blockedStep,
      id: 'check_access',
      available_actions: ['create_access_request', 'retry_check'],
      verification_method: 'iam_permission_present' as const,
      blockers: [{
        ...blockedStep.blockers[0],
        error_code: 'ACCESS_MISSING',
        recovery_actions: ['create_access_request', 'retry_check'],
      }],
    };
    mocks.getStep.mockResolvedValue(accessStep);
    render(<LiveStepPage goalId={blockedGoal.id} stepId={accessStep.id} />);
    mocks.createAction.mockResolvedValueOnce(actions[0]);
    mocks.confirmAction.mockResolvedValueOnce({
      ...actions[0],
      status: 'succeeded',
      result: { access_request_id: '00000048-0000-4000-8000-000000000048' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Запросить доступ' }));
    expect(await screen.findByText('db-team-a-test')).toBeInTheDocument();
    expect(screen.getByText('Нужен доступ к синтетической БД команды A.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => {
      expect(mocks.createAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'create_access_request',
        goal_id: blockedGoal.id,
        step_id: 'check_access',
        parameters: expect.objectContaining({
          resource_id: blockedGoal.resource_id,
          requested_role: 'db_reader',
        }),
      }));
    });
    expect(mocks.confirmAction).toHaveBeenCalledWith(actions[0].id);
    expect(await screen.findByText(/Заявка создана/)).toBeInTheDocument();
  });

  it('проверка подключения умеет отправить ssl_mode=require после disable', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.change(await screen.findByLabelText('Режим SSL'), { target: { value: 'require' } });
    fireEvent.click(screen.getByRole('button', { name: /Повторить проверку/ }));
    expect(mocks.createCheck).toHaveBeenCalledWith(blockedGoal.id, blockedStep.id, {
      method: 'mock_db_connection',
      options: { ssl_mode: 'require' },
      expected_version: blockedStep.version,
    });
  });

  it('повторная проверка: POST checks с expected_version и refetch', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Повторить проверку/ }));
    expect(mocks.createCheck).toHaveBeenCalledWith(blockedGoal.id, blockedStep.id, {
      method: 'mock_db_connection',
      options: { ssl_mode: 'disable' },
      expected_version: blockedStep.version,
    });
  });

  it('ready-шаг: кнопка запуска проверки вызывает createCheck', async () => {
    mocks.getStep.mockResolvedValue(readyStep);
    render(<LiveStepPage goalId={readyGoal.id} stepId={readyStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: /Запустить проверку/ }));
    expect(mocks.createCheck).toHaveBeenCalledWith(readyGoal.id, readyStep.id, {
      method: 'mock_db_connection',
      options: { ssl_mode: 'disable' },
      expected_version: readyStep.version,
    });
  });

  it('повторный check заблокирован до загрузки актуальной версии шага', async () => {
    let finishCheck!: (value: object) => void;
    let finishRefresh!: (value: typeof blockedStep) => void;
    mocks.createCheck.mockReturnValueOnce(new Promise(resolve => { finishCheck = resolve; }));
    mocks.getStep.mockResolvedValueOnce(blockedStep).mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    const retry = await screen.findByRole('button', { name: /Повторить проверку/ });
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    expect(screen.getByLabelText('Режим SSL')).toBeDisabled();
    fireEvent.click(retry);
    expect(mocks.createCheck).toHaveBeenCalledTimes(1);
    await act(async () => { finishCheck({}); });
    expect(screen.queryByRole('button', { name: /Повторить проверку/ })).not.toBeInTheDocument();
    await act(async () => { finishRefresh({ ...blockedStep, version: blockedStep.version + 1 }); });
    const refreshed = await screen.findByRole('button', { name: /Повторить проверку/ });
    expect(refreshed).toBeEnabled();
    fireEvent.click(refreshed);
    expect(mocks.createCheck).toHaveBeenLastCalledWith(blockedGoal.id, blockedStep.id, expect.objectContaining({ expected_version: blockedStep.version + 1 }));
  });

  it('v3: помощь наставника — Telegram с контекстом шага, без внутреннего обращения', async () => {
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    const card = await screen.findByLabelText('Telegram наставника');
    expect(card).toHaveAttribute('data-goal', blockedGoal.id);
    expect(card).toHaveAttribute('data-step', blockedStep.id);
    expect(card).toHaveTextContent('Не получается? Напишите наставнику в Telegram');
    // Даже если старый allowlist содержит escalate_to_buddy, кнопки внутреннего обращения нет.
    expect(screen.queryByRole('button', { name: /Спросить наставника/ })).not.toBeInTheDocument();
    expect(mocks.createAction).not.toHaveBeenCalled();
  });

  it('без открытого блокера — обычный заголовок Telegram-карточки', async () => {
    mocks.getStep.mockResolvedValue(readyStep);
    render(<LiveStepPage goalId={readyGoal.id} stepId={readyStep.id} />);
    expect(await screen.findByLabelText('Telegram наставника')).toHaveTextContent('Написать наставнику в Telegram');
  });

  it('устранённый блокер не предлагает повторную проверку или обращение наставнику', async () => {
    mocks.getStep.mockResolvedValue({ ...blockedStep, status: 'verified', available_actions: [], blockers: blockedStep.blockers.map(b => ({ ...b, status: 'resolved' })) });
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    expect(await screen.findByText('Устранён')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Спросить наставника/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Повторить проверку/ })).not.toBeInTheDocument();
    expect(mocks.createAction).not.toHaveBeenCalled();
  });

  it('исторические recovery actions не обходят текущий серверный allowlist', async () => {
    mocks.getStep.mockResolvedValue({ ...blockedStep, available_actions: ['retry_check'] });
    render(<LiveStepPage goalId={blockedGoal.id} stepId={blockedStep.id} />);
    expect(await screen.findByRole('button', { name: /Повторить проверку/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Спросить наставника/ })).not.toBeInTheDocument();
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

  it('заявка: отмена и ошибка отмены', async () => {
    const accessStep = {
      ...blockedStep,
      id: 'check_access',
      available_actions: ['create_access_request', 'retry_check'],
      verification_method: 'iam_permission_present' as const,
      blockers: [{ ...blockedStep.blockers[0], error_code: 'ACCESS_MISSING', recovery_actions: ['create_access_request', 'retry_check'] }],
    };
    mocks.getStep.mockResolvedValue(accessStep);
    mocks.createAction.mockResolvedValue(actions[0]);
    mocks.cancelAction.mockRejectedValueOnce(new Error('gone')).mockResolvedValueOnce({ ...actions[0], status: 'cancelled' });
    render(<LiveStepPage goalId={blockedGoal.id} stepId={accessStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Запросить доступ' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Отмена не прошла.');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(await screen.findByText('Действие отменено и не выполнялось.')).toBeInTheDocument();
  });

  it('заявка не подготовилась: notice без карточки', async () => {
    const accessStep = {
      ...blockedStep,
      id: 'check_access',
      available_actions: ['create_access_request'],
      verification_method: 'iam_permission_present' as const,
      blockers: [{ ...blockedStep.blockers[0], error_code: 'ACCESS_MISSING', recovery_actions: ['create_access_request'] }],
    };
    mocks.getStep.mockResolvedValue(accessStep);
    mocks.createAction.mockRejectedValueOnce(new Error('conflict'));
    render(<LiveStepPage goalId={blockedGoal.id} stepId={accessStep.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Запросить доступ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подготовить заявку.');
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).not.toBeInTheDocument();
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
