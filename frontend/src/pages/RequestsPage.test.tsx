import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequestsPage } from './RequestsPage';

describe('RequestsPage', () => {
  it('data: список заявок со статусами и grant state', async () => {
    render(<RequestsPage view="data" />);
    expect((await screen.findAllByText('db-team-a-test')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Мои заявки' })).toBeInTheDocument();
    expect(screen.getAllByText(/Основание:/).length).toBeGreaterThan(0);
    expect(screen.getByText('Отправлена')).toBeInTheDocument();
  });

  it('предупреждение: одобрено, но IAM не подтвердил', async () => {
    render(<RequestsPage view="data" />);
    expect(
      await screen.findAllByText(/одобрена, но доступ ещё не подтверждён/),
    ).not.toHaveLength(0);
  });

  it('empty: заявок нет', async () => {
    render(<RequestsPage view="empty" />);
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
  });

  it('error: состояние ошибки', async () => {
    render(<RequestsPage view="error" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
