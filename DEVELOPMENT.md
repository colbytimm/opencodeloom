# Development

This document is for developers who want to run type checks, tests, or use the orchestrator API directly (outside OpenCode).

## Requirements

- Node 22 (see `.nvmrc`), Git for worktrees.

## Setup

```bash
npm install
```

If you changed Node versions, reinstall to align native modules (better-sqlite3):

```bash
rm -rf node_modules package-lock.json
npm install
```

## Programmatic API

Use the orchestrator from Node scripts:

```js
import { bootstrapIssueQueue, claimNextTaskForAgent, completeTaskForAgent } from './.opencode/plugin/workflow-orchestrator.js';

const root = process.cwd();
const issue = 'example-1';
const db = '.opencode/state/tasks.db';

await bootstrapIssueQueue(root, issue, db);
const a1 = await claimNextTaskForAgent(root, issue, db, 'impl-1');
const a2 = await claimNextTaskForAgent(root, issue, db, 'impl-2');
if (a1.task) await completeTaskForAgent(root, issue, db, a1.task.id, true);
if (a2.task) await completeTaskForAgent(root, issue, db, a2.task.id, true);
```

Audit log: `.artifacts/<ISSUE_ID>/events.log` (newline-delimited JSON).

## Tests

- Typecheck: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Integration test: `npm run test:integration`

If you see an ABI error for `better-sqlite3`, switch to Node 22 and reinstall.
