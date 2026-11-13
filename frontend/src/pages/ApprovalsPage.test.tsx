import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApprovalsPage } from './ApprovalsPage';

describe('ApprovalsPage', () => {
  it('data: решение требует основания, одобрение сохраняется', async () => {
    render(<ApprovalsPage view="data" />);
    const approve = await screen.findByRole('button', { name: 'Одобрить' });
    expect(approve).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Например: назначение подтверждено'), {
      target: { value: 'Назначение подтверждено руководителем' },
    });
    expect(approve).toBeEnabled();
    fireEvent.click(approve);

    expect(screen.getByText(/Решение сохранено/)).toBeInTheDocument();
    expect(screen.getByText('Одобрена')).toBeInTheDocument();
  });

  it('отклонение с основанием', async () => {
    render(<ApprovalsPage view="data" />);
    await screen.findByRole('button', { name: 'Отклонить' });
    fireEvent.change(screen.getByPlaceholderText('Например: назначение подтверждено'), {
      target: { value: 'Роль не соответствует задаче' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
    expect(screen.getByText('Отклонена')).toBeInTheDocument();
  });

  it('empty: нет заявок на согласование', async () => {
    render(<ApprovalsPage view="empty" />);
    expect(await screen.findByText('Нет заявок на согласование')).toBeInTheDocument();
  });

  it('error: состояние ошибки', async () => {
    render(<ApprovalsPage view="error" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
