## Git work contracts

Work on project files locally. You may create local Git commits. Do not list Codex as a co-author or add a `Co-authored-by` trailer that credits Codex.

Do not push to any remote, including feature branches and forks. Do not open or merge pull requests, invite collaborators, or change repository permissions. The repository owner handles publishing and access management.

## UI Design Reference

The main UI reference is located at:
`docs/design/ui-reference.png`

Before implementing frontend features:
1. Inspect the reference image.
2. Follow its general layout, colors, typography,
   spacing and component styling.
3. Maintain visual consistency across all pages.
4. Use `docs/design/UI_GUIDELINES.md` for detailed rules.

The image is a visual reference, not an exact
functional specification.

## Before starting

1. Read `README.md` and `docs/product/specification.md` for current status and MVP scope.
2. Read `ARCHITECTURE.md`, `docs/architecture/decisions.md` and `docs/team/working-agreements.md`.
3. Find the assigned task in `docs/team/backlog.md`; check its dependencies and ownership.
   For a feature, read its `spec.md`, `design.md` and `tasks.md` in `docs/features/<feature>/`.
4. Inspect `git status` and existing code in your assigned area before editing.

Read additional references when relevant to the task:
- API, chat or actions: `docs/architecture/api-contracts.md`, `contracts/`,
  `docs/architecture/security.md` and `docs/architecture/state-machines.md`.
- Database changes: `docs/architecture/data-model.md` and the component's migrations.
- AI/RAG: `docs/architecture/ai-design.md` and `data/knowledge/` (including evals).
- Frontend: the UI Design Reference section above.
- Environment/CI: `docs/operations/development.md`, `compose.yaml` and `.github/workflows/`.

## Development contract

- Work only on the assigned task and directories; preserve other agents' and the owner's changes.
- Use the assigned branch/worktree; do not switch branches in a shared working tree.
- Follow the Git work contracts above; publishing and PRs belong to the repository owner.
- Shared contracts and data ownership changes require TL review; report conflicting requirements.
- Keep to MVP scope (intern and buddy); do not add HR or unrequested features.
- Before verification, read `docs/testing/strategy.md` and `Makefile`; run `make check`
  and relevant component checks, adding tests for changed behavior.
- Update the relevant SDD/backlog status to reflect actual results. Report changed files,
  checks run and remaining blockers; never present fixtures or healthchecks as implemented features.
- Keep secrets and real personal data out of code, fixtures, logs and Git.
