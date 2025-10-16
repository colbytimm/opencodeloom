---
description: Open a pull request from the current worktree branch
agent: build
tools:
  createworktree: true
  deleteworktree: true
---
# /open-pr

Open a PR from the current feature branch created via the createworktree tool. Do not attempt to manage worktrees or branches via commands here.

Guidance:

- Detect current branch and repository from context.
- Title: concise summary of the change. Include task/issue ID if available.
- Body: describe what changed, why, how it was tested, and any risks or rollbacks.
- Link related issues and any validation results (tests, security) if available.
