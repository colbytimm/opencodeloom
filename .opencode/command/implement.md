---
description: Implement a specific task with tests
agent: build
---
# /implement

Using the Task Graph, implement with a tests-first approach. Keep changes minimal and focused.

Usage:

- `/implement` — implement the next ready task for the current issue (based on deps).
- `/implement all` — implement tasks sequentially until the issue’s graph is complete or a task fails.
- `/implement <TASK_ID>` — implement a specific task.

Guidance:

- Determine ready tasks via the DB-only state (no manual graph editing).
- If `repo_paths` are present and mapped, prepare per-task worktrees before editing.
- After implementing, run tests, then mark the task done so dependents can unlock.
