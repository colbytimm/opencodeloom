# Hotfix and Rollback Flow

- Branch: `hotfix/<issue-id>-<slug>` directly from `main`.
- Safety: run lint/typecheck and a minimal Semgrep/OSV pass before PR.
- PR: require at least one reviewer; squash merge on approval.
- Rollback: revert via PR, tag rollback, document incident notes.
