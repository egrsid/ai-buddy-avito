import type { z } from 'zod';
import {
  AccessDecisionRequest,
  AccessRequest,
  AccessRequestList,
  Action,
  ActionDraft,
  AuthSession,
  Candidate,
  CandidateList,
  CandidateReviewRequest,
  Check,
  CheckCreateRequest,
  Conversation,
  ConversationList,
  Escalation,
  EscalationList,
  EscalationReplyRequest,
  FrictionAggregateList,
  Goal,
  GoalCreateRequest,
  GoalList,
  JourneyList,
  KnowledgeDocument,
  MessageList,
  ResourceAccess,
  ResourceList,
  Run,
  RunCreateRequest,
  Step,
  StepActionList,
} from '../contracts/public';
import { apiFetch, newIdempotencyKey, setCsrfToken } from './api';

// RP-FE-02: typed-обёртки эндпоинтов. Ответы парсятся zod-биндингами v2 —
// расхождение wire-формата ловится сразу, а не в рендере.

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`API shape mismatch: ${result.error.issues[0]?.path.join('.')} ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

// --- auth ---

export type Session = z.infer<typeof AuthSession>;

export async function demoLogin(accountId: string): Promise<Session> {
  const session = parse(AuthSession, await apiFetch('/auth/demo-login', {
    method: 'POST',
    body: { account_id: accountId },
  }));
  setCsrfToken(session.csrf_token);
  return session;
}

export async function me(): Promise<Session> {
  const session = parse(AuthSession, await apiFetch('/auth/me'));
  setCsrfToken(session.csrf_token);
  return session;
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST', body: {} });
  setCsrfToken(null);
}

// --- journeys / goals / steps / checks ---

export const listJourneys = async () =>
  parse(JourneyList, await apiFetch('/journeys')).items;

export async function createGoal(journeyId: string, journeyVersion: number) {
  const body = GoalCreateRequest.parse({ journey_id: journeyId, journey_version: journeyVersion });
  return parse(Goal, await apiFetch('/goals', {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const listGoals = async () => parse(GoalList, await apiFetch('/goals')).items;

export const getGoal = async (id: string) => parse(Goal, await apiFetch(`/goals/${id}`));

export const getStep = async (goalId: string, stepId: string) =>
  parse(Step, await apiFetch(`/goals/${goalId}/steps/${stepId}`));

export const getStepActions = async (goalId: string, stepId: string) =>
  parse(StepActionList, await apiFetch(`/goals/${goalId}/steps/${stepId}/actions`)).items;

export async function createCheck(
  goalId: string,
  stepId: string,
  input: z.infer<typeof CheckCreateRequest>,
) {
  const body = CheckCreateRequest.parse(input);
  return parse(Check, await apiFetch(`/goals/${goalId}/steps/${stepId}/checks`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const getCheck = async (id: string) => parse(Check, await apiFetch(`/checks/${id}`));

export const listResources = async () => parse(ResourceList, await apiFetch('/resources')).items;

export const getResourceAccess = async (resourceId: string) =>
  parse(ResourceAccess, await apiFetch(`/resources/${resourceId}/access`));

export const getKnowledge = async (id: string) =>
  parse(KnowledgeDocument, await apiFetch(`/knowledge/${id}`));

// --- access requests / approvals ---

// Один эндпоинт на обе роли: intern видит свои, approver — назначенные ресурсы.
export const listAccessRequests = async () =>
  parse(AccessRequestList, await apiFetch('/access-requests')).items;

export const getAccessRequest = async (id: string) =>
  parse(AccessRequest, await apiFetch(`/access-requests/${id}`));

export async function decideAccessRequest(
  id: string,
  input: z.infer<typeof AccessDecisionRequest>,
) {
  const body = AccessDecisionRequest.parse(input);
  return parse(AccessRequest, await apiFetch(`/access-requests/${id}/decision`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}

// --- chat: conversations / runs ---

export async function createConversation(goalId: string | null, stepId: string | null) {
  return parse(Conversation, await apiFetch('/conversations', {
    method: 'POST',
    body: { goal_id: goalId, step_id: stepId },
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const listConversations = async () =>
  parse(ConversationList, await apiFetch('/conversations')).items;

export const listMessages = async (conversationId: string) =>
  parse(MessageList, await apiFetch(`/conversations/${conversationId}/messages`)).items;

export async function createRun(conversationId: string, input: z.infer<typeof RunCreateRequest>) {
  const body = RunCreateRequest.parse(input);
  return parse(Run, await apiFetch(`/conversations/${conversationId}/runs`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const getRun = async (id: string) => parse(Run, await apiFetch(`/runs/${id}`));

export const cancelRun = async (id: string) =>
  parse(Run, await apiFetch(`/runs/${id}/cancel`, { method: 'POST', body: {} }));

// --- actions ---

export async function createAction(input: z.infer<typeof ActionDraft>) {
  const body = ActionDraft.parse(input);
  return parse(Action, await apiFetch('/actions', {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const getAction = async (id: string) => parse(Action, await apiFetch(`/actions/${id}`));

export const confirmAction = async (id: string) =>
  parse(Action, await apiFetch(`/actions/${id}/confirm`, { method: 'POST', body: {} }));

export const cancelAction = async (id: string) =>
  parse(Action, await apiFetch(`/actions/${id}/cancel`, { method: 'POST', body: {} }));

// --- buddy / feedback loop ---

export const listEscalations = async () =>
  parse(EscalationList, await apiFetch('/escalations')).items;

export const getEscalation = async (id: string) =>
  parse(Escalation, await apiFetch(`/escalations/${id}`));

export async function replyEscalation(id: string, input: z.infer<typeof EscalationReplyRequest>) {
  const body = EscalationReplyRequest.parse(input);
  return parse(Escalation, await apiFetch(`/escalations/${id}/reply`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}

export const listFrictionGroups = async () =>
  parse(FrictionAggregateList, await apiFetch('/friction-groups')).items;

export const listCandidates = async () =>
  parse(CandidateList, await apiFetch('/knowledge-gaps')).items;

export const getCandidate = async (id: string) =>
  parse(Candidate, await apiFetch(`/knowledge-gaps/${id}`));

export async function reviewCandidate(id: string, input: z.infer<typeof CandidateReviewRequest>) {
  const body = CandidateReviewRequest.parse(input);
  return parse(Candidate, await apiFetch(`/knowledge-gaps/${id}/review`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  }));
}
