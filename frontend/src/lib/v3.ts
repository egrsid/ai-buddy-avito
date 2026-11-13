import type { z } from 'zod';
import {
  BriefContent,
  ContactExport,
  ContactPreview,
  ContactPreviewRequest,
  FrictionReason,
  FrictionReceipt,
  GoalSummaryList,
  InternList,
  MentorContact,
  MessageOriginList,
  Statistics,
  TaskAssignment,
  TaskAssignmentList,
  TaskBrief,
  TaskBriefList,
  TaskBriefVersion,
  TaskClarityReport,
  TaskClarityReportList,
  TaskClarityReviewRequest,
} from '../contracts/v3';
import { apiFetch, newIdempotencyKey } from './api';

// V3-FE-01: typed-обёртки Go API v3 (docs/v3/backend-api.md). Ответы парсятся zod v3.

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`API shape mismatch: ${result.error.issues[0]?.path.join('.')} ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

const V3 = '/api/v3';

export type MentorContactT = z.infer<typeof MentorContact>;
export type ContactPreviewT = z.infer<typeof ContactPreview>;
export type BriefContentT = z.infer<typeof BriefContent>;
export type TaskBriefT = z.infer<typeof TaskBrief>;
export type TaskBriefVersionT = z.infer<typeof TaskBriefVersion>;
export type TaskAssignmentT = z.infer<typeof TaskAssignment>;
export type TaskClarityReportT = z.infer<typeof TaskClarityReport>;
export type FrictionReasonT = z.infer<typeof FrictionReason>;
export type StatisticsT = z.infer<typeof Statistics>;

// --- Telegram-контакт наставника ---

export const getMentorContact = async () => parse(MentorContact, await apiFetch(`${V3}/me/mentor-contact`));

export async function createContactPreview(input: z.infer<typeof ContactPreviewRequest>) {
  const body = ContactPreviewRequest.parse(input);
  return parse(ContactPreview, await apiFetch(`${V3}/mentor-contact-preview`, { method: 'POST', body }));
}

export const exportContact = async (preview: ContactPreviewT) =>
  parse(ContactExport, await apiFetch(`${V3}/mentor-contact-export`, {
    method: 'POST',
    body: { preview_id: preview.id, content_hash: preview.content_hash, contact_revision: preview.contact_revision },
  }));

// --- цели ---

export async function listGoalSummaries(cursor?: string | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return parse(GoalSummaryList, await apiFetch(`${V3}/goals${query}`));
}

// --- ТЗ наставника ---

export const listMentorInterns = async () => parse(InternList, await apiFetch(`${V3}/mentor/interns`)).items;
export const listBriefs = async () => parse(TaskBriefList, await apiFetch(`${V3}/task-briefs`)).items;
export const getBrief = async (id: string) => parse(TaskBrief, await apiFetch(`${V3}/task-briefs/${id}`));

export async function createBrief(content: BriefContentT) {
  return parse(TaskBrief, await apiFetch(`${V3}/task-briefs`, {
    method: 'POST',
    body: { content: BriefContent.parse(content) },
    idempotencyKey: newIdempotencyKey(),
  }));
}

export async function saveDraft(id: string, content: BriefContentT, expectedRevision: number) {
  return parse(TaskBrief, await apiFetch(`${V3}/task-briefs/${id}/draft`, {
    method: 'POST',
    body: { content: BriefContent.parse(content), expected_revision: expectedRevision },
  }));
}

export const publishBrief = async (id: string, expectedRevision: number) =>
  parse(TaskBrief, await apiFetch(`${V3}/task-briefs/${id}/publish`, { method: 'POST', body: { expected_revision: expectedRevision } }));

export const archiveBrief = async (id: string, expectedRevision: number) =>
  parse(TaskBrief, await apiFetch(`${V3}/task-briefs/${id}/archive`, { method: 'POST', body: { expected_revision: expectedRevision } }));

// --- назначения ---

export async function assignBrief(briefId: string, briefVersion: number, internId: string) {
  return parse(TaskAssignment, await apiFetch(`${V3}/task-assignments`, {
    method: 'POST',
    body: { brief_id: briefId, brief_version: briefVersion, intern_id: internId },
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const listAssignments = async () => parse(TaskAssignmentList, await apiFetch(`${V3}/task-assignments`)).items;
export const getAssignment = async (id: string) => parse(TaskAssignment, await apiFetch(`${V3}/task-assignments/${id}`));

// Новая опубликованная версия для стажёра до перехода (права проверяются через назначение).
export const getLatestVersion = async (id: string) =>
  parse(TaskBriefVersion, await apiFetch(`${V3}/task-assignments/${id}/latest-version`));

export const adoptVersion = async (id: string, briefVersion: number, expectedRevision: number) =>
  parse(TaskAssignment, await apiFetch(`${V3}/task-assignments/${id}/adopt-version`, {
    method: 'POST',
    body: { brief_version: briefVersion, expected_revision: expectedRevision },
  }));

export async function reportFriction(assignmentId: string, sectionId: string, reason: FrictionReasonT) {
  return parse(FrictionReceipt, await apiFetch(`${V3}/task-assignments/${assignmentId}/frictions`, {
    method: 'POST',
    body: { section_id: sectionId, reason },
    idempotencyKey: newIdempotencyKey(),
  }));
}

// --- отчёты о понятности ТЗ ---

export const listReports = async () => parse(TaskClarityReportList, await apiFetch(`${V3}/task-clarity-reports`)).items;
export const getReport = async (id: string) => parse(TaskClarityReport, await apiFetch(`${V3}/task-clarity-reports/${id}`));

export async function reviewReport(id: string, input: z.infer<typeof TaskClarityReviewRequest>) {
  return parse(TaskClarityReport, await apiFetch(`${V3}/task-clarity-reports/${id}/review`, {
    method: 'POST',
    body: TaskClarityReviewRequest.parse(input),
    idempotencyKey: newIdempotencyKey(),
  }));
}

// --- статистика ---

export async function getStatistics(view: 'mentor' | 'documentation', days: 7 | 30 | 90, source?: 'technical' | 'task_clarity') {
  const query = new URLSearchParams({ days: String(days) });
  if (source && view === 'mentor') query.set('source', source);
  return parse(Statistics, await apiFetch(`${V3}/statistics/${view}?${query.toString()}`));
}

// --- кто ответил в чате ---

export const listMessageOrigins = async (conversationId: string) =>
  parse(MessageOriginList, await apiFetch(`${V3}/conversations/${conversationId}/message-origins`)).items;
