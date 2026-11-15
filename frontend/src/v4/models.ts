import { z } from 'zod';
// FE presentation models, NOT an accepted public API. BE/AI schemas must pass G1 before wiring.
const Id = z.string().min(1).max(100);
const Text = z.string().max(4000);
export const WorkspaceModel = z.object({
  id: Id, title: Text, briefVersion: z.number().int().positive().nullable(),
  state: z.enum(['unverified','ready','blocked','verified','unavailable']),
  progress: z.number().int().min(0).max(100), blocker: Text.nullable(),
  steps: z.array(z.object({id: Id, title: Text, state: Text}).strict()).max(100),
  nextAction: z.object({label: Text, href: z.string().regex(/^#\/(onboarding|tasks)\/[A-Za-z0-9_/-]+$/)}).strict().nullable(),
}).strict();
export type Workspace = z.infer<typeof WorkspaceModel>;
export const TimelineModel = z.object({
  currentState: Text, asOf: z.iso.datetime(), historyComplete: z.boolean(),
  entries: z.array(z.object({id: Id, label: Text, observedAt: z.iso.datetime(),
    source: z.enum(['workflow','approver','iam','check','user','ai']),
    validity: z.enum(['valid','invalidated','unknown']), trusted: z.boolean(),
  }).strict()).max(50),
}).strict().refine(v => new Set(v.entries.map(e=>e.id)).size === v.entries.length, 'Duplicate event');
export type Timeline = z.infer<typeof TimelineModel>;
const Cell = z.object({version:z.number().int().positive(), eligible:z.number().int().min(5).nullable(),affected:z.number().int().nonnegative().nullable(),rate:z.number().min(0).max(1).nullable(),suppressed:z.boolean()}).strict().refine(c => c.suppressed ? c.eligible===null&&c.affected===null&&c.rate===null : c.eligible!==null&&c.affected!==null&&c.affected<=c.eligible&&c.rate!==null);
export const ImpactModel = z.object({status:z.enum(['collecting','available','insufficient_data','not_comparable']),synthetic:z.boolean(),asOf:z.iso.datetime(),policyRevision:Id,windowDays:z.literal(7),before:Cell.nullable(),after:Cell.nullable(),deltaPp:z.number().min(-100).max(100).nullable(),limitations:z.array(Text).max(10)}).strict().refine(v => (v.status==='available'&&v.before&&!v.before.suppressed&&v.after&&!v.after.suppressed) || v.deltaPp===null, 'Hidden difference');
export type Impact = z.infer<typeof ImpactModel>;
export const ProposalModel = z.object({id:Id,revision:z.number().int().positive(),baseVersion:z.number().int().positive(),draftRevision:z.number().int().positive().nullable(),expiresAt:z.iso.datetime(),origin:z.enum(['primary','secondary','offline','unknown']),status:z.enum(['generating','ready','needs_input','unavailable','expired','applied_to_draft','discarded']),reportTitle:Text,questions:z.array(Text).max(10),changes:z.array(z.object({id:Id,label:Text,before:Text,after:Text,rationale:Text}).strict()).max(10)}).strict().refine(v=>new Set(v.changes.map(c=>c.id)).size===v.changes.length);
export type Proposal = z.infer<typeof ProposalModel>;
export type ApplySelection = {proposalId:string;proposalRevision:number;expectedDraftRevision:number|null;selectedChangeIds:string[]};
