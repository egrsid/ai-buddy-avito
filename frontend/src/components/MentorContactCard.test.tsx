import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import * as fx from '../test/v3fixtures';
import { MentorContactCard } from './MentorContactCard';

const v3 = vi.hoisted(() => ({
  getMentorContact: vi.fn(),
  createContactPreview: vi.fn(),
  exportContact: vi.fn(),
}));
vi.mock('../lib/v3', () => v3);

const writeText = vi.fn();
const open = vi.fn();

describe('MentorContactCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    v3.getMentorContact.mockResolvedValue(fx.contact);
    v3.createContactPreview.mockResolvedValue(fx.preview);
    v3.exportContact.mockResolvedValue({ text: fx.preview.text, telegram_url: fx.contact.telegram_url });
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.stubGlobal('open', open);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('preview → копирование и открытие t.me без статуса «доставлено»', async () => {
    render(<MentorContactCard context={{ goalId: fx.BRIEF_ID, stepId: 'check_access' }} />);
    expect(await screen.findByText(/Ваш наставник: buddy-a/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить сообщение' }));
    fireEvent.change(screen.getByLabelText(/Вопрос наставнику/), { target: { value: '  Как включить SSL?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Показать текст сообщения' }));
    expect(await screen.findByLabelText('Текст для наставника')).toHaveTextContent('Нужна помощь по онбордингу');
    expect(v3.createContactPreview).toHaveBeenCalledWith({ goal_id: fx.BRIEF_ID, step_id: 'check_access', question: 'Как включить SSL?' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Скопировать и открыть Telegram/ })); });
    expect(v3.exportContact).toHaveBeenCalledWith(fx.preview);
    expect(writeText).toHaveBeenCalledWith(fx.preview.text);
    expect(open).toHaveBeenCalledWith('https://t.me/ai_buddy_demo_mentor_a', '_blank', 'noopener,noreferrer');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Текст скопирован. Telegram открыт');
    expect(status).not.toHaveTextContent(/доставлен|отправлено/i);
  });

  it('контекст раздела задания и копирование без открытия', async () => {
    render(<MentorContactCard context={{ assignmentId: fx.ASSIGNMENT_ID, sectionId: 'deadline' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подготовить сообщение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Показать текст сообщения' }));
    await screen.findByLabelText('Текст для наставника');
    expect(v3.createContactPreview).toHaveBeenCalledWith({ assignment_id: fx.ASSIGNMENT_ID, section_id: 'deadline' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Только скопировать/ })); });
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Текст скопирован.');
  });

  it('устаревший preview (409) — просим подготовить заново', async () => {
    v3.exportContact.mockRejectedValue(new ApiError(409, 'VERSION_CONFLICT', 'VERSION_CONFLICT'));
    render(<MentorContactCard context={{ assignmentId: fx.ASSIGNMENT_ID }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подготовить сообщение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Показать текст сообщения' }));
    await screen.findByLabelText('Текст для наставника');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Только скопировать/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Подготовьте сообщение заново');
    expect(screen.queryByLabelText('Текст для наставника')).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('буфер обмена запрещён — текст остаётся для ручного копирования', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<MentorContactCard context={{ assignmentId: fx.ASSIGNMENT_ID }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подготовить сообщение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Показать текст сообщения' }));
    await screen.findByLabelText('Текст для наставника');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Только скопировать/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent('выделите текст');
    expect(screen.getByLabelText('Текст для наставника')).toBeInTheDocument();
  });

  it('ошибки preview и export показываются без слома', async () => {
    v3.createContactPreview.mockRejectedValueOnce(new Error('down'));
    v3.exportContact.mockRejectedValueOnce(new Error('down'));
    render(<MentorContactCard context={{ assignmentId: fx.ASSIGNMENT_ID }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подготовить сообщение' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Показать текст сообщения' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось подготовить текст');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Показать текст сообщения' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Только скопировать/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось получить текст');
  });

  it('без контекста — только ссылка на Telegram', async () => {
    render(<MentorContactCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Открыть Telegram/ }));
    expect(open).toHaveBeenCalledWith(fx.contact.telegram_url, '_blank', 'noopener,noreferrer');
    expect(screen.queryByRole('button', { name: 'Подготовить сообщение' })).not.toBeInTheDocument();
  });

  it('контакта нет и ошибка загрузки', async () => {
    v3.getMentorContact.mockResolvedValueOnce({ status: 'missing' });
    const { unmount } = render(<MentorContactCard />);
    expect(await screen.findByText(/Telegram наставника не указан/)).toBeInTheDocument();
    unmount();
    v3.getMentorContact.mockRejectedValueOnce(new Error('down'));
    render(<MentorContactCard />);
    expect(await screen.findByText(/Сервис временно недоступен|недоступен/)).toBeInTheDocument();
  });
});
