import { fireEvent, render, screen } from '@testing-library/react';
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

describe('LiveBuddyEscalationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEscalation.mockResolvedValue(openEsc);
    mocks.replyEscalation.mockResolvedValue(resolvedEsc);
  });

  it('ответ закрывает обращение с expected_version', async () => {
    render(<LiveBuddyEscalationDetailPage id={openEsc.id} />);
    expect(await screen.findByText('Диагностика (разрешённый снимок)')).toBeInTheDocument();
    expect(screen.getByText('Гипотезы')).toBeInTheDocument();
    expect(screen.getByText('Источники')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/sslmode=require/), {
      target: { value: 'Включи sslmode=require и повтори проверку.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ответить и закрыть' }));
    expect(mocks.replyEscalation).toHaveBeenCalledWith(openEsc.id, {
      answer: 'Включи sslmode=require и повтори проверку.',
      expected_version: openEsc.version,
    });
  });

  it('ошибка ответа: notice', async () => {
    mocks.replyEscalation.mockRejectedValue(new Error('down'));
    render(<LiveBuddyEscalationDetailPage id={openEsc.id} />);
    await screen.findByRole('button', { name: 'Ответить и закрыть' });
    fireEvent.change(screen.getByPlaceholderText(/sslmode=require/), { target: { value: 'Ответ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ответить и закрыть' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ответ не отправлен');
  });

  it('resolved: сохранённый ответ', async () => {
    mocks.getEscalation.mockResolvedValue(resolvedEsc);
    render(<LiveBuddyEscalationDetailPage id={resolvedEsc.id} />);
    expect(await screen.findByText(/включи sslmode=require/)).toBeInTheDocument();
  });
});
