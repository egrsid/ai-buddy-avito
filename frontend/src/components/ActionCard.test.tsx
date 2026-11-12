import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { actions, escalationPendingAction } from '../fixtures/all-states';
import { ActionCard } from './ActionCard';

const byStatus = (status: string) => actions.find((a) => a.status === status)!;

describe('ActionCard', () => {
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
