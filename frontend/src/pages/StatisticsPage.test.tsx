import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from '../test/v3fixtures';
import { StatisticsPage, StatisticsView } from './StatisticsPage';

const v3 = vi.hoisted(() => ({ getStatistics: vi.fn() }));
vi.mock('../lib/v3', () => v3);

describe('StatisticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    v3.getStatistics.mockResolvedValue(fx.stats());
  });

  it('наставник: источник и период переключаются, по умолчанию 30 дней и технические', async () => {
    render(<StatisticsPage view="mentor" />);
    expect(await screen.findByText('Затронуто разных стажёров')).toBeInTheDocument();
    expect(v3.getStatistics).toHaveBeenLastCalledWith('mentor', 30, 'technical');
    fireEvent.click(screen.getByRole('tab', { name: 'Понятность моих ТЗ' }));
    expect(v3.getStatistics).toHaveBeenLastCalledWith('mentor', 30, 'task_clarity');
    fireEvent.click(screen.getByRole('button', { name: '7 дней' }));
    expect(v3.getStatistics).toHaveBeenLastCalledWith('mentor', 7, 'task_clarity');
    expect(screen.getByRole('button', { name: '7 дней' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('владелец документации: без вкладок источника', async () => {
    render(<StatisticsPage view="documentation" />);
    await screen.findByText('Затронуто разных стажёров');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(v3.getStatistics).toHaveBeenLastCalledWith('documentation', 30, 'technical');
  });

  it('ошибка загрузки с retry', async () => {
    v3.getStatistics.mockRejectedValueOnce(new Error('down'));
    render(<StatisticsPage view="mentor" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Затронуто разных стажёров')).toBeInTheDocument();
  });
});

describe('StatisticsView', () => {
  it('скрытая группа — «недостаточно данных», не 0; ссылка на связанный отчёт', () => {
    render(<StatisticsView stats={fx.stats()} />);
    expect(screen.getByText('недостаточно данных')).toBeInTheDocument();
    expect(screen.getByText('Проверить подключение · DB_SSL_REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /открыть/ })).toHaveAttribute('href', `#/knowledge-gaps/${fx.REPORT_ID}`);
    expect(screen.getByRole('img', { name: /График/ })).toBeInTheDocument();
    expect(screen.getByText('Открытых блокеров')).toBeInTheDocument();
  });

  it('понятность ТЗ: отчёты ведут в кабинет наставника', () => {
    const data = fx.stats({
      source_kind: 'task_clarity',
      rows: [{
        key: { brief_id: fx.BRIEF_ID, brief_version: 1, section_id: 'deadline', reason: 'outcome_unclear' },
        label: 'ТЗ: отчёт · v1 · Срок',
        metrics: { affected_interns: 2, observations: 2, open_items: 1, suppressed: false },
        related_reports: [{ id: fx.REPORT_ID, kind: 'task_clarity_report', state: 'proposed' }],
      }],
    });
    render(<StatisticsView stats={data as never} />);
    expect(screen.getByText('Открытых отчётов')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /открыть/ })).toHaveAttribute('href', `#/mentor/reports/${fx.REPORT_ID}`);
  });

  it('все группы скрыты — итог тоже скрыт; пусто — понятное сообщение', () => {
    const { unmount } = render(<StatisticsView stats={fx.stats({ summary: { affected_interns: null, observations: null, open_items: null, suppressed: true } })} />);
    expect(screen.getByText(/Недостаточно данных для итогов/)).toBeInTheDocument();
    unmount();
    render(<StatisticsView stats={fx.stats({ rows: [], daily: [] })} />);
    expect(screen.getByText('Затруднений нет')).toBeInTheDocument();
  });
});
