import { z } from 'zod';
import { CandidateState, EnrichmentStatus, InstructionRef, PositiveInt, ReviewDecision, SafeErrorCode, Sha256, StableId, State, Timestamp, Uuid } from './common';
import { Progress } from './public';

// Mirror of contracts/v3/public.schema.json (V3-CONTRACT-FE-01).
// Every object is .strict() to match additionalProperties:false.

export const TelegramUrl = z.string().max(64).regex(/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/);

export const PersonRef = z.object({ id: Uuid, display_name: z.string().min(1).max(80) }).strict();
export const InternList = z.object({ items: z.array(PersonRef).max(100) }).strict();

export const MentorContact = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    display_name: z.string().min(1).max(80),
    telegram_url: TelegramUrl,
    contact_revision: PositiveInt,
  }).strict(),
  z.object({ status: z.literal('missing') }).strict(),
]);

const Question = z.string().min(1).max(500);
export const ContactPreviewRequest = z.union([
  z.object({ goal_id: Uuid, step_id: StableId, question: Question.optional() }).strict(),
  z.object({ assignment_id: Uuid, section_id: StableId.optional(), question: Question.optional() }).strict(),
]);
export const ContactPreview = z.object({
  id: Uuid,
  text: z.string().min(1).max(4000),
  content_hash: Sha256,
  contact_revision: PositiveInt,
  telegram_url: TelegramUrl,
  expires_at: Timestamp,
}).strict();
export const ContactExport = z.object({ text: z.string().min(1).max(4000), telegram_url: TelegramUrl }).strict();

export const BriefSection = z.object({
  id: StableId,
  title: z.string().min(1).max(120),
  text: z.string().min(1).max(4000),
}).strict();
export const AcceptanceCriterion = z.object({ id: StableId, text: z.string().min(1).max(1000) }).strict();
export const BriefContent = z.object({
  title: z.string().min(1).max(160),
  goal: z.string().min(1).max(2000),
  sections: z.array(BriefSection).min(1).max(20),
  expected_result: z.string().min(1).max(2000),
  acceptance_criteria: z.array(AcceptanceCriterion).max(20),
  refs: z.array(InstructionRef).max(5),
}).strict();

export const BriefState = z.enum(['draft', 'published', 'archived']);
export const BriefVersionState = z.enum(['draft', 'published']);
export const TaskBriefVersion = z.object({
  brief_id: Uuid,
  version: PositiveInt,
  state: BriefVersionState,
  content: BriefContent,
  content_hash: Sha256,
  created_at: Timestamp,
  published_at: Timestamp.optional(),
}).strict();
export const VersionSummary = z.object({
  version: PositiveInt,
  state: BriefVersionState,
  published_at: Timestamp.optional(),
}).strict();
export const TaskBrief = z.object({
  id: Uuid,
  title: z.string().min(1).max(160),
  state: BriefState,
  latest_published_version: TaskBriefVersion.nullable(),
  draft: TaskBriefVersion.nullable(),
  versions: z.array(VersionSummary).min(1).max(100),
  assignment_count: z.number().int().min(0).max(1000),
  open_report_count: z.number().int().min(0).max(1000),
  revision: PositiveInt,
  created_at: Timestamp,
  updated_at: Timestamp,
}).strict();
export const TaskBriefList = z.object({ items: z.array(TaskBrief).max(100) }).strict();

export const FrictionReason = z.enum(['requirement_unclear', 'outcome_unclear', 'acceptance_unclear']);
export const TaskAssignment = z.object({
  id: Uuid,
  brief_id: Uuid,
  brief_version: PositiveInt,
  brief_state: BriefState,
  latest_published_version: PositiveInt,
  content: BriefContent,
  intern: PersonRef,
  author: PersonRef,
  reported_sections: z.array(z.object({ section_id: StableId, reason: FrictionReason }).strict()).max(100),
  verification: z.literal('not_verified'),
  revision: PositiveInt,
  created_at: Timestamp,
  updated_at: Timestamp,
}).strict();
export const TaskAssignmentList = z.object({ items: z.array(TaskAssignment).max(100) }).strict();
export const FrictionReceipt = z.object({
  status: z.enum(['recorded', 'already_recorded']),
  assignment_id: Uuid,
  brief_version: PositiveInt,
  section_id: StableId,
  reason: FrictionReason,
}).strict();

export const TaskClarityReport = z.object({
  id: Uuid,
  brief_id: Uuid,
  brief_title: z.string().min(1).max(160),
  brief_version: PositiveInt,
  latest_published_version: PositiveInt,
  section_id: StableId,
  section_title: z.string().min(1).max(120),
  reason: FrictionReason,
  state: CandidateState,
  current_count: z.number().int().min(0).max(100),
  lifetime_count: z.number().int().min(2).max(100),
  last_seen_at: Timestamp,
  hypothesis: z.string().min(1).max(2000),
  suggestion: z.string().min(1).max(2000),
  enrichment_status: EnrichmentStatus,
  resolved_version: PositiveInt.optional(),
  version: PositiveInt,
  created_at: Timestamp,
  updated_at: Timestamp,
}).strict();
export const TaskClarityReportList = z.object({ items: z.array(TaskClarityReport).max(100) }).strict();
export const TaskClarityReviewRequest = z.object({
  decision: ReviewDecision,
  reason: z.string().min(1).max(1000),
  expected_version: PositiveInt,
  resolved_version: PositiveInt.optional(),
}).strict();

export const GoalSummary = z.object({
  id: Uuid,
  title: z.string().min(1).max(160),
  journey_id: StableId,
  journey_version: PositiveInt,
  status: State,
  version: PositiveInt,
  progress: Progress,
  step_count: z.number().int().min(0).max(100),
  updated_at: Timestamp,
}).strict();
const Cursor = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
export const GoalSummaryList = z.object({ items: z.array(GoalSummary).max(20), next_cursor: Cursor.nullable() }).strict();

const Count = z.number().int().min(0).max(100000).nullable();
export const StatisticsMetrics = z.object({
  affected_interns: Count,
  observations: Count,
  open_items: Count,
  suppressed: z.boolean(),
}).strict();
export const StatisticsRow = z.object({
  key: z.object({
    journey_id: StableId.optional(),
    step_id: StableId.optional(),
    error_code: SafeErrorCode.optional(),
    brief_id: Uuid.optional(),
    brief_version: PositiveInt.optional(),
    section_id: StableId.optional(),
    reason: FrictionReason.optional(),
    document_id: Uuid.optional(),
    document_version: PositiveInt.optional(),
  }).strict(),
  label: z.string().min(1).max(300),
  metrics: StatisticsMetrics,
  related_reports: z.array(z.object({
    id: Uuid,
    kind: z.enum(['knowledge_gap_candidate', 'task_clarity_report']),
    state: CandidateState,
  }).strict()).max(10),
}).strict();
export const DailyBucket = z.object({
  date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  affected_interns: Count,
  observations: Count,
  suppressed: z.boolean(),
}).strict();
export const Statistics = z.object({
  view: z.enum(['mentor', 'documentation']),
  source_kind: z.enum(['technical', 'task_clarity']),
  as_of: Timestamp,
  timezone: z.literal('Europe/Moscow'),
  window: z.object({ from: Timestamp, to: Timestamp, days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }).strict(),
  privacy_threshold: z.literal(2),
  summary: StatisticsMetrics,
  rows: z.array(StatisticsRow).max(50),
  daily: z.array(DailyBucket).max(90),
  next_cursor: Cursor.nullable(),
}).strict();

export const ResponseOrigin = z.object({
  mode: z.enum(['live', 'mock', 'unknown']),
  answered_by: z.enum(['primary', 'secondary', 'offline', 'unknown']),
  completion: z.enum(['complete', 'interrupted']),
  reason_code: z.enum(['config_mock', 'cooldown', 'timeout', 'model_unavailable', 'budget_denied']).optional(),
}).strict();
export const MessageOriginData = z.object({ run_id: Uuid, message_id: Uuid, origin: ResponseOrigin }).strict();
export const MessageOriginList = z.object({ items: z.array(MessageOriginData).max(100) }).strict();
