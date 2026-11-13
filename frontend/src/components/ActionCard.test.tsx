import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { actions, escalationPendingAction } from '../fixtures/all-states';
import { ActionCard } from './ActionCard';

const byStatus = (status: string) => actions.find((a) => a.status === status)!;

describe('ActionCard', () => {
  it('перед confirm показывает фактическую диагностику для buddy', () => {
    render(<ActionCard action={escalationPendingAction} />);
    expect(screen.getByText('Диагностика для наставника')).toBeInTheDocument();
    expect(screen.getAllByText(/DB_SSL_REQUIRED/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Вся история чата наставнику не отправляется/)).toBeInTheDocument();
  });

  it('в preview видны проверки, выполненные действия, цитата и гипотеза', () => {
    const snapshot = {
      goal: { id: 'goal', title: 'Доступ к БД' }, step: { id: 'check_connection', title: 'Подключение' },
      blocker: { id: 'blocker', type: 'db_ssl_required', error_code: 'DB_SSL_REQUIRED' },
      checks: [{ id: 'check', method: 'mock_db_connection', status: 'failed', error_code: 'DB_SSL_REQUIRED' }],
      attempted_actions: [{ action_id: 'action', type: 'create_access_request', status: 'succeeded' }],
      instruction_refs: [{ document_id: 'document', version: 1, title: 'Разрешённая инструкция', url: '/api/v2/knowledge/document', excerpt: 'Синтетическая цитата.' }],
      hypotheses: [{ text: 'Проверить настройку SSL', confidence: 'medium' }], question: 'Нужна помощь',
    };
    render(<ActionCard action={{ ...escalationPendingAction, preview: { ...(escalationPendingAction.preview as Record<string, unknown>), diagnostic_snapshot: snapshot } }} />);
    expect(screen.getByText('mock_db_connection: failed · DB_SSL_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('create_access_request: succeeded')).toBeInTheDocument();
    expect(screen.getByText(/Разрешённая инструкция/)).toBeInTheDocument();
    expect(screen.getByText('Синтетическая цитата.')).toBeInTheDocument();
    expect(screen.getByText(/Проверить настройку SSL/)).toBeInTheDocument();
  });
  it('pending_confirmation: preview заявки и кнопки confirm/cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const action = byStatus('pending_confirmation');
    render(<ActionCard action={action} onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Заявка на доступ')).toBeInTheDocument();
    expect(screen.getByText('Ждёт подтверждения')).toBeInTheDocument();
    expect(screen.getByText('Ресурс')).toBeInTheDocument();
    expect(screen.getByText(/Действует до/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(onConfirm).toHaveBeenCalledWith(action.id);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledWith(action.id);
  });

  it('executing: статус без кнопок', () => {
    render(<ActionCard action={byStatus('executing')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Выполняется, результат появится автоматически');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('succeeded (заявка): предупреждение, что это не выдача доступа', () => {
    render(<ActionCard action={byStatus('succeeded')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Это не выдача доступа');
  });

  it('succeeded (эскалация): ответ придёт в обращение', () => {
    render(<ActionCard action={{ ...escalationPendingAction, status: 'succeeded' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Вопрос передан наставнику');
  });

  it('failed: код ошибки и запрет повтора', () => {
    render(<ActionCard action={byStatus('failed')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('UPSTREAM_ERROR');
    expect(screen.getByRole('alert')).toHaveTextContent('новое предложение с новым подтверждением');
  });

  it('unknown: сверка, дубликат исключён', () => {
    render(<ActionCard action={byStatus('unknown')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('UPSTREAM_TIMEOUT');
    expect(screen.getByRole('alert')).toHaveTextContent('дубликат исключён');
  });

  it('expired: просит запросить заново', () => {
    render(<ActionCard action={byStatus('expired')} />);
    expect(screen.getByText(/Время подтверждения истекло/)).toBeInTheDocument();
  });

  it('cancelled: действие не выполнялось', () => {
    render(<ActionCard action={byStatus('cancelled')} />);
    expect(screen.getByText('Действие отменено и не выполнялось.')).toBeInTheDocument();
  });

  it('эскалация: preview с получателем, целью/шагом и вопросом', () => {
    render(<ActionCard action={escalationPendingAction} />);
    expect(screen.getByText('Передача вопроса наставнику')).toBeInTheDocument();
    expect(screen.getByText('Получатель')).toBeInTheDocument();
    expect(screen.getByText('Цель / шаг')).toBeInTheDocument();
    expect(screen.getByText('Как включить SSL для синтетической БД?')).toBeInTheDocument();
  });
});
