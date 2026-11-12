import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { candidates } from '../fixtures/all-states';
import { KnowledgeGapDetailPage, KnowledgeGapsPage } from './KnowledgeGapsPages';

const proposed = candidates.find((c) => c.state === 'proposed' && c.enrichment_status === 'completed')!;
const resolved = candidates.find((c) => c.state === 'resolved')!;

describe('KnowledgeGapsPage', () => {
  it('data: список кандидатов с состояниями и enrichment', async () => {
    render(<KnowledgeGapsPage view="data" />);
    expect((await screen.findAllByText('check_connection')).length).toBe(candidates.length);
    expect(screen.getByRole('heading', { name: 'Пробелы знаний' })).toBeInTheDocument();
    expect(screen.getByText('Решён')).toBeInTheDocument();
    expect(screen.getByText('Описание формируется')).toBeInTheDocument();
    expect(screen.getByText('Ошибка обогащения')).toBeInTheDocument();
  });

  it('empty: предложений нет', async () => {
    render(<KnowledgeGapsPage view="empty" />);
    expect(await screen.findByText('Предложений нет')).toBeInTheDocument();
  });
});

describe('KnowledgeGapDetailPage', () => {
  it('решение требует основания; «Принять гипотезу» сохраняет решение', async () => {
    render(<KnowledgeGapDetailPage id={proposed.id} view="data" />);
    const accept = await screen.findByRole('button', { name: 'Принять гипотезу' });
    expect(accept).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Гипотеза подтверждается снимками' } });
    fireEvent.click(accept);

    expect(screen.getByText(/Решение сохранено/)).toBeInTheDocument();
    expect(screen.getAllByText('Принят').length).toBeGreaterThan(0);
  });

  it('«Взять в работу» переводит в under_review', async () => {
    render(<KnowledgeGapDetailPage id={proposed.id} view="data" />);
    await screen.findByRole('button', { name: 'Взять в работу' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Разберу' } });
    fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' }));
    expect(screen.getAllByText('На рассмотрении').length).toBeGreaterThan(0);
  });

  it('resolved: карточка решена, решения недоступны', async () => {
    render(<KnowledgeGapDetailPage id={resolved.id} view="data" />);
    expect(
      await screen.findByText(/исправленная версия 2 проверена человеком/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Принять гипотезу' })).not.toBeInTheDocument();
  });

  it('empty: карточка не найдена', async () => {
    render(<KnowledgeGapDetailPage id={proposed.id} view="empty" />);
    expect(await screen.findByText('Карточка не найдена')).toBeInTheDocument();
  });
});
