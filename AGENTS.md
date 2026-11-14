# Instructions for project agents

## Git work contracts

Work on project files locally. You may create local Git commits. Do not list Codex as a co-author or add a `Co-authored-by` trailer that credits Codex.

Do not push to any remote, including feature branches and forks. Do not open or merge pull requests, invite collaborators, or change repository permissions. The repository owner handles publishing and access management.

## Current assignment · local v4 integration · 2026-11-14

The owner's latest assignment authorizes reviewing and fixing BE/AI integration as well
as FE/TL, followed by Docker startup and a jury-defense test guide. Work locally on
feature/tl-v4; read other branches, preserve their source history. No push/PR/remote merge.
Independent component line coverage must be >=82%, without changing denominators.
Read docs/v4 and its five SDD triples. Latest status:
docs/v4/integration-review-2026-11-14.md; root manual: DEFENSE_V4.md.
BE/AI v4 runtime is now merged locally and wired to FE; /v4-preview remains a separately
marked prototype. Keep v3 functional and preserve existing data. Do not treat this
integration as full G1/G4 acceptance: the events schema/contract lock, test-clock cohort
harness, cold CI/race and actual-live gates remain open. Paid/live acceptance stays
OPEN under the owner's existing offline decision.

## Product direction

The scope is Engineering Onboarding & Feedback Loop, based on `CODEX_PROJECT_REPLAN.md`
and `docs/product/specification.md`. P0 is one approved DB-access journey: Goal → permitted
action → trusted verification → blocker/diagnostics → buddy → repeated friction →
human-reviewed Knowledge Gap Candidate. RAG and terminology are supporting capabilities.
Intern, buddy, scoped access approver and documentation owner are P0; HR remains outside MVP.
Never replace the required feedback loop, verification or authorization with chat fixtures.

## UI Design Reference

The main UI reference is `docs/design/ui-reference.png`.
Before implementing frontend features, inspect it and read `docs/design/UI_GUIDELINES.md`.
Preserve its layout language, colors, typography, spacing and component styling across
all roles. The information hierarchy is goal → step state → blocker → next action →
evidence/contextual AI. The reference is visual, not an exact functional specification.

## Before starting

1. Read `README.md` and `docs/product/specification.md` for actual status and target scope.
2. Read `ARCHITECTURE.md`, `docs/architecture/decisions.md` and `docs/team/working-agreements.md`.
3. Read your handoff in `docs/team/assignments/` and the actual/proposed branch inventory
   in `docs/team/branches.md`. Find your task in `docs/team/backlog.md`; check dependencies, owner and allowed
   directories. Read its `spec.md`, `design.md`, `tasks.md` via `docs/features/README.md`.
   Legacy `onboarding` and `chat` are superseded pointers, not additional requirements.
4. Inspect `git status` and existing code in your assigned area before editing.
5. For replanning, read the complete `CODEX_PROJECT_REPLAN.md` and `docs/team/replan-audit.md`.

Read additional references when relevant:
- API/chat/actions: `docs/architecture/api-contracts.md`, `event-contracts.md`, `contracts/README.md`,
  `docs/architecture/security.md`, `state-machines.md`. Executable v1 contracts are legacy;
  target v2 requires actual schemas/examples/tests and consumer acceptance before implementation.
  Read `docs/architecture/contract-baseline.md` (TL design ready) and
  `docs/team/contract-handoff.md` (BE/AI/FE work and final review pending).
- Journeys/evidence: `docs/architecture/journey-template.md`, `state-machines.md`, `event-contracts.md`.
- Database: `docs/architecture/data-model.md` and component migrations; new SQL migrations only.
- AI/RAG: `docs/architecture/ai-design.md`, `security.md`, `data/knowledge/` including evals;
  current data is legacy, not the new seed. Python owns the logical knowledge area in physical `kb`.
- Frontend: UI reference and guidelines above.
- Environment/CI: `docs/operations/development.md`, `compose.yaml`, `.github/workflows/`.

## Development contract

- Work only on the assigned task/directories; preserve owner and other agents' changes.
- Developer ownership: Backend builds Go plus the separate corporate mock; AI owns AI/kb;
  Frontend owns UI and browser E2E; TL owns common tooling/infra/integration. Fullstack has
  only RP-QA-01 (the two existing API tests and their plan), not mocks/infra/all testing.
  Respect the file exceptions and reviewers in working-agreements.md.
- React calls only Go. Go owns all app state/transitions/actions and trusted event processing.
  Python owns AI/knowledge and structured proposals, never app writes or corporate mutations.
  Corporate mock remains a separate owner/process; test DB resource is not application PostgreSQL.
- Do not change architecture, shared API/event contracts or data ownership unilaterally;
  TL and affected consumers review changes. AI Engineer owns internal AI implementation choices.
- Approved deterministic templates define steps/dependencies/checks; LLM cannot invent mandatory
  stages, change permissions or set verified. Go requires trusted correlated evidence.
- Separate intern confirmation of request submission from scoped human approval and IAM grant.
  Exact preview/TTL/re-authorization/idempotency/reconciliation apply to actions.
- Filter knowledge by verified scope before retrieval/LLM, including titles/metadata/citations.
  Diagnostic handoff is previewed and ACL-filtered; aggregates exclude raw logs/PII/chat.
- Group friction deterministically by journey_id + step_id + error_code, count distinct interns
  (threshold 2), deduplicate candidates; human review never auto-publishes docs or routes.
- Keep P0 scope, synthetic data and offline fallback. No HR, arbitrary SQL/commands, real corporate
  integrations, automatic code review or unrequested features.
- Before verification read `docs/testing/strategy.md` and `Makefile`; run `make check` and
  relevant component checks. Add behavior tests for implementation, coverage strictly >80%
  per component. For documentation-only changes, validate docs/links and unchanged executable files.
- Update SDD/backlog to actual results. Report changed files/checks/blockers; fixtures, liveness,
  unexecuted test plans and legacy schema checks must not be presented as implemented P0.
- Keep secrets and real personal data out of code, fixtures, logs and Git.
