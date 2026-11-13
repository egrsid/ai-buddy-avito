import type { z } from 'zod';
import type * as pub from '../contracts/public';

// FE-LOCAL DRAFT FIXTURES (не контрактные).
// Назначение: верстка и тестирование всех UI-состояний до поставки официальных
// fixtures Backend (замечание 3.1 из RP-CONTRACT-FE-01 review).
// Каждый объект валидируется zod-схемами v2 в fixtures.test.ts.

export type Goal = z.infer<typeof pub.Goal>;
export type Step = z.infer<typeof pub.Step>;
export type Check = z.infer<typeof pub.Check>;
export type Action = z.infer<typeof pub.Action>;
export type AccessRequest = z.infer<typeof pub.AccessRequest>;
export type Escalation = z.infer<typeof pub.Escalation>;
export type Candidate = z.infer<typeof pub.Candidate>;
export type ResourceAccess = z.infer<typeof pub.ResourceAccess>;
export type Evidence = z.infer<typeof pub.Evidence>;
export type Blocker = z.infer<typeof pub.Blocker>;
export type ErrorBody = z.infer<typeof import('../contracts/common').ErrorBody>;
export type User = z.infer<typeof pub.User>;

const u = (n: string) => `000000${n}-0000-4000-8000-0000000000${n.slice(-2)}`;
const T = '2026-11-11T09:00:00Z';
const T2 = '2026-11-11T09:05:00Z';

const DOC = { document_id: u('0a'), version: 1 };

function step(over: Partial<Step> & Pick<Step, 'id' | 'status'>): Step {
  return {
    title: over.id,
    description: 'Синтетический шаг маршрута.',
    dependencies: [],
    required_permissions: ['resource.view'],
    instruction_reference: DOC,
    available_actions: ['retry_check'],
    verification_method: 'resource_policy_match',
    version: 1,
    evidence: [],
    blockers: [],
    ...over,
  };
}

export const evidencePassed: Evidence = {
  id: u('15'), check_id: u('14'), event_id: u('16'),
  source: 'mock_db_adapter', method: 'mock_db_connection',
  result: 'passed', observed_at: T, synthetic: true,
};

export const evidenceInvalidated: Evidence = {
  ...evidencePassed, id: u('17'), result: 'failed', invalidated_at: T2,
};

export const blockerOpen: Blocker = {
  id: u('28'), type: 'db_ssl_required', error_code: 'DB_SSL_REQUIRED',
  status: 'open', latest_check_id: u('14'),
  recovery_actions: ['retry_check', 'escalate_to_buddy'],
};

export const blockerResolved: Blocker = { ...blockerOpen, id: u('29'), status: 'resolved' };

const stepVerified = step({
  id: 'select_resource', status: 'verified', evidence: [evidencePassed],
});
const stepAccessVerified = step({
  id: 'check_access', status: 'verified',
  dependencies: [{ step_id: 'select_resource', condition: 'verified' }],
  required_permissions: ['access.request', 'access.check'],
  available_actions: ['create_access_request', 'retry_check'],
  verification_method: 'iam_permission_present',
  evidence: [{ ...evidencePassed, id: u('18'), method: 'iam_permission_present', result: 'passed' }],
});
const stepConnBlocked = step({
  id: 'check_connection', status: 'blocked',
  dependencies: [{ step_id: 'check_access', condition: 'verified' }],
  required_permissions: ['db.check'],
  available_actions: ['retry_check', 'escalate_to_buddy'],
  verification_method: 'mock_db_connection',
  evidence: [evidenceInvalidated],
  blockers: [blockerOpen],
  user_claim: 'Вроде всё настроил по инструкции',
});

function goal(status: Goal['status'], steps: Step[], verified: number, version = 2, id = '1e'): Goal {
  return {
    id: u(id), journey_id: 'db-access-team-a', journey_version: 1,
    resource_id: 'db-team-a-test', status, version, steps,
    progress: { verified, total: 3, percent: Math.floor((verified * 100) / 3) },
    updated_at: T2,
  };
}

// У каждой цели свой id — иначе lookup по goalId всегда находит первую.
export const goalBlocked = goal('blocked', [stepVerified, stepAccessVerified, stepConnBlocked], 2);

export const goalReady = goal('ready', [
  stepVerified,
  stepAccessVerified,
  step({ ...stepConnBlocked, status: 'ready', evidence: [], blockers: [], user_claim: undefined }),
], 2, 2, '1f');

export const goalWaitingExternal = goal('waiting_external', [
  stepVerified,
  step({ ...stepAccessVerified, status: 'waiting_external', evidence: [], blockers: [blockerOpen] }),
  step({ ...stepConnBlocked, status: 'unverified', evidence: [], blockers: [], user_claim: undefined }),
], 1, 2, '20');

export const goalVerified = goal('verified', [
  stepVerified, stepAccessVerified,
  step({ ...stepConnBlocked, status: 'verified', evidence: [evidencePassed], blockers: [], user_claim: undefined }),
], 3, 4, '21');

export const goalUnverified = goal('unverified', [
  step({ ...stepVerified, status: 'ready', evidence: [] }),
  step({ ...stepAccessVerified, status: 'unverified', evidence: [] }),
  step({ ...stepConnBlocked, status: 'unverified', evidence: [], blockers: [], user_claim: undefined }),
], 0, 1, '22');

export const goals = [goalBlocked, goalReady, goalWaitingExternal, goalVerified, goalUnverified];
export const emptyGoals: Goal[] = [];

// --- Checks: все состояния ---

const checkBase = {
  goal_id: u('1e'), step_id: 'check_connection' as const,
  method: 'mock_db_connection' as const, evidence_ids: [] as string[],
};

export const checks: Check[] = [
  { ...checkBase, id: u('11'), status: 'queued' },
  { ...checkBase, id: u('12'), status: 'running' },
  { ...checkBase, id: u('13'), status: 'passed', observed_at: T, evidence_ids: [u('15')] },
  { ...checkBase, id: u('14'), status: 'failed', error_code: 'DB_SSL_REQUIRED', observed_at: T, evidence_ids: [u('17')] },
  { ...checkBase, id: u('19'), status: 'unavailable', error_code: 'CHECK_UNAVAILABLE', observed_at: T2 },
];

// --- Actions: все состояния ---

const actionBase = {
  type: 'create_access_request' as const,
  goal_id: u('1e'), step_id: 'check_access',
  parameters: {
    resource_id: 'db-team-a-test', requested_role: 'db_reader' as const,
    reason: 'Нужен доступ к синтетической БД команды A.', additional_fields: {},
  },
  preview: {
    initiator_id: u('01'), resource_id: 'db-team-a-test', requested_role: 'db_reader' as const,
    reason: 'Нужен доступ к синтетической БД команды A.', recipient_id: u('06'),
  },
  created_at: T,
};

export const actions: Action[] = [
  { ...actionBase, id: u('3c'), status: 'pending_confirmation', expires_at: '2026-11-11T09:10:00Z' },
  { ...actionBase, id: u('3d'), status: 'executing', expires_at: '2026-11-11T09:10:00Z' },
  { ...actionBase, id: u('3e'), status: 'succeeded', expires_at: '2026-11-11T09:10:00Z', result: { access_request_id: u('48') } },
  { ...actionBase, id: u('3f'), status: 'failed', expires_at: '2026-11-11T09:10:00Z', error_code: 'UPSTREAM_ERROR' },
  { ...actionBase, id: u('40'), status: 'unknown', expires_at: '2026-11-11T09:10:00Z', error_code: 'UPSTREAM_TIMEOUT' },
  { ...actionBase, id: u('41'), status: 'expired', expires_at: '2026-11-11T09:10:00Z' },
  { ...actionBase, id: u('42'), status: 'cancelled', expires_at: '2026-11-11T09:10:00Z' },
];

// --- AccessRequests: статусы, grant_state, sync ---

const reqBase = {
  goal_id: u('1e'), step_id: 'check_access', resource_id: 'db-team-a-test',
  requested_role: 'db_reader' as const, reason: 'Нужен доступ к синтетической БД команды A.',
  created_at: T, updated_at: T,
};

export const accessRequests: AccessRequest[] = [
  { ...reqBase, id: u('48'), mock_id: u('49'), status: 'submitted', grant_state: 'absent', sync_status: 'ok', version: 1 },
  { ...reqBase, id: u('4a'), mock_id: u('4b'), status: 'approved', grant_state: 'pending', sync_status: 'ok', version: 2, updated_at: T2 },
  { ...reqBase, id: u('4c'), mock_id: u('4d'), status: 'approved', grant_state: 'present', sync_status: 'ok', version: 3, updated_at: T2 },
  { ...reqBase, id: u('4e'), mock_id: u('4f'), status: 'rejected', grant_state: 'absent', sync_status: 'ok', version: 2, updated_at: T2 },
  { ...reqBase, id: u('50'), mock_id: u('51'), status: 'approved', grant_state: 'unknown', sync_status: 'unavailable', version: 2, updated_at: T2 },
];
export const emptyAccessRequests: AccessRequest[] = [];

// --- ResourceAccess: stale и обычный ---

export const resourceAccessFresh: ResourceAccess = { grant_state: 'present', observed_at: T2, stale: false };
export const resourceAccessStale: ResourceAccess = { grant_state: 'absent', observed_at: T, stale: true };

// --- Escalations: open и resolved ---

const snapshot = {
  goal: { id: u('1e'), title: 'Доступ к синтетической БД' },
  step: { id: 'check_connection', title: 'Проверить подключение' },
  blocker: { id: u('28'), type: 'db_ssl_required' as const, error_code: 'DB_SSL_REQUIRED' as const },
  checks: [{
    id: u('14'), goal_id: u('1e'), step_id: 'check_connection',
    method: 'mock_db_connection' as const, status: 'failed' as const,
    error_code: 'DB_SSL_REQUIRED' as const, observed_at: T,
  }],
  attempted_actions: [{ action_id: u('3c'), type: 'create_access_request' as const, status: 'succeeded' as const }],
  instruction_refs: [{
    document_id: u('0a'), version: 1, title: 'Синтетическая инструкция подключения',
    url: `/api/v2/knowledge/${u('0a')}`,
    excerpt: 'Синтетический фрагмент: для учебной БД нужен sslmode=require.',
  }],
  hypotheses: [{ text: 'Инструкция не требует SSL.', confidence: 'medium' as const }],
  question: 'Как включить SSL для синтетической БД?',
};

const escBase = {
  goal_id: u('1e'), step_id: 'check_connection', blocker_id: u('28'),
  intern: { id: u('01'), display_name: 'Стажёр A' },
  buddy: { id: u('04'), display_name: 'Бадди A' },
  diagnostic_snapshot: snapshot, created_at: T,
};

export const escalations: Escalation[] = [
  { ...escBase, id: u('52'), status: 'open', version: 1 },
  {
    ...escBase, id: u('53'), status: 'resolved', version: 2,
    answer: 'В синтетической инструкции включи sslmode=require и повтори проверку.',
    resolved_at: T2,
  },
];
export const emptyEscalations: Escalation[] = [];

// --- Candidates: все состояния + enrichment ---

const candBase = {
  journey_id: 'db-access-team-a', step_id: 'check_connection',
  error_code: 'DB_SSL_REQUIRED' as const, instruction_refs: [DOC],
  affected_count: 2, hypothesis: 'Инструкция не требует SSL.',
  proposed_fix: 'Добавить sslmode=require в синтетическую инструкцию.',
  version: 1, created_at: T, updated_at: T,
};

export const candidates: Candidate[] = [
  { ...candBase, id: u('3f'), state: 'proposed', enrichment_status: 'completed' },
  { ...candBase, id: u('54'), state: 'proposed', enrichment_status: 'pending' },
  { ...candBase, id: u('55'), state: 'proposed', enrichment_status: 'failed' },
  { ...candBase, id: u('56'), state: 'under_review', enrichment_status: 'completed' },
  { ...candBase, id: u('57'), state: 'accepted', enrichment_status: 'completed' },
  { ...candBase, id: u('58'), state: 'rejected', enrichment_status: 'completed' },
  {
    ...candBase, id: u('59'), state: 'resolved', enrichment_status: 'completed',
    resolved_reference: { document_id: u('0a'), version: 2 },
  },
];
export const emptyCandidates: Candidate[] = [];

// --- Errors: per-code fixtures для FE-видимых кодов ---

const err = (code: ErrorBody['code'], message: string): ErrorBody => ({
  code, message, request_id: u('46'),
});

export const errors: ErrorBody[] = [
  err('VERSION_CONFLICT', 'Объект изменился. Обновите данные и повторите.'),
  err('ACTION_EXPIRED', 'Время подтверждения истекло. Запросите действие заново.'),
  err('ACTION_NOT_PENDING', 'Действие уже завершено или отменено.'),
  err('RUN_ACTIVE', 'В диалоге уже выполняется генерация.'),
  err('RATE_LIMITED', 'Слишком много запросов. Повторите через минуту.'),
  err('UPSTREAM_ERROR', 'Сервис временно недоступен.'),
  err('UPSTREAM_TIMEOUT', 'Срок ответа сервиса истёк.'),
  err('AI_SCHEMA_INVALID', 'Ответ помощника не прошёл проверку. Попробуйте ещё раз.'),
  err('FORBIDDEN', 'Недостаточно прав для этой операции.'),
  err('NOT_FOUND', 'Объект не найден или недоступен.'),
  err('CSRF_INVALID', 'Сессия устарела. Обновите страницу.'),
  err('ROLE_NOT_REQUESTABLE', 'Эту роль нельзя запросить для данного ресурса.'),
  err('TEMPLATE_INVALID', 'Маршрут временно недоступен.'),
  err('UNAUTHENTICATED', 'Требуется вход.'),
  err('VALIDATION_ERROR', 'Проверьте поля'),
];

// --- Пользователи демо ---

export const knowledgeDoc = {
  id: u('0a'),
  title: 'Синтетическая инструкция подключения',
  content:
    'Синтетический учебный текст. Это не регламент Авито.\n\n1. Запросите роль db_reader для db-team-a-test.\n2. Дождитесь согласования.\n3. Проверьте подключение.',
  version: 1,
  synthetic: true as const,
};

// Эскалация, ожидающая подтверждения (для карточки действия на странице шага).
export const escalationPendingAction: Action = {
  id: u('60'),
  type: 'escalate_to_buddy',
  goal_id: u('1e'),
  step_id: 'check_connection',
  parameters: {
    question: 'Как включить SSL для синтетической БД?',
    diagnostic_snapshot: {
      goal: { id: u('1e'), title: 'Доступ к синтетической БД' },
      step: { id: 'check_connection', title: 'Проверить подключение' },
      blocker: { id: u('28'), type: 'db_ssl_required', error_code: 'DB_SSL_REQUIRED' },
      checks: [],
      attempted_actions: [],
      instruction_refs: [],
      hypotheses: [],
      question: 'Как включить SSL для синтетической БД?',
    },
  },
  preview: {
    initiator_id: u('01'),
    recipient_id: u('04'),
    question: 'Как включить SSL для синтетической БД?',
    diagnostic_snapshot: {
      goal: { id: u('1e'), title: 'Доступ к синтетической БД' },
      step: { id: 'check_connection', title: 'Проверить подключение' },
      blocker: { id: u('28'), type: 'db_ssl_required', error_code: 'DB_SSL_REQUIRED' },
      checks: [],
      attempted_actions: [],
      instruction_refs: [],
      hypotheses: [],
      question: 'Как включить SSL для синтетической БД?',
    },
  },
  expires_at: '2026-11-11T09:10:00Z',
  status: 'pending_confirmation',
  created_at: T,
};

export const users: Record<string, User> = {
  'intern-a': {
    id: u('01'), account_id: 'intern-a', display_name: 'Стажёр A', roles: ['intern'],
    team_id: 'team-a',
    assignments: [{ resource_id: 'db-team-a-test', role: 'db_reader' }],
    buddy_id: u('04'),
  },
  'intern-b': {
    id: '10000000-0000-4000-8000-000000000004', account_id: 'intern-b', display_name: 'Стажёр B', roles: ['intern'],
    team_id: 'team-a',
    assignments: [{ resource_id: 'db-team-a-test', role: 'db_reader' }],
    buddy_id: '10000000-0000-4000-8000-000000000001',
  },
  'intern-c': {
    id: '10000000-0000-4000-8000-000000000005', account_id: 'intern-c', display_name: 'Стажёр C', roles: ['intern'],
    team_id: 'team-b',
    assignments: [],
    buddy_id: '10000000-0000-4000-8000-000000000002',
  },
  'buddy-a': {
    id: u('04'), account_id: 'buddy-a', display_name: 'Бадди A', roles: ['buddy'],
    team_id: 'team-a', assignments: [], buddy_id: null,
  },
  'buddy-b': {
    id: '10000000-0000-4000-8000-000000000002', account_id: 'buddy-b', display_name: 'Бадди B', roles: ['buddy'],
    team_id: 'team-b', assignments: [], buddy_id: null,
  },
  'approver-a': {
    id: u('06'), account_id: 'approver-a', display_name: 'Аппрувер A', roles: ['access_approver'],
    team_id: 'team-a',
    assignments: [{ resource_id: 'db-team-a-test', role: 'db_reader' }],
    buddy_id: null,
  },
  'docs-owner-a': {
    id: u('07'), account_id: 'docs-owner-a', display_name: 'Владелец доков A',
    roles: ['documentation_owner'], team_id: 'team-a', assignments: [], buddy_id: null,
  },
};
