import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessRequests } from '../fixtures/all-states';
import { LiveApprovalsPage, LiveRequestsPage } from './LiveAccessPages';

const mocks = vi.hoisted(() => ({
  listAccessRequests: vi.fn(),
  decideAccessRequest: vi.fn(),
}));

vi.mock('../lib/endpoints', () => mocks);

const submitted = accessRequests.find((r) => r.status === 'submitted')!;
const approved = accessRequests.find((r) => r.status === 'approved')!;

describe('LiveRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAccessRequests.mockResolvedValue(accessRequests);
  });

  it('data: список заявок', async () => {
    render(<LiveRequestsPage />);
    expect((await screen.findAllByText('db-team-a-test')).length).toBeGreaterThan(0);
    expect(screen.getByText('Отправлена')).toBeInTheDocument();
    expect(screen.getAllByText(/одобрена, но доступ ещё не подтверждён/).length).toBeGreaterThan(0);
  });

  it('empty: заявок нет', async () => {
    mocks.listAccessRequests.mockResolvedValue([]);
    render(<LiveRequestsPage />);
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
  });

  it('error: retry перезагружает', async () => {
    mocks.listAccessRequests.mockRejectedValueOnce(new Error('down'));
    render(<LiveRequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }));
    expect((await screen.findAllByText('db-team-a-test')).length).toBeGreaterThan(0);
  });
});

describe('LiveApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAccessRequests.mockResolvedValue([submitted]);
    mocks.decideAccessRequest.mockResolvedValue(approved);
  });

  it('решение с основанием и expected_version', async () => {
    render(<LiveApprovalsPage />);
    const approve = await screen.findByRole('button', { name: 'Одобрить' });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Например: назначение подтверждено'), {
      target: { value: 'Назначение подтверждено' },
    });
    fireEvent.click(approve);
    expect(mocks.decideAccessRequest).toHaveBeenCalledWith(submitted.id, {
      decision: 'approved',
      reason: 'Назначение подтверждено',
      expected_version: submitted.version,
    });
  });

  it('отклонение', async () => {
    render(<LiveApprovalsPage />);
    await screen.findByRole('button', { name: 'Отклонить' });
    fireEvent.change(screen.getByPlaceholderText('Например: назначение подтверждено'), {
      target: { value: 'Не соответствует задаче' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
    expect(mocks.decideAccessRequest).toHaveBeenCalledWith(submitted.id, {
      decision: 'rejected',
      reason: 'Не соответствует задаче',
      expected_version: submitted.version,
    });
  });

  it('ошибка решения: показывает notice', async () => {
    mocks.decideAccessRequest.mockRejectedValue(new Error('down'));
    render(<LiveApprovalsPage />);
    await screen.findByRole('button', { name: 'Одобрить' });
    fireEvent.change(screen.getByPlaceholderText('Например: назначение подтверждено'), {
      target: { value: 'ok' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Одобрить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Решение не сохранено');
  });

  it('решённая заявка: без формы решения', async () => {
    mocks.listAccessRequests.mockResolvedValue([approved]);
    render(<LiveApprovalsPage />);
    expect(await screen.findByText(/Одобрено/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument();
  });

  it('после решения видно, что произошло', async () => {
    mocks.listAccessRequests.mockResolvedValue([
      { ...approved, id: 'r-ok', grant_state: 'present' },
      { ...approved, id: 'r-wait', grant_state: 'absent' },
      { ...approved, id: 'r-no', status: 'rejected', grant_state: 'absent' },
    ]);
    render(<LiveApprovalsPage />);
    expect(await screen.findByText(/Доступ выдан \(IAM подтвердил\), шаг стажёра засчитан/)).toBeInTheDocument();
    expect(screen.getByText(/IAM ещё не подтвердил доступ/)).toBeInTheDocument();
    expect(screen.getByText(/Отклонено\. Стажёр увидит решение/)).toBeInTheDocument();
  });

  it('стажёр видит, что доступ выдан и шаг засчитан', async () => {
    mocks.listAccessRequests.mockResolvedValue([{ ...approved, grant_state: 'present' }]);
    render(<LiveRequestsPage />);
    expect(await screen.findByText(/шаг «Проверить доступ» засчитан автоматически/)).toBeInTheDocument();
  });

  it('empty: нет заявок', async () => {
    mocks.listAccessRequests.mockResolvedValue([]);
    render(<LiveApprovalsPage />);
    expect(await screen.findByText('Нет заявок на согласование')).toBeInTheDocument();
  });
});
