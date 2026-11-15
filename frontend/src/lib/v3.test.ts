import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from '../test/v3fixtures';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('./api', () => ({
  apiFetch: apiFetchMock,
  newIdempotencyKey: () => '11111111-2222-4333-8444-555555555555',
}));

import * as api from './v3';

const KEY = '11111111-2222-4333-8444-555555555555';

beforeEach(() => apiFetchMock.mockReset());

describe('v3: Telegram-контакт', () => {
  it('контакт: available и missing', async () => {
    apiFetchMock.mockResolvedValueOnce(fx.contact).mockResolvedValueOnce({ status: 'missing' });
    expect(await api.getMentorContact()).toEqual(fx.contact);
    expect(await api.getMentorContact()).toEqual({ status: 'missing' });
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v3/me/mentor-contact');
  });

  it('ссылка только на t.me: чужой host ломает разбор', async () => {
    apiFetchMock.mockResolvedValue({ ...fx.contact, telegram_url: 'https://evil.example/x' });
    await expect(api.getMentorContact()).rejects.toThrow(/API shape mismatch/);
  });

  it('preview по шагу или по разделу задания, export по hash', async () => {
    apiFetchMock.mockResolvedValue(fx.preview);
    await api.createContactPreview({ goal_id: fx.BRIEF_ID, step_id: 'check_access', question: 'Как?' });
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/mentor-contact-preview', {
      method: 'POST',
      body: { goal_id: fx.BRIEF_ID, step_id: 'check_access', question: 'Как?' },
    });
    await api.createContactPreview({ assignment_id: fx.ASSIGNMENT_ID, section_id: 'goal' });
    apiFetchMock.mockResolvedValue({ text: 'Текст', telegram_url: fx.contact.telegram_url });
    const exported = await api.exportContact(fx.preview);
    expect(exported.text).toBe('Текст');
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/mentor-contact-export', {
      method: 'POST',
      body: { preview_id: fx.preview.id, content_hash: fx.HASH, contact_revision: 1 },
    });
  });
});

describe('v3: цели', () => {
  it('страницы целей с курсором', async () => {
    apiFetchMock.mockResolvedValue({ items: [], next_cursor: null });
    await api.listGoalSummaries();
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/goals');
    await api.listGoalSummaries('a_b-c');
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/goals?cursor=a_b-c');
  });
});

describe('v3: ТЗ и назначения', () => {
  it('создание с ключом идемпотентности, черновик/публикация/архив с expected_revision', async () => {
    apiFetchMock.mockResolvedValue(fx.brief());
    await api.createBrief(fx.content);
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/task-briefs', { method: 'POST', body: { content: fx.content }, idempotencyKey: KEY });
    await api.saveDraft(fx.BRIEF_ID, fx.content, 3);
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-briefs/${fx.BRIEF_ID}/draft`, { method: 'POST', body: { content: fx.content, expected_revision: 3 } });
    await api.publishBrief(fx.BRIEF_ID, 4);
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-briefs/${fx.BRIEF_ID}/publish`, { method: 'POST', body: { expected_revision: 4 } });
    await api.archiveBrief(fx.BRIEF_ID, 5);
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-briefs/${fx.BRIEF_ID}/archive`, { method: 'POST', body: { expected_revision: 5 } });
    expect((await api.getBrief(fx.BRIEF_ID)).title).toBe('ТЗ: отчёт');
    apiFetchMock.mockResolvedValue({ items: [fx.brief()] });
    expect(await api.listBriefs()).toHaveLength(1);
  });

  it('клиент не может прислать лишние поля в тексте ТЗ', async () => {
    await expect(api.createBrief({ ...fx.content, owner_id: fx.BUDDY_A } as never)).rejects.toThrow();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('назначение, переход на версию, отметка неясности', async () => {
    apiFetchMock.mockResolvedValue({ items: [{ id: fx.INTERN_A, display_name: 'intern-a' }] });
    expect(await api.listMentorInterns()).toHaveLength(1);
    apiFetchMock.mockResolvedValue(fx.assignment());
    await api.assignBrief(fx.BRIEF_ID, 1, fx.INTERN_A);
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/task-assignments', {
      method: 'POST', body: { brief_id: fx.BRIEF_ID, brief_version: 1, intern_id: fx.INTERN_A }, idempotencyKey: KEY,
    });
    await api.getAssignment(fx.ASSIGNMENT_ID);
    apiFetchMock.mockResolvedValueOnce(fx.version(2, 'published'));
    expect((await api.getLatestVersion(fx.ASSIGNMENT_ID)).version).toBe(2);
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-assignments/${fx.ASSIGNMENT_ID}/latest-version`);
    await api.adoptVersion(fx.ASSIGNMENT_ID, 2, 1);
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-assignments/${fx.ASSIGNMENT_ID}/adopt-version`, { method: 'POST', body: { brief_version: 2, expected_revision: 1 } });
    apiFetchMock.mockResolvedValue({ items: [fx.assignment()] });
    expect(await api.listAssignments()).toHaveLength(1);
    apiFetchMock.mockResolvedValue({ status: 'recorded', assignment_id: fx.ASSIGNMENT_ID, brief_version: 1, section_id: 'goal', reason: 'outcome_unclear' });
    await api.reportFriction(fx.ASSIGNMENT_ID, 'goal', 'outcome_unclear');
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-assignments/${fx.ASSIGNMENT_ID}/frictions`, {
      method: 'POST', body: { section_id: 'goal', reason: 'outcome_unclear' }, idempotencyKey: KEY,
    });
  });

  it('отчёт без стажёров в ответе: лишнее поле ломает разбор', async () => {
    apiFetchMock.mockResolvedValue({ ...fx.report(), intern_ids: [fx.INTERN_A] });
    await expect(api.getReport(fx.REPORT_ID)).rejects.toThrow(/API shape mismatch/);
  });
});

describe('v3: отчёты, статистика, происхождение ответа', () => {
  it('ревью отчёта с ключом идемпотентности', async () => {
    apiFetchMock.mockResolvedValue({ items: [fx.report()] });
    expect(await api.listReports()).toHaveLength(1);
    apiFetchMock.mockResolvedValue(fx.report({ state: 'resolved', resolved_version: 2, latest_published_version: 2 }));
    await api.reviewReport(fx.REPORT_ID, { decision: 'resolved', reason: 'v2', expected_version: 3, resolved_version: 2 });
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/task-clarity-reports/${fx.REPORT_ID}/review`, {
      method: 'POST', body: { decision: 'resolved', reason: 'v2', expected_version: 3, resolved_version: 2 }, idempotencyKey: KEY,
    });
  });

  it('статистика: source только у наставника', async () => {
    apiFetchMock.mockResolvedValue(fx.stats());
    await api.getStatistics('mentor', 7, 'task_clarity');
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/statistics/mentor?days=7&source=task_clarity');
    await api.getStatistics('documentation', 90, 'technical');
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/statistics/documentation?days=90');
    await api.getStatistics('mentor', 30, 'technical', { error_code: 'DB_SSL_REQUIRED', status: '' });
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v3/statistics/mentor?days=30&source=technical&error_code=DB_SSL_REQUIRED');
  });

  it('происхождение ответов из истории', async () => {
    const origin = { mode: 'live', answered_by: 'secondary', completion: 'complete' };
    apiFetchMock.mockResolvedValue({ items: [{ run_id: fx.REPORT_ID, message_id: fx.BRIEF_ID, origin }] });
    expect((await api.listMessageOrigins(fx.ASSIGNMENT_ID))[0].origin).toEqual(origin);
    expect(apiFetchMock).toHaveBeenLastCalledWith(`/api/v3/conversations/${fx.ASSIGNMENT_ID}/message-origins`);
  });
});
