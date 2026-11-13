import { describe, expect, it } from 'vitest';
import * as pub from '../contracts/public';
import * as common from '../contracts/common';
import * as fx from './all-states';

// Каждая FE-локальная fixture обязана проходить контрактную zod-схему v2.

describe('draft all-states fixtures conform to v2 schemas', () => {
  it.each(fx.goals.map((g) => [g.status, g] as const))('Goal/%s', (_s, g) => {
    expect(pub.Goal.safeParse(g).success).toBe(true);
  });

  it.each(fx.checks.map((c) => [c.status, c] as const))('Check/%s', (_s, c) => {
    expect(pub.Check.safeParse(c).success).toBe(true);
  });

  it.each(fx.actions.map((a) => [a.status, a] as const))('Action/%s', (_s, a) => {
    expect(pub.Action.safeParse(a).success).toBe(true);
  });

  it.each(fx.accessRequests.map((r) => [`${r.status}/${r.grant_state}/${r.sync_status}`, r] as const))(
    'AccessRequest/%s',
    (_s, r) => {
      expect(pub.AccessRequest.safeParse(r).success).toBe(true);
    },
  );

  it.each(fx.escalations.map((e) => [e.status, e] as const))('Escalation/%s', (_s, e) => {
    expect(pub.Escalation.safeParse(e).success).toBe(true);
  });

  it.each(fx.candidates.map((c) => [`${c.state}/${c.enrichment_status}`, c] as const))(
    'Candidate/%s',
    (_s, c) => {
      expect(pub.Candidate.safeParse(c).success).toBe(true);
    },
  );

  it.each(fx.errors.map((e) => [e.code, e] as const))('ErrorBody/%s', (_s, e) => {
    expect(common.ErrorBody.safeParse(e).success).toBe(true);
  });

  it('ResourceAccess variants', () => {
    expect(pub.ResourceAccess.safeParse(fx.resourceAccessFresh).success).toBe(true);
    expect(pub.ResourceAccess.safeParse(fx.resourceAccessStale).success).toBe(true);
  });

  it('Users', () => {
    for (const user of Object.values(fx.users)) {
      expect(pub.User.safeParse(user).success).toBe(true);
    }
  });

  it('KnowledgeDocument and pending escalation action', () => {
    expect(pub.KnowledgeDocument.safeParse(fx.knowledgeDoc).success).toBe(true);
    expect(pub.Action.safeParse(fx.escalationPendingAction).success).toBe(true);
  });

  it('empty lists are valid payloads', () => {
    expect(pub.GoalList.safeParse({ items: fx.emptyGoals }).success).toBe(true);
    expect(pub.AccessRequestList.safeParse({ items: fx.emptyAccessRequests }).success).toBe(true);
    expect(pub.EscalationList.safeParse({ items: fx.emptyEscalations }).success).toBe(true);
    expect(pub.CandidateList.safeParse({ items: fx.emptyCandidates }).success).toBe(true);
  });
});
