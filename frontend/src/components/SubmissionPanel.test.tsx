import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../lib/api';
import { SubmissionPanel } from './SubmissionPanel';

vi.mock('../lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/api')>(), apiFetch: vi.fn(),
}));

const fetch = vi.mocked(apiFetch);
const id = 'a0000000-0000-4000-8000-000000000001';
const date = '2026-11-21T12:30:00Z';
const proof = { id, observed_at: date };
const available = { brief_version: 1, proof, latest: null };

beforeEach(() => fetch.mockReset());

it('сохраняет введённый вывод после ошибки отправки и обновляет доступное доказательство', async () => {
  fetch.mockResolvedValueOnce(available).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...available, proof: { ...proof, id: crypto.randomUUID() } });
  render(<SubmissionPanel assignmentId={id} version={1} archived={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Сдача работы' }));
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Проверка прошла.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Передать наставнику' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить результат');
  expect(await screen.findByRole('textbox')).toHaveValue('Проверка прошла.');
  expect(fetch.mock.calls[1][1]?.body).toEqual({ brief_version: 1, attempt: 1, conclusion: 'Проверка прошла.', evidence_id: id });
});

it('предлагает перейти к маршруту при отсутствии подтверждения подключения', async () => {
  fetch.mockResolvedValue({ ...available, proof: null });
  render(<SubmissionPanel assignmentId={id} version={1} archived={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Сдача работы' }));
  expect(await screen.findByRole('link', { name: 'Задания и цели' })).toHaveAttribute('href', '#/workspaces');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('скрывает форму при смене версии ТЗ и при просмотре архивного назначения', async () => {
  fetch.mockResolvedValueOnce({ ...available, brief_version: 2 }).mockResolvedValueOnce(available);
  const { unmount } = render(<SubmissionPanel assignmentId={id} version={1} archived={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Сдача работы' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Версия ТЗ изменилась');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  unmount();
  render(<SubmissionPanel assignmentId={id} version={1} archived reviewer />);
  fireEvent.click(screen.getByRole('button', { name: 'Проверка работы' }));
  expect(await screen.findByText('По этой версии ТЗ нет сданной работы.')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
