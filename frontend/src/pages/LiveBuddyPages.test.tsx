import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escalations } from '../fixtures/all-states';
import { LiveBuddyEscalationDetailPage, LiveBuddyEscalationsPage } from './LiveBuddyPages';

const mocks = vi.hoisted(() => ({
  listEscalations: vi.fn(),
  getEscalation: vi.fn(),
  replyEscalation: vi.fn(),
}));

vi.mock('../lib/endpoints', () => mocks);

const openEsc = escalations.find((e) => e.status === 'open')!;
const resolvedEsc = escalations.find((e) => e.status === 'resolved')!;

describe('LiveBuddyEscalationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEscalations.mockResolvedValue(escalations);
  });

  it('data: список обращений', async () => {
    render(<LiveBuddyEscalationsPage />);
    expect((await screen.findAllByText('Стажёр A')).length).toBe(2);
    expect(screen.getByText('Открыто')).toBeInTheDocument();
    expect(screen.getByText('Закрыто')).toBeInTheDocument();
  });

  it('empty и error', async () => {
    mocks.listEscalations.mockResolvedValueOnce([]);
    const { unmount } = render(<LiveBuddyEscalationsPage />);
    expect(await screen.findByText('Обращений нет')).toBeInTheDocument();
    unmount();
    mocks.listEscalations.mockRejectedValueOnce(new Error('down'));
    render(<LiveBuddyEscalationsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('LiveBuddyEscalationDetailPage · только чтение', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEscalation.mockResolvedValue(openEsc);
  });

  it('старое открытое обращение: диагностика видна, ответить нельзя', async () => {
    render(<LiveBuddyEscalationDetailPage id={openEsc.id} />);
    expect(await screen.findByText('Диагностика (разрешённый снимок)')).toBeInTheDocument();
    expect(screen.getByText('Гипотезы')).toBeInTheDocument();
    expect(screen.getByText('Источники')).toBeInTheDocument();
    expect(screen.getByText(/Ответить здесь больше нельзя/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ответить и закрыть' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.replyEscalation).not.toHaveBeenCalled();
  });

  it('resolved: сохранённый ответ', async () => {
    mocks.getEscalation.mockResolvedValue(resolvedEsc);
    render(<LiveBuddyEscalationDetailPage id={resolvedEsc.id} />);
    expect(await screen.findByText(/включи sslmode=require/)).toBeInTheDocument();
  });

  it('ошибка загрузки и пустой ответ', async () => {
    mocks.getEscalation.mockRejectedValueOnce(new Error('down'));
    const { unmount } = render(<LiveBuddyEscalationDetailPage id={openEsc.id} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    unmount();
  });
});
