import { z } from 'zod';
import { apiFetch, newIdempotencyKey } from './api';
import * as C from '../contracts/v3';

export async function read3<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  return schema.parse(await apiFetch(path, { version: 'v3', signal }));
}
export async function write3<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await apiFetch(path, { version: 'v3', method: 'POST', body, idempotencyKey: newIdempotencyKey() }));
}
export const listBriefs = (signal?: AbortSignal) => read3('/task-briefs', C.TaskBriefList, signal).then(r => r.items);
export const listAssignments = (signal?: AbortSignal) => read3('/task-assignments', C.TaskAssignmentList, signal).then(r => r.items);
export const listReports = (signal?: AbortSignal) => read3('/task-clarity-reports', C.TaskClarityReportList, signal).then(r => r.items);
export type Brief = z.infer<typeof C.TaskBrief>;
export type Content = z.infer<typeof C.BriefContent>;
export type Assignment = z.infer<typeof C.TaskAssignment>;
export type Report = z.infer<typeof C.TaskClarityReport>;
export type Origin = z.infer<typeof C.ResponseOrigin>;
