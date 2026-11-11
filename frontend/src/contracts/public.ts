import { z } from 'zod';
import {
  ActionStatus,
  ActionType,
  AccessRequestStatus,
  BlockerStatus,
  BlockerType,
  CandidateState,
  DiagnosticSnapshot,
  EnrichmentStatus,
  ErrorCode,
  EscalationStatus,
  EventSource,
  GrantState,
  InstructionRef,
  MessageRole,
  MessageStatus,
  Permission,
  PositiveInt,
  RecoveryAction,
  RequestedRole,
  ReviewDecision,
  Role,
  RunStatus,
  SafeErrorCode,
  Source,
  SslMode,
  StableId,
  State,
  SyncStatus,
  Timestamp,
  Uuid,
  VerificationMethod,
  CheckStatus,
} from './common';

// Mirror of contracts/v2/public.schema.json (draft consumer bindings, RP-CONTRACT-FE-01).

export const Assignment = z
  .object({
    resource_id: StableId,
    role: RequestedRole,
  })
  .strict();

export const User = z
  .object({
    id: Uuid,
    account_id: StableId,
    display_name: z.string().min(1).max(80),
    roles: z.array(Role).min(1).max(4),
    team_id: StableId,
    assignments: z.array(Assignment).max(8),
    buddy_id: Uuid.nullable(),
  })
  .strict();

export const DemoLoginRequest = z.object({ account_id: StableId }).strict();

export const AuthSession = z
  .object({
    user: User,
    csrf_token: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export const JourneySummary = z
  .object({
    journey_id: StableId,
    version: PositiveInt,
    title: z.string().min(1).max(200),
    resource_id: StableId,
  })
  .strict();

export const JourneyList = z
  .object({ items: z.array(JourneySummary).max(100) })
  .strict();

export const GoalCreateRequest = z
  .object({
    journey_id: StableId,
    journey_version: PositiveInt,
  })
  .strict();

export const Progress = z
  .object({
    verified: z.number().int().min(0).max(100),
    total: z.number().int().min(0).max(100),
    percent: z.number().int().min(0).max(100),
  })
  .strict();

export const Evidence = z
  .object({
    id: Uuid,
    check_id: Uuid,
    event_id: Uuid,
    source: EventSource,
    method: VerificationMethod,
    result: z.enum(['passed', 'failed', 'absent']),
    observed_at: Timestamp,
    invalidated_at: Timestamp.optional(),
    synthetic: z.literal(true),
  })
  .strict();

export const Blocker = z
  .object({
    id: Uuid,
    type: BlockerType,
    error_code: SafeErrorCode,
    status: BlockerStatus,
    latest_check_id: Uuid,
    recovery_actions: z.array(RecoveryAction).min(1).max(3),
  })
  .strict();

export const Step = z
  .object({
    id: StableId,
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    dependencies: z
      .array(
        z
          .object({
            step_id: StableId,
            condition: z.literal('verified'),
          })
          .strict(),
      )
      .max(10),
    required_permissions: z.array(Permission).min(1).max(8),
    instruction_reference: InstructionRef,
    available_actions: z.array(RecoveryAction).max(3),
    verification_method: VerificationMethod,
    status: State,
    version: PositiveInt,
    evidence: z.array(Evidence).max(20),
    blockers: z.array(Blocker).max(10),
    user_claim: z.string().min(1).max(500).optional(),
  })
  .strict();

export const Goal = z
  .object({
    id: Uuid,
    journey_id: StableId,
    journey_version: PositiveInt,
    resource_id: StableId,
    status: State,
    version: PositiveInt,
    steps: z.array(Step).length(3),
    progress: Progress,
    updated_at: Timestamp,
  })
  .strict();

export const GoalList = z.object({ items: z.array(Goal).max(100) }).strict();

const EmptyOptions = z.object({}).strict();
const DbOptions = z.object({ ssl_mode: SslMode }).strict();

export const CheckCreateRequest = z
  .object({
    method: VerificationMethod,
    options: z.unknown(),
    expected_version: PositiveInt,
  })
  .strict()
  .superRefine((r, ctx) => {
    const opts = r.method === 'mock_db_connection' ? DbOptions : EmptyOptions;
    const parsed = opts.safeParse(r.options);
    if (!parsed.success) {
      parsed.error.issues.forEach((i) =>
        ctx.addIssue({ ...i, path: ['options', ...i.path] }),
      );
    }
  });

export const Check = z
  .object({
    id: Uuid,
    goal_id: Uuid,
    step_id: StableId,
    method: VerificationMethod,
    status: CheckStatus,
    error_code: SafeErrorCode.optional(),
    evidence_ids: z.array(Uuid).max(20),
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

export const ResourceSummary = z
  .object({
    resource_id: StableId,
    title: z.string().min(1).max(200),
    requestable_roles: z.array(RequestedRole).max(4),
    synthetic: z.literal(true),
  })
  .strict();

export const ResourceList = z
  .object({ items: z.array(ResourceSummary).max(100) })
  .strict();

export const ResourceAccess = z
  .object({
    grant_state: GrantState,
    observed_at: Timestamp,
    stale: z.boolean(),
  })
  .strict();

export const KnowledgeDocument = z
  .object({
    id: Uuid,
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(20000),
    version: PositiveInt,
    synthetic: z.literal(true),
  })
  .strict();

function checkGoalStepPair(v: { goal_id: unknown; step_id: unknown }, ctx: z.RefinementCtx) {
  const bothNull = v.goal_id === null && v.step_id === null;
  const bothSet = v.goal_id !== null && v.step_id !== null;
  if (!bothNull && !bothSet) {
    ctx.addIssue({
      code: 'custom',
      message: 'goal_id and step_id must be both null or both set',
    });
  }
}

export const ConversationCreateRequest = z
  .object({
    goal_id: Uuid.nullable(),
    step_id: StableId.nullable(),
  })
  .strict()
  .superRefine(checkGoalStepPair);

export const Conversation = z
  .object({
    id: Uuid,
    goal_id: Uuid.nullable(),
    step_id: StableId.nullable(),
    created_at: Timestamp,
  })
  .strict()
  .superRefine(checkGoalStepPair);

export const ConversationList = z
  .object({ items: z.array(Conversation).max(100) })
  .strict();

export const Message = z
  .object({
    id: Uuid,
    conversation_id: Uuid,
    role: MessageRole,
    content: z.string().min(1).max(4000),
    status: MessageStatus,
    run_id: Uuid.optional(),
    sources: z.array(Source).max(5),
    created_at: Timestamp,
  })
  .strict();

export const MessageList = z.object({ items: z.array(Message).max(100) }).strict();

export const RunCreateRequest = z.union([
  z.object({ content: z.string().min(1).max(4000) }).strict(),
  z.object({ retry_of: Uuid }).strict(),
]);

export const Run = z
  .object({
    id: Uuid,
    conversation_id: Uuid,
    user_message_id: Uuid,
    assistant_message_id: Uuid.optional(),
    status: RunStatus,
    error_code: ErrorCode.optional(),
    action_ids: z.array(Uuid).max(1),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.status === 'failed' && !r.error_code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'run.error_code', path: ['error_code'] });
    }
    if (['queued', 'running', 'completed'].includes(r.status) && r.error_code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'run.error_code', path: ['error_code'] });
    }
  });

export const RunStartedData = z.object({ run_id: Uuid }).strict();
export const MessageDeltaData = z
  .object({ run_id: Uuid, text: z.string().min(1).max(4000) })
  .strict();
export const MessageSourcesData = z
  .object({ run_id: Uuid, sources: z.array(Source).max(5) })
  .strict();
export const RunCompletedData = z.object({ run_id: Uuid, message_id: Uuid }).strict();
export const RunFailedData = z
  .object({ run_id: Uuid, code: ErrorCode, message: z.string().min(1).max(500) })
  .strict();
export const RunCancelledData = z.object({ run_id: Uuid }).strict();

export const AccessRequestParameters = z
  .object({
    resource_id: StableId,
    requested_role: RequestedRole,
    reason: z.string().min(1).max(1000),
    additional_fields: z.object({}).strict(),
  })
  .strict();

export const EscalationParameters = z
  .object({
    question: z.string().min(1).max(4000),
    diagnostic_snapshot: DiagnosticSnapshot,
  })
  .strict();

export const ActionDraft = z
  .object({
    conversation_id: Uuid,
    goal_id: Uuid,
    step_id: StableId,
    type: ActionType,
    parameters: z.unknown(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const p = d.type === 'create_access_request' ? AccessRequestParameters : EscalationParameters;
    const parsed = p.safeParse(d.parameters);
    if (!parsed.success) {
      parsed.error.issues.forEach((i) =>
        ctx.addIssue({ ...i, path: ['parameters', ...i.path] }),
      );
    }
  });

export const AccessRequestPreview = z
  .object({
    initiator_id: Uuid,
    resource_id: StableId,
    requested_role: RequestedRole,
    reason: z.string().min(1).max(1000),
    recipient_id: Uuid,
  })
  .strict();

export const EscalationPreview = z
  .object({
    initiator_id: Uuid,
    recipient_id: Uuid,
    question: z.string().min(1).max(4000),
    diagnostic_snapshot: DiagnosticSnapshot,
  })
  .strict();

const AccessResult = z.object({ access_request_id: Uuid }).strict();
const EscalationResult = z.object({ escalation_id: Uuid }).strict();

export const Action = z
  .object({
    id: Uuid,
    type: ActionType,
    goal_id: Uuid,
    step_id: StableId,
    parameters: z.unknown(),
    preview: z.unknown(),
    expires_at: Timestamp,
    status: ActionStatus,
    result: z.unknown().optional(),
    error_code: ErrorCode.optional(),
    created_at: Timestamp,
  })
  .strict()
  .superRefine((a, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
    const params = a.type === 'create_access_request' ? AccessRequestParameters : EscalationParameters;
    const prev = a.type === 'create_access_request' ? AccessRequestPreview : EscalationPreview;
    const res = a.type === 'create_access_request' ? AccessResult : EscalationResult;
    [(['parameters', params] as const), (['preview', prev] as const)].forEach(([path, schema]) => {
      const parsed = schema.safeParse(a[path as 'parameters']);
      if (!parsed.success) {
        parsed.error.issues.forEach((i) =>
          ctx.addIssue({ ...i, path: [path, ...i.path] }),
        );
      }
    });
    const noResultStates: ActionStatus[] = ['pending_confirmation', 'executing', 'cancelled', 'expired'];
    if (noResultStates.includes(a.status)) {
      if (a.result !== undefined) add(['result'], 'action.result must be absent');
      if (a.error_code !== undefined) add(['error_code'], 'action.error_code must be absent');
    }
    if (a.status === 'succeeded') {
      if (a.result === undefined) add(['result'], 'action.result required');
      else {
        const parsed = res.safeParse(a.result);
        if (!parsed.success) {
          parsed.error.issues.forEach((i) => ctx.addIssue({ ...i, path: ['result', ...i.path] }));
        }
      }
      if (a.error_code !== undefined) add(['error_code'], 'action.error_code must be absent');
    }
    if (a.status === 'failed' || a.status === 'unknown') {
      if (!a.error_code) add(['error_code'], 'action.error_code required');
      if (a.result !== undefined) add(['result'], 'action.result must be absent');
    }
  });

export const ActionProposedData = z.object({ run_id: Uuid, action: Action }).strict();

export const EmptyBody = z.object({}).strict();

export const AccessRequest = z
  .object({
    id: Uuid,
    goal_id: Uuid,
    step_id: StableId,
    resource_id: StableId,
    requested_role: RequestedRole,
    reason: z.string().min(1).max(1000),
    mock_id: Uuid,
    status: AccessRequestStatus,
    grant_state: GrantState,
    sync_status: SyncStatus,
    version: PositiveInt,
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .strict();

export const AccessRequestList = z
  .object({ items: z.array(AccessRequest).max(100) })
  .strict();

export const AccessDecisionRequest = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().min(1).max(1000),
    expected_version: PositiveInt,
  })
  .strict();

export const PersonRef = z
  .object({
    id: Uuid,
    display_name: z.string().min(1).max(80),
  })
  .strict();

export const Escalation = z
  .object({
    id: Uuid,
    goal_id: Uuid,
    step_id: StableId,
    blocker_id: Uuid,
    intern: PersonRef,
    buddy: PersonRef,
    diagnostic_snapshot: DiagnosticSnapshot,
    status: EscalationStatus,
    answer: z.string().min(1).max(4000).optional(),
    version: PositiveInt,
    created_at: Timestamp,
    resolved_at: Timestamp.optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.status === 'resolved') {
      if (!e.answer) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answer required', path: ['answer'] });
      if (!e.resolved_at)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'resolved_at required', path: ['resolved_at'] });
    }
    if (e.status === 'open') {
      if (e.answer !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answer must be absent', path: ['answer'] });
      if (e.resolved_at !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'resolved_at must be absent', path: ['resolved_at'] });
    }
  });

export const EscalationList = z
  .object({ items: z.array(Escalation).max(100) })
  .strict();

export const EscalationReplyRequest = z
  .object({
    answer: z.string().min(1).max(4000),
    expected_version: PositiveInt,
  })
  .strict();

export const FrictionAggregate = z
  .object({
    journey_id: StableId,
    step_id: StableId,
    error_code: SafeErrorCode,
    affected_count: z.number().int().min(2).max(100),
    instruction_refs: z.array(InstructionRef).min(1).max(5),
  })
  .strict();

export const FrictionAggregateList = z
  .object({ items: z.array(FrictionAggregate).max(100) })
  .strict();

export const Candidate = z
  .object({
    id: Uuid,
    journey_id: StableId,
    step_id: StableId,
    error_code: SafeErrorCode,
    instruction_refs: z.array(InstructionRef).min(1).max(5),
    affected_count: z.number().int().min(2).max(100),
    hypothesis: z.string().min(1).max(2000),
    proposed_fix: z.string().min(1).max(2000),
    state: CandidateState,
    enrichment_status: EnrichmentStatus,
    version: PositiveInt,
    resolved_reference: InstructionRef.optional(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.state === 'resolved' && !c.resolved_reference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved_reference required',
        path: ['resolved_reference'],
      });
    }
    if (c.state !== 'resolved' && c.resolved_reference !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved_reference must be absent',
        path: ['resolved_reference'],
      });
    }
  });

export const CandidateList = z
  .object({ items: z.array(Candidate).max(100) })
  .strict();

export const CandidateReviewRequest = z
  .object({
    decision: ReviewDecision,
    reason: z.string().min(1).max(1000),
    expected_version: PositiveInt,
    resolved_reference: InstructionRef.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.decision === 'resolved' && !r.resolved_reference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved_reference required',
        path: ['resolved_reference'],
      });
    }
    if (r.decision !== 'resolved' && r.resolved_reference !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'resolved_reference must be absent',
        path: ['resolved_reference'],
      });
    }
  });
