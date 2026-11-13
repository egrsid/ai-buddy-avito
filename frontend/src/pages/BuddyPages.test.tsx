import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { escalations } from '../fixtures/all-states';
import { BuddyEscalationDetailPage, BuddyEscalationsPage } from './BuddyPages';

const openEsc = escalations.find((e) => e.status === 'open')!;
const resolvedEsc = escalations.find((e) => e.status === 'resolved')!;

describe('BuddyEscalationsPage', () => {
  it('data: список обращений со статусами', async () => {
    render(<BuddyEscalationsPage view="data" />);
    expect((await screen.findAllByText('Стажёр A')).length).toBe(2);
    expect(screen.getByRole('heading', { name: 'Обращения стажёров' })).toBeInTheDocument();
    expect(screen.getByText('Открыто')).toBeInTheDocument();
    expect(screen.getByText('Закрыто')).toBeInTheDocument();
    expect(screen.getAllByText(/Как включить SSL/).length).toBeGreaterThan(0);
  });

  it('empty: обращений нет', async () => {
    render(<BuddyEscalationsPage view="empty" />);
    expect(await screen.findByText('Обращений нет')).toBeInTheDocument();
  });
});

describe('BuddyEscalationDetailPage', () => {
  it('open: диагностика, гипотезы, источники; ответ закрывает обращение', async () => {
    render(<BuddyEscalationDetailPage id={openEsc.id} view="data" />);
    expect(await screen.findByText('Диагностика (разрешённый снимок)')).toBeInTheDocument();
    expect(screen.getByText('Гипотезы')).toBeInTheDocument();
    expect(screen.getByText('Источники')).toBeInTheDocument();

    const send = screen.getByRole('button', { name: 'Ответить и закрыть' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/sslmode=require/), {
      target: { value: 'Включи sslmode=require и повтори проверку.' },
    });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    expect(screen.getByText(/Обращение закрыто/)).toBeInTheDocument();
    expect(screen.getByText(/не публикуется в базу знаний автоматически/)).toBeInTheDocument();
  });

  it('resolved: показывает сохранённый ответ', async () => {
    render(<BuddyEscalationDetailPage id={resolvedEsc.id} view="data" />);
    expect(await screen.findByText(/включи sslmode=require/)).toBeInTheDocument();
    expect(screen.getByText(/Закрыто 2026/)).toBeInTheDocument();
  });

  it('empty: обращение не найдено', async () => {
    render(<BuddyEscalationDetailPage id={openEsc.id} view="empty" />);
    expect(await screen.findByText('Обращение не найдено')).toBeInTheDocument();
  });
});
