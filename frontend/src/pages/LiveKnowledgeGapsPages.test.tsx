import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { candidates } from '../fixtures/all-states';
import { LiveKnowledgeGapDetailPage, LiveKnowledgeGapsPage } from './LiveKnowledgeGapsPages';

const mocks = vi.hoisted(() => ({
  listCandidates: vi.fn(),
  listFrictionGroups: vi.fn(),
  getCandidate: vi.fn(),
  reviewCandidate: vi.fn(),
}));

vi.mock('../lib/endpoints', () => mocks);

const proposed = candidates.find((c) => c.state === 'proposed')!;
const accepted = candidates.find((c) => c.state === 'accepted')!;
const resolved = candidates.find((c) => c.state === 'resolved')!;

const friction = [
  {
    journey_id: 'db-access-team-a',
    step_id: 'check_connection',
    error_code: 'DB_SSL_REQUIRED',
    affected_count: 2,
    instruction_refs: [{ document_id: '0000000a-0000-4000-8000-00000000000a', version: 1 }],
  },
];

describe('LiveKnowledgeGapsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCandidates.mockResolvedValue(candidates);
    mocks.listFrictionGroups.mockResolvedValue(friction);
  });

  it('data: агрегаты и список кандидатов', async () => {
    render(<LiveKnowledgeGapsPage />);
    expect((await screen.findAllByText('check_connection')).length).toBeGreaterThan(0);
    expect(screen.getByText('Агрегаты затруднений')).toBeInTheDocument();
    expect(screen.getAllByText(/стажёров: 2/).length).toBeGreaterThan(0);
  });

  it('без агрегатов секция скрыта', async () => {
    mocks.listFrictionGroups.mockResolvedValue([]);
    render(<LiveKnowledgeGapsPage />);
    await screen.findAllByText('check_connection');
    expect(screen.queryByText('Агрегаты затруднений')).not.toBeInTheDocument();
  });

  it('empty и error', async () => {
    mocks.listCandidates.mockResolvedValueOnce([]);
    const { unmount } = render(<LiveKnowledgeGapsPage />);
    expect(await screen.findByText('Предложений нет')).toBeInTheDocument();
    unmount();
    mocks.listCandidates.mockRejectedValueOnce(new Error('down'));
    render(<LiveKnowledgeGapsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('LiveKnowledgeGapDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCandidate.mockResolvedValue(proposed);
    mocks.reviewCandidate.mockResolvedValue(accepted);
  });

  it('решение с основанием и expected_version', async () => {
    render(<LiveKnowledgeGapDetailPage id={proposed.id} />);
    const accept = await screen.findByRole('button', { name: 'Принять гипотезу' });
    expect(accept).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Подтверждаю по снимкам' } });
    fireEvent.click(accept);
    expect(mocks.reviewCandidate).toHaveBeenCalledWith(proposed.id, {
      decision: 'accepted',
      reason: 'Подтверждаю по снимкам',
      expected_version: proposed.version,
    });
  });

  it('«Взять в работу» и «Отклонить»', async () => {
    render(<LiveKnowledgeGapDetailPage id={proposed.id} />);
    await screen.findByRole('button', { name: 'Взять в работу' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Разберу' } });
    fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' }));
    expect(mocks.reviewCandidate).toHaveBeenCalledWith(proposed.id, {
      decision: 'under_review',
      reason: 'Разберу',
      expected_version: proposed.version,
    });
  });

  it('ошибка решения: notice', async () => {
    mocks.reviewCandidate.mockRejectedValue(new Error('down'));
    render(<LiveKnowledgeGapDetailPage id={proposed.id} />);
    await screen.findByRole('button', { name: 'Принять гипотезу' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Принять гипотезу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Решение не сохранено');
  });

  it('resolved: без формы решений', async () => {
    mocks.getCandidate.mockResolvedValue(resolved);
    render(<LiveKnowledgeGapDetailPage id={resolved.id} />);
    expect(await screen.findByText(/исправленная версия 2/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('error: состояние ошибки', async () => {
    mocks.getCandidate.mockRejectedValue(new Error('down'));
    render(<LiveKnowledgeGapDetailPage id={proposed.id} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
