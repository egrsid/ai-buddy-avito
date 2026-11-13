import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from '../test/v3fixtures';
import { MentorBriefDetailPage, MentorBriefsPage, MentorReportDetailPage, MentorReportsPage } from './MentorPages';

const v3 = vi.hoisted(() => ({
  archiveBrief: vi.fn(),
  assignBrief: vi.fn(),
  createBrief: vi.fn(),
  getBrief: vi.fn(),
  getReport: vi.fn(),
  listAssignments: vi.fn(),
  listBriefs: vi.fn(),
  listMentorInterns: vi.fn(),
  listReports: vi.fn(),
  publishBrief: vi.fn(),
  reviewReport: vi.fn(),
  saveDraft: vi.fn(),
}));
vi.mock('../lib/v3', () => v3);

function fillBrief() {
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новое ТЗ' } });
  fireEvent.change(screen.getByLabelText('Цель задания'), { target: { value: 'Цель' } });
  fireEvent.change(screen.getByLabelText('Заголовок раздела'), { target: { value: 'Раздел' } });
  fireEvent.change(screen.getByLabelText('Текст раздела'), { target: { value: 'Текст' } });
  fireEvent.change(screen.getByLabelText('Ожидаемый результат'), { target: { value: 'Результат' } });
}

describe('MentorBriefsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    v3.listBriefs.mockResolvedValue([
      fx.brief(),
      fx.brief({ id: fx.REPORT_ID, state: 'draft', latest_published_version: null, draft: fx.version(1, 'draft'), versions: [{ version: 1, state: 'draft' }], assignment_count: 0, open_report_count: 0 }),
    ]);
    v3.createBrief.mockResolvedValue(fx.brief());
  });

  it('список ТЗ: состояние, версии, отчёты', async () => {
    render(<MentorBriefsPage />);
    expect(await screen.findByText('Опубликовано')).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();
    expect(screen.getByText(/Опубликована версия 1 · назначений: 2/)).toBeInTheDocument();
    expect(screen.getByText('Отчётов о понятности: 1')).toBeInTheDocument();
  });

  it('новое ТЗ сохраняется черновиком и открывается', async () => {
    render(<MentorBriefsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Новое ТЗ/ }));
    fillBrief();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' })); });
    expect(v3.createBrief).toHaveBeenCalledWith(expect.objectContaining({ title: 'Новое ТЗ' }));
    expect(window.location.hash).toBe(`#/mentor/briefs/${fx.BRIEF_ID}`);
  });

  it('ошибка сохранения, пусто и ошибка списка', async () => {
    v3.createBrief.mockRejectedValueOnce(new Error('down'));
    v3.listBriefs.mockResolvedValueOnce([]);
    const { unmount } = render(<MentorBriefsPage />);
    expect(await screen.findByText('ТЗ пока нет')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Новое ТЗ/ }));
    fillBrief();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('ТЗ не сохранилось');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    unmount();
    v3.listBriefs.mockRejectedValueOnce(new Error('down'));
    render(<MentorBriefsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('MentorBriefDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    v3.getBrief.mockResolvedValue(fx.brief());
    v3.listMentorInterns.mockResolvedValue([{ id: fx.INTERN_A, display_name: 'intern-a' }, { id: fx.INTERN_B, display_name: 'intern-b' }]);
    v3.listAssignments.mockResolvedValue([fx.assignment(), fx.assignment({ id: fx.REPORT_ID, brief_id: fx.REPORT_ID })]);
    v3.assignBrief.mockResolvedValue(fx.assignment({ intern: { id: fx.INTERN_B, display_name: 'intern-b' } }));
  });

  it('опубликованная версия, назначения только этого ТЗ, назначение стажёру', async () => {
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    expect(await screen.findByText('Опубликованная версия 1')).toBeInTheDocument();
    expect(await screen.findByText('Назначения')).toBeInTheDocument();
    expect(screen.getAllByText('intern-a').length).toBeGreaterThan(0);
    fireEvent.change(await screen.findByLabelText('Кому назначить'), { target: { value: fx.INTERN_B } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Назначить' })); });
    expect(v3.assignBrief).toHaveBeenCalledWith(fx.BRIEF_ID, 1, fx.INTERN_B);
    expect(screen.getByRole('status')).toHaveTextContent('Назначено: intern-b, версия 1');
  });

  it('повторное назначение — понятная ошибка', async () => {
    v3.assignBrief.mockRejectedValue(new Error('conflict'));
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    fireEvent.change(await screen.findByLabelText('Кому назначить'), { target: { value: fx.INTERN_A } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Назначить' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось назначить');
  });

  it('правка опубликованного → черновик v2 → публикация с expected_revision', async () => {
    const withDraft = fx.brief({ draft: fx.version(2, 'draft'), versions: [{ version: 1, state: 'published', published_at: fx.STAMP }, { version: 2, state: 'draft' }], revision: 4 });
    v3.saveDraft.mockResolvedValue(withDraft);
    v3.publishBrief.mockResolvedValue(fx.brief({ latest_published_version: fx.version(2, 'published'), revision: 5 }));
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подготовить версию 2' }));
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'ТЗ: отчёт уточнённый' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' })); });
    expect(v3.saveDraft).toHaveBeenCalledWith(fx.BRIEF_ID, expect.objectContaining({ title: 'ТЗ: отчёт уточнённый' }), 3);
    expect(screen.getByText('Черновик версии 2')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Опубликовать версию 2/ })); });
    expect(v3.publishBrief).toHaveBeenCalledWith(fx.BRIEF_ID, 4);
    expect(await screen.findByText('Опубликованная версия 2')).toBeInTheDocument();
  });

  it('конфликт версии — сообщение и перечитывание', async () => {
    v3.archiveBrief.mockRejectedValue(new Error('conflict'));
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    const target = await screen.findByRole('button', { name: /В архив/ });
    await act(async () => { fireEvent.click(target); });
    expect(await screen.findByText('Архивация не прошла.')).toBeInTheDocument();
    expect(v3.getBrief).toHaveBeenCalledTimes(2);
  });

  it('архив: без кнопок публикации и назначения', async () => {
    v3.archiveBrief.mockResolvedValue(fx.brief({ state: 'archived', revision: 4 }));
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    const target = await screen.findByRole('button', { name: /В архив/ });
    await act(async () => { fireEvent.click(target); });
    expect(screen.getByText('В архиве')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Назначить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /В архив/ })).not.toBeInTheDocument();
  });

  it('черновик до первой публикации и ошибки загрузки', async () => {
    v3.getBrief.mockResolvedValueOnce(fx.brief({ state: 'draft', latest_published_version: null, draft: fx.version(1, 'draft'), versions: [{ version: 1, state: 'draft' }] }));
    v3.listMentorInterns.mockRejectedValue(new Error('down'));
    const { unmount } = render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    expect(await screen.findByText('Черновик версии 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать черновик' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('button', { name: 'Назначить' })).not.toBeInTheDocument();
    unmount();
    v3.getBrief.mockRejectedValueOnce(new Error('down'));
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('стажёров нет', async () => {
    v3.listMentorInterns.mockResolvedValue([]);
    render(<MentorBriefDetailPage id={fx.BRIEF_ID} />);
    expect(await screen.findByText('В вашей команде нет стажёров.')).toBeInTheDocument();
  });
});

describe('MentorReportsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('список отчётов без имён стажёров', async () => {
    v3.listReports.mockResolvedValue([fx.report()]);
    render(<MentorReportsPage />);
    expect(await screen.findByText('«Критерии приёмки» — неясен критерий приёмки')).toBeInTheDocument();
    expect(screen.getByText(/Разных стажёров за 30 дней: 2/)).toBeInTheDocument();
    expect(screen.queryByText(/intern-/)).not.toBeInTheDocument();
  });

  it('пусто и ошибка', async () => {
    v3.listReports.mockResolvedValueOnce([]);
    const { unmount } = render(<MentorReportsPage />);
    expect(await screen.findByText('Отчётов нет')).toBeInTheDocument();
    unmount();
    v3.listReports.mockRejectedValueOnce(new Error('down'));
    render(<MentorReportsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('MentorReportDetailPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('цикл ревью: в работу → принять → закрыть опубликованной версией', async () => {
    v3.getReport.mockResolvedValue(fx.report());
    v3.reviewReport
      .mockResolvedValueOnce(fx.report({ state: 'under_review', version: 2 }))
      .mockResolvedValueOnce(fx.report({ state: 'accepted', version: 3 }));
    render(<MentorReportDetailPage id={fx.REPORT_ID} />);
    expect(await screen.findByText(/Написано ИИ/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Комментарий к решению'), { target: { value: 'Посмотрю' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' })); });
    expect(v3.reviewReport).toHaveBeenLastCalledWith(fx.REPORT_ID, { decision: 'under_review', reason: 'Посмотрю', expected_version: 1 });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Принять гипотезу' })); });
    expect(v3.reviewReport).toHaveBeenLastCalledWith(fx.REPORT_ID, { decision: 'accepted', reason: 'Решение наставника', expected_version: 2 });
    // Принятие ничего не публикует: закрыть можно только после новой версии.
    expect(screen.getByText(/Принятие ничего не публикует/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Закрыть версией/ })).not.toBeInTheDocument();
  });

  it('accepted + опубликована новая версия → resolved с этой версией', async () => {
    v3.getReport.mockResolvedValue(fx.report({ state: 'accepted', version: 3, latest_published_version: 2 }));
    v3.reviewReport.mockResolvedValue(fx.report({ state: 'resolved', version: 4, latest_published_version: 2, resolved_version: 2 }));
    render(<MentorReportDetailPage id={fx.REPORT_ID} />);
    const target = await screen.findByRole('button', { name: 'Закрыть версией 2' });
    await act(async () => { fireEvent.click(target); });
    expect(v3.reviewReport).toHaveBeenCalledWith(fx.REPORT_ID, { decision: 'resolved', reason: 'Решение наставника', expected_version: 3, resolved_version: 2 });
    expect(screen.getByText('Закрыто версией 2.')).toBeInTheDocument();
  });

  it('отклонение, ошибка решения и отклонённый отчёт', async () => {
    v3.getReport.mockResolvedValue(fx.report({ state: 'under_review', version: 2 }));
    v3.reviewReport.mockRejectedValueOnce(new Error('conflict')).mockResolvedValueOnce(fx.report({ state: 'rejected', version: 3 }));
    render(<MentorReportDetailPage id={fx.REPORT_ID} />);
    const target = await screen.findByRole('button', { name: 'Отклонить' });
    await act(async () => { fireEvent.click(target); });
    expect(screen.getByRole('alert')).toHaveTextContent('Решение не сохранилось');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отклонить' })); });
    expect(screen.getByText(/Гипотеза отклонена/)).toBeInTheDocument();
  });

  it('гипотеза готовится: тихий опрос до completed', async () => {
    v3.getReport
      .mockResolvedValueOnce(fx.report({ enrichment_status: 'pending', hypothesis: 'Шаблон' }))
      .mockResolvedValue(fx.report({ enrichment_status: 'completed', hypothesis: 'Гипотеза модели' }));
    render(<MentorReportDetailPage id={fx.REPORT_ID} pollMs={10} />);
    expect(await screen.findByText(/ИИ готовит гипотезу/)).toBeInTheDocument();
    expect(await screen.findByText('Гипотеза модели')).toBeInTheDocument();
  });

  it('ИИ недоступен — честная пометка; ошибка загрузки', async () => {
    v3.getReport.mockResolvedValueOnce(fx.report({ enrichment_status: 'failed' }));
    const { unmount } = render(<MentorReportDetailPage id={fx.REPORT_ID} />);
    expect(await screen.findByText(/ИИ недоступен/)).toBeInTheDocument();
    unmount();
    v3.getReport.mockRejectedValueOnce(new Error('down'));
    render(<MentorReportDetailPage id={fx.REPORT_ID} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
