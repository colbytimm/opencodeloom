# OpenCode Loom

Lightweight, local-first orchestration for issues that the agent breaks into tasks. Uses SQLite for state, optional git worktrees per task, and simple audit logs.

## What it does

- Takes your issue (with acceptance criteria), derives a task graph, and stores it in SQLite (DB-only runtime).
- Enqueues root tasks, unlocks dependents when parents finish—no manual graph authoring.
- Optional: creates per-task git worktrees for one or many repos.
- Tracks claims and completions; writes an audit log per issue.

## Requirements

- OpenCode
- Optional: Git (only if you want worktrees)

## Use with OpenCode

- Open this repository in OpenCode.

- Draft the issue

  - Run `/draft-issue` to be guided through problem, acceptance criteria, optional repo tags, constraints, and risks.
  - It validates repo tags and prepares `ISSUE.md` content plus a small JSON block for `/kickoff`.

- Generate or update a task graph

  - If you didn’t use `/draft-issue`, write your issue and acceptance criteria in the OpenCode issue context (optionally tag repos).
  - Run `/kickoff`. The agent will produce the task graph automatically and persist it under `issues/<ISSUE_ID>/task-graph.json`.

- Work the tasks

  - Run `/implement` to implement the next ready task for the issue.
  - Or `/implement all` to run tasks sequentially until complete (or a failure).
  - Optionally `/implement <TASK_ID>` to target a specific task.
  - Use `/review` for code review and `/retest` to re-run tests.

- Ship it

  - Use `/open-pr` to create a PR. `/security-scan` runs local scans.

The orchestrator handles queueing and unlocking dependents under the hood. No additional setup is required to use OpenCode.

## Configure (optional)

Multi-repo mapping (`.opencode/config/repos.json`). Keys are logical repo names you reference in tasks; values are local paths.

```json
{
  "web": "/path/to/web-repo",
  "api": "/path/to/api-repo"
}
```

Local secrets (`.opencode/secrets/`) for dev only. Values are files named by key. Add an allowlist to restrict which keys can be used.

```text
.opencode/
  secrets/
    GITHUB_TOKEN
    NPM_TOKEN
    allowlist.json   // ["GITHUB_TOKEN", "NPM_TOKEN"]
```

See `docs/SECRETS_POLICY.md` for rules (redaction by default; never log values).

Optional limits and retries (`.opencode/state/`):

```jsonc
// limits.json: per-agent concurrency caps
{ "impl-1": 2, "impl-2": 1 }

// retry-policy.json: automatic re-enqueue on failure
{ "maxAttemptsPerTask": 1 }
```

## Define your issue (what you write)

Provide:

- Problem summary and context
- Acceptance criteria (clear, testable)
- Optional: repo tags (e.g., `web`, `api`) if work spans multiple repos

Then run `/kickoff`. The agent creates the task graph for you.

## Notes

- Multi-repo worktrees are created only when `repo_paths` is set and a path exists in `repos.json`.
- No CI is required; everything runs locally.
