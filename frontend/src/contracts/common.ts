import { z } from 'zod';

// Mirror of contracts/v2/common.schema.json (draft consumer bindings, RP-CONTRACT-FE-01).
// Every object is .strict() to match additionalProperties:false.

export const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const StableId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const PositiveInt = z.number().int().min(1).max(1000000);
export const Timestamp = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/);
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const State = z.enum(['unverified', 'ready', 'blocked', 'waiting_external', 'verified']);
export const Role = z.enum(['intern', 'buddy', 'access_approver', 'documentation_owner']);
export const Permission = z.enum([
  'resource.view',
  'access.request',
  'access.check',
  'access.approve',
  'db.check',
  'knowledge.read',
  'knowledge_gap.review',
]);
export const RequestedRole = z.enum(['db_reader']);
export const ErrorCode = z.enum([
  'INVALID_JSON',
  'INVALID_REQUEST_ID',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_INVALID',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RUN_ACTIVE',
  'RUN_ALREADY_STARTED',
  'ACTION_NOT_PENDING',
  'ACTION_EXPIRED',
  'VALIDATION_ERROR',
  'TEMPLATE_INVALID',
  'ROLE_NOT_REQUESTABLE',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'AI_SCHEMA_INVALID',
  'UPSTREAM_TIMEOUT',
  'TOOL_VALIDATION_ERROR',
  'LLM_TIMEOUT',
  'LLM_UNAVAILABLE',
  'STREAM_NOT_OPENED',
]);
export const SafeErrorCode = z.enum([
  'ACCESS_MISSING',
  'ACCESS_DENIED',
  'DB_SSL_REQUIRED',
  'CHECK_UNAVAILABLE',
]);
export const CheckStatus = z.enum(['queued', 'running', 'passed', 'failed', 'unavailable']);
export const RunStatus = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);
export const MessageRole = z.enum(['user', 'assistant']);
export const MessageStatus = z.enum(['completed', 'failed', 'cancelled', 'interrupted']);
export const ActionStatus = z.enum([
  'pending_confirmation',
  'executing',
  'succeeded',
  'failed',
  'unknown',
  'cancelled',
  'expired',
]);
export const ActionType = z.enum(['create_access_request', 'escalate_to_buddy']);
export const VerificationMethod = z.enum([
  'resource_policy_match',
  'iam_permission_present',
  'mock_db_connection',
]);
export const SslMode = z.enum(['disable', 'require']);
export const GrantState = z.enum(['absent', 'pending', 'present', 'unknown']);
export const SyncStatus = z.enum(['ok', 'unavailable']);
export const AccessRequestStatus = z.enum(['submitted', 'approved', 'rejected']);
export const BlockerStatus = z.enum(['open', 'resolved']);
export const BlockerType = z.enum([
  'access_missing',
  'access_denied',
  'db_ssl_required',
  'check_unavailable',
]);
export const RecoveryAction = z.enum(['retry_check', 'create_access_request', 'escalate_to_buddy']);
export const CandidateState = z.enum([
  'proposed',
  'under_review',
  'accepted',
  'rejected',
  'resolved',
]);
export const EnrichmentStatus = z.enum(['pending', 'failed', 'completed']);
export const EscalationStatus = z.enum(['open', 'resolved']);
export const Confidence = z.enum(['low', 'medium', 'high']);
export const EventSource = z.enum([
  'go_policy',
  'mock_iam_adapter',
  'mock_access_adapter',
  'mock_db_adapter',
  'go_buddy_workflow',
  'go_friction_pipeline',
  'go_knowledge_gap_review',
]);
export const EventType = z.enum([
  'resource_policy_matched',
  'resource_access_checked',
  'access_request_created',
  'access_request_approved',
  'access_request_rejected',
  'resource_access_granted',
  'db_connection_check_passed',
  'db_connection_check_failed',
  'blocker_detected',
  'buddy_escalated',
  'buddy_resolved',
  'knowledge_gap_candidate_created',
  'knowledge_gap_reviewed',
]);
export const RejectReasonCode = z.enum(['NOT_REQUESTABLE', 'OUT_OF_SCOPE']);
export const ReviewDecision = z.enum(['under_review', 'accepted', 'rejected', 'resolved']);

// Type aliases (value + type declaration merging).
export type State = z.infer<typeof State>;
export type Role = z.infer<typeof Role>;
export type Permission = z.infer<typeof Permission>;
export type RequestedRole = z.infer<typeof RequestedRole>;
export type ErrorCode = z.infer<typeof ErrorCode>;
export type SafeErrorCode = z.infer<typeof SafeErrorCode>;
export type CheckStatus = z.infer<typeof CheckStatus>;
export type RunStatus = z.infer<typeof RunStatus>;
export type MessageRole = z.infer<typeof MessageRole>;
export type MessageStatus = z.infer<typeof MessageStatus>;
export type ActionStatus = z.infer<typeof ActionStatus>;
export type ActionType = z.infer<typeof ActionType>;
export type VerificationMethod = z.infer<typeof VerificationMethod>;
export type SslMode = z.infer<typeof SslMode>;
export type GrantState = z.infer<typeof GrantState>;
export type SyncStatus = z.infer<typeof SyncStatus>;
export type AccessRequestStatus = z.infer<typeof AccessRequestStatus>;
export type BlockerStatus = z.infer<typeof BlockerStatus>;
export type BlockerType = z.infer<typeof BlockerType>;
export type RecoveryAction = z.infer<typeof RecoveryAction>;
export type CandidateState = z.infer<typeof CandidateState>;
export type EnrichmentStatus = z.infer<typeof EnrichmentStatus>;
export type EscalationStatus = z.infer<typeof EscalationStatus>;
export type Confidence = z.infer<typeof Confidence>;
export type EventSource = z.infer<typeof EventSource>;
export type EventType = z.infer<typeof EventType>;
export type RejectReasonCode = z.infer<typeof RejectReasonCode>;
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const ErrorBody = z
  .object({
    code: ErrorCode,
    message: z.string().min(1).max(500),
    request_id: Uuid,
    fields: z
      .array(
        z
          .object({
            name: StableId,
            code: z.string().min(1).max(64),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

export const Error = z.object({ error: ErrorBody }).strict();

export const ResourcePermission = z
  .object({
    resource_id: StableId,
    permissions: z.array(Permission).min(1).max(8),
  })
  .strict();

export const DocumentPermission = z
  .object({
    document_id: Uuid,
    permissions: z.array(Permission).min(1).max(8),
  })
  .strict();

export const AccessScope = z
  .object({
    subject_id: Uuid,
    team_ids: z.array(StableId).min(1).max(8),
    resource_permissions: z.array(ResourcePermission).max(20),
    document_permissions: z.array(DocumentPermission).max(50),
    policy_revision: z.string().regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict();

export const InstructionRef = z
  .object({
    document_id: Uuid,
    version: PositiveInt,
  })
  .strict();

export const Source = z
  .object({
    document_id: Uuid,
    version: PositiveInt,
    title: z.string().min(1).max(200),
    url: z
      .string()
      .regex(/^\/api\/v2\/knowledge\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    excerpt: z.string().min(1).max(500),
  })
  .strict();

export const Hypothesis = z
  .object({
    text: z.string().min(1).max(2000),
    confidence: Confidence,
  })
  .strict();

export const SafeCheck = z
  .object({
    id: Uuid,
    goal_id: Uuid,
    step_id: StableId,
    method: VerificationMethod,
    status: CheckStatus,
    error_code: SafeErrorCode.optional(),
    observed_at: Timestamp.optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const fail = (path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `check.${path}`, path: [path] });
    if (c.status === 'failed' || c.status === 'unavailable') {
      if (!c.error_code) fail('error_code');
      if (!c.observed_at) fail('observed_at');
    }
    if (c.status === 'passed') {
      if (!c.observed_at) fail('observed_at');
      if (c.error_code) fail('error_code');
    }
    if (c.status === 'running' && c.error_code) fail('error_code');
    if (c.status === 'queued') {
      if (c.error_code) fail('error_code');
      if (c.observed_at) fail('observed_at');
    }
  });

export const AttemptedAction = z
  .object({
    action_id: Uuid,
    type: ActionType,
    status: ActionStatus,
  })
  .strict();

export const DiagnosticSnapshot = z
  .object({
    goal: z.object({ id: Uuid, title: z.string().min(1).max(200) }).strict(),
    step: z.object({ id: StableId, title: z.string().min(1).max(200) }).strict(),
    blocker: z
      .object({ id: Uuid, type: BlockerType, error_code: SafeErrorCode })
      .strict(),
    checks: z.array(SafeCheck).max(20),
    attempted_actions: z.array(AttemptedAction).max(5),
    instruction_refs: z.array(Source).max(5),
    hypotheses: z.array(Hypothesis).max(5),
    question: z.string().min(1).max(4000),
  })
  .strict();
