import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from '../test/v3fixtures';
import { InternTaskDetailPage, InternTasksPage } from './InternTaskPages';

const v3 = vi.hoisted(() => ({
  listAssignments: vi.fn(),
  getAssignment: vi.fn(),
  adoptVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  reportFriction: vi.fn(),
}));
vi.mock('../lib/v3', () => v3);
vi.mock('../components/MentorContactCard', () => ({
  MentorContactCard: ({ context, title }: { context: { assignmentId: string; sectionId?: string }; title: string }) =>
    <div aria-label="Telegram наставника" data-section={context.sectionId ?? ''}>{title}</div>,
}));

function receipt(status: 'recorded' | 'already_recorded', section = 'deadline') {
  return { status, assignment_id: fx.ASSIGNMENT_ID, brief_version: 1, section_id: section, reason: 'outcome_unclear' };
}

describe('InternTasksPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('список заданий и пометка о новой версии', async () => {
    v3.listAssignments.mockResolvedValue([fx.assignment({ latest_published_version: 2 })]);
    render(<InternTasksPage />);
    expect(await screen.findByText('ТЗ: отчёт')).toBeInTheDocument();
    expect(screen.getByText('Опубликована версия 2')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', `#/tasks/${fx.ASSIGNMENT_ID}`);
  });

  it('пусто и ошибка', async () => {
    v3.listAssignments.mockResolvedValueOnce([]);
    const { unmount } = render(<InternTasksPage />);
    expect(await screen.findByText('Заданий пока нет')).toBeInTheDocument();
    unmount();
    v3.listAssignments.mockRejectedValueOnce(new Error('down'));
    render(<InternTasksPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('InternTaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    v3.getAssignment.mockResolvedValue(fx.assignment({ reported_sections: [{ section_id: 'goal', reason: 'requirement_unclear' }] }));
    v3.reportFriction.mockResolvedValue(receipt('recorded'));
  });

  it('ТЗ по разделам: цель, свои разделы, результат и критерии; «не проверено»', async () => {
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    expect(await screen.findByRole('heading', { name: 'ТЗ: отчёт' })).toBeInTheDocument();
    for (const title of ['Цель задания', 'Формат отчёта', 'Срок', 'Ожидаемый результат', 'Критерии приёмки']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/результат не проверяется автоматически/)).toBeInTheDocument();
    expect(screen.getByText('Вы отметили: Неясно требование')).toBeInTheDocument();
  });

  it('отметка «непонятно» с причиной и повтор без двойного учёта', async () => {
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    const section = (await screen.findByRole('heading', { name: 'Срок' })).closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: /Непонятно/ }));
    fireEvent.click(within(section).getByLabelText('Неясен результат'));
    fireEvent.click(within(section).getByRole('button', { name: 'Отметить' }));
    expect(await within(section).findByRole('status')).toHaveTextContent('Затруднение сообщено');
    expect(v3.reportFriction).toHaveBeenCalledWith(fx.ASSIGNMENT_ID, 'deadline', 'outcome_unclear');
    expect(within(section).getByText('Вы отметили: Неясен результат')).toBeInTheDocument();

    v3.reportFriction.mockResolvedValueOnce(receipt('already_recorded'));
    fireEvent.click(within(section).getByRole('button', { name: /Непонятно/ }));
    fireEvent.click(within(section).getByLabelText('Неясен результат'));
    fireEvent.click(within(section).getByRole('button', { name: 'Отметить' }));
    expect(await within(section).findByText(/учтена один раз/)).toBeInTheDocument();
    expect(within(section).getByText('Вы отметили: Неясен результат')).toBeInTheDocument();
  });

  it('ошибка отметки и отмена формы', async () => {
    v3.reportFriction.mockRejectedValueOnce(new Error('down'));
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    const section = (await screen.findByRole('heading', { name: 'Срок' })).closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: /Непонятно/ }));
    fireEvent.click(within(section).getByRole('button', { name: 'Отметить' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('Отметка не сохранилась');
    fireEvent.click(within(section).getByRole('button', { name: 'Отмена' }));
    expect(within(section).queryByRole('button', { name: 'Отметить' })).not.toBeInTheDocument();
  });

  it('вопрос наставнику переключает контекст Telegram на раздел', async () => {
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    expect(await screen.findByLabelText('Telegram наставника')).toHaveAttribute('data-section', '');
    const section = screen.getByRole('heading', { name: 'Формат отчёта' }).closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: 'Спросить наставника' }));
    expect(screen.getByLabelText('Telegram наставника')).toHaveAttribute('data-section', 'report-format');
    expect(screen.getByLabelText('Telegram наставника')).toHaveTextContent('про этот раздел');
  });

  it('новая версия: явный переход с expected_revision', async () => {
    v3.getAssignment.mockResolvedValue(fx.assignment({ latest_published_version: 2 }));
    v3.adoptVersion.mockResolvedValue(fx.assignment({ brief_version: 2, latest_published_version: 2, revision: 2, content: { ...fx.content, title: 'ТЗ: отчёт v2' } }));
    v3.getLatestVersion.mockResolvedValue(fx.version(2, 'published', { content: { ...fx.content, title: 'ТЗ: отчёт v2' } }));
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    // Сначала можно прочитать новую версию, сама она ничего не меняет.
    fireEvent.click(await screen.findByRole('button', { name: 'Посмотреть версию 2' }));
    expect(await screen.findByLabelText('Текст версии 2')).toHaveTextContent('ТЗ: отчёт v2');
    expect(v3.adoptVersion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Перейти на версию 2/ }));
    expect(await screen.findByRole('heading', { name: 'ТЗ: отчёт v2' })).toBeInTheDocument();
    expect(v3.adoptVersion).toHaveBeenCalledWith(fx.ASSIGNMENT_ID, 2, 1);
    expect(screen.queryByRole('button', { name: /Перейти на версию/ })).not.toBeInTheDocument();
  });

  it('ошибка перехода, архив и пустые критерии', async () => {
    v3.getAssignment.mockResolvedValue(fx.assignment({ latest_published_version: 2 }));
    v3.adoptVersion.mockRejectedValue(new Error('conflict'));
    const { unmount } = render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /Перейти на версию 2/ }));
    expect(await screen.findByText('Не удалось перейти на новую версию.')).toBeInTheDocument();
    unmount();
    v3.getAssignment.mockResolvedValue(fx.assignment({ brief_state: 'archived', content: { ...fx.content, acceptance_criteria: [] } }));
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    expect(await screen.findByText(/перенёс это ТЗ в архив/)).toBeInTheDocument();
    expect(screen.getByText('Критерии не заданы.')).toBeInTheDocument();
  });

  it('новая версия не загрузилась — сообщение, переход доступен', async () => {
    v3.getAssignment.mockResolvedValue(fx.assignment({ latest_published_version: 2 }));
    v3.getLatestVersion.mockRejectedValue(new Error('down'));
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Посмотреть версию 2' }));
    expect(await screen.findByText(/Сервис временно недоступен|не удалось загрузить/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Перейти на версию 2/ })).toBeEnabled();
  });

  it('ошибка загрузки', async () => {
    v3.getAssignment.mockRejectedValueOnce(new Error('down'));
    render(<InternTaskDetailPage id={fx.ASSIGNMENT_ID} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
