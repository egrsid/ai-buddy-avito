import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPage } from './ChatPage';

describe('ChatPage', () => {
  it('data: сообщения, подсказки и action-карточка', async () => {
    render(<ChatPage view="data" />);
    expect(await screen.findByText('Что мешает подключению к БД?')).toBeInTheDocument();
    expect(screen.getByText(/DB_SSL_REQUIRED/)).toBeInTheDocument();
    expect(screen.getByLabelText('Быстрые подсказки')).toBeInTheDocument();
    expect(screen.getByLabelText('Предложенное действие')).toBeInTheDocument();
    expect(screen.getByText('Заявка на доступ')).toBeInTheDocument();
    expect(screen.getByText(/слово «да» в чате ничего не исполняет/)).toBeInTheDocument();
  });

  it('подтверждение заявки: executing → succeeded', async () => {
    render(<ChatPage view="data" />);
    const confirm = await screen.findByRole('button', { name: 'Подтвердить' });
    fireEvent.click(confirm);
    expect(screen.getByRole('status')).toHaveTextContent('Выполняется, результат появится автоматически');
    expect(
      await screen.findByText(/Заявка создана/, undefined, { timeout: 2500 }),
    ).toBeInTheDocument();
  });

  it('отмена заявки: действие отменено', async () => {
    render(<ChatPage view="data" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Действие отменено и не выполнялось.')).toBeInTheDocument();
  });

  it('loading: индикатор загрузки', () => {
    render(<ChatPage view="loading" />);
    expect(screen.getByText('Загружаем данные…')).toBeInTheDocument();
  });

  it('error: диалог недоступен', async () => {
    render(<ChatPage view="error" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Диалог недоступен');
  });

  it('empty: сообщений нет', async () => {
    render(<ChatPage view="empty" />);
    expect(await screen.findByText('Сообщений пока нет')).toBeInTheDocument();
  });
});
