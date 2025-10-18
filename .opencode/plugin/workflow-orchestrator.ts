import { loadTaskGraph, TaskNode } from '../lib/task-scheduler.js';
import { mkdir, appendFile, readFile, writeFile, access } from 'fs/promises';
import path from 'path';
import { inittasksdb, createtask, claimnexttask, marktaskdone, marktaskfailed, listtasks, checkofftask, listtaskchecks } from '../tool/task-queue-tool.js';
import { initgraphtables, importgraph, computeready, setgraphstate, listgraph } from '../tool/graph-db-tool.js';
import { createworktree } from '../tool/worktree-tool.js';

type Shell = (strings: TemplateStringsArray, ...args: any[]) => Promise<any>
interface Context { $: Shell; project: unknown; directory: string; worktree?: string }
interface EventPayload { type?: string }

async function callTool<T = any>(toolExport: any, args: any): Promise<T> {
  const exec = toolExport?.execute ?? toolExport;
  const out = await exec(args);
  try { return JSON.parse(out) as T } catch { return out as T }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 100): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function appendAudit(rootDir: string, issueId: string, event: Record<string, any>) {
  try {
    const dir = path.join(rootDir, '.artifacts', issueId);
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    await appendFile(path.join(dir, 'events.log'), line, 'utf-8');
  } catch {
    // best-effort: never throw
  }
}

async function maybeLoadRepoMap(rootDir: string): Promise<Record<string, string>> {
  try {
    const file = path.join(rootDir, '.opencode', 'config', 'repos.json');
    const raw = await readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch { return {}; }
}

async function prepareWorktreesForTask(rootDir: string, t: TaskNode) {
  const repoPaths: string[] = Array.isArray((t as any).repo_paths) ? (t as any).repo_paths : [];
  if (repoPaths.length === 0) return { prepared: 0 };
  const map = await maybeLoadRepoMap(rootDir);
  let prepared = 0;
  for (const repo of repoPaths) {
    const repoPath = map[repo] ?? '..';
    try {
      await callTool(createworktree, { taskId: t.id, repoPath, branchPrefix: `issue-${t.id}` });
      prepared++;
    } catch {
      // ignore; do not fail orchestration for missing/misconfigured repos
    }
  }
  return { prepared };
}

function normalizeAgentsList(input: any): string[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!seen.has(trimmed)) {
      cleaned.push(trimmed);
      seen.add(trimmed);
    }
  }
  const reviewerIndex = cleaned.indexOf('reviewer');
  if (reviewerIndex >= 0) {
    const codeQualityIndex = cleaned.indexOf('code-quality');
    if (codeQualityIndex === -1) {
      cleaned.splice(reviewerIndex, 0, 'code-quality');
    } else if (codeQualityIndex > reviewerIndex) {
      cleaned.splice(codeQualityIndex, 1);
      cleaned.splice(reviewerIndex, 0, 'code-quality');
    }
  }
  return cleaned;
}

type Limits = { [agent_id: string]: number };
type RetryPolicy = { maxAttemptsPerTask?: number };
type Retries = { [graphId: string]: number };

async function loadLimits(rootDir: string): Promise<Limits> {
  const file = path.join(rootDir, '.opencode', 'state', 'limits.json');
  try { await access(file); const raw = await readFile(file, 'utf-8'); return JSON.parse(raw); } catch { return {}; }
}

async function getAgentInProgressCount(dbPath: string, agent_id: string): Promise<number> {
  try {
    const res: any = await withRetry(() => callTool(listtasks, { dbPath, state: 'in_progress' }));
    if (!res?.ok) return 0;
    const tasks = Array.isArray(res.tasks) ? res.tasks : [];
    return tasks.filter((t: any) => t.agent_id === agent_id).length;
  } catch { return 0; }
}

async function loadRetryPolicy(rootDir: string): Promise<RetryPolicy> {
  const file = path.join(rootDir, '.opencode', 'state', 'retry-policy.json');
  try { await access(file); const raw = await readFile(file, 'utf-8'); return JSON.parse(raw); } catch { return {}; }
}

async function loadRetries(rootDir: string): Promise<Retries> {
  const file = path.join(rootDir, '.opencode', 'state', 'retries.json');
  try { await access(file); const raw = await readFile(file, 'utf-8'); return JSON.parse(raw); } catch { return {}; }
}

async function saveRetries(rootDir: string, retries: Retries) {
  const dir = path.join(rootDir, '.opencode', 'state');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'retries.json');
  await writeFile(file, JSON.stringify(retries, null, 2), 'utf-8');
}

export async function bootstrapIssueQueue(rootDir: string, issueId: string, dbPath = '.opencode/state/tasks.db') {
  const actualRootDir = typeof rootDir === 'string' ? rootDir : (rootDir as any)?.directory || process.cwd();

  // Guard against invalid plugin loading calls
  if (!issueId || typeof issueId !== 'string') {
    console.warn('bootstrapIssueQueue called with invalid parameters during plugin loading - skipping');
    return { enqueued: 0 };
  }

  await withRetry(() => callTool(inittasksdb, { dbPath }));
  await withRetry(() => callTool(initgraphtables, { dbPath }));
  const graph = await loadTaskGraph(actualRootDir, issueId);
  await withRetry(() => callTool(importgraph, { dbPath, issue_id: issueId, graph_json: JSON.stringify(graph) }));
  let tasks: TaskNode[] = Array.isArray(graph?.tasks)
    ? (graph.tasks.filter((t: any) => !t.deps || t.deps.length === 0) as TaskNode[])
    : [];
  for (const t of tasks) {
    const expectedAgents = normalizeAgentsList((t as any).agents);
    const payload = { ...t, agents: expectedAgents };
    await withRetry(() => callTool(createtask, {
      dbPath,
      title: t.title || t.id,
      payload_json: JSON.stringify(payload),
      priority: '100',
      expected_agents_json: JSON.stringify(expectedAgents)
    }));
    await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: t.id, state: 'queued' }));
    await prepareWorktreesForTask(actualRootDir, t).catch(() => {});
  }
  const enqueued = tasks.length;
  await appendAudit(actualRootDir, issueId, { event: 'bootstrap', enqueued });
  return { enqueued };
}

export async function claimNextTaskForAgent(rootDir: string, issueId: string, dbPath: string, agent_id: string) {
  const actualRootDir = typeof rootDir === 'string' ? rootDir : (rootDir as any)?.directory || process.cwd();

  const limits = await loadLimits(actualRootDir);
  const max = limits[agent_id];
  if (typeof max === 'number') {
    const current = await getAgentInProgressCount(dbPath, agent_id);
    if (current >= max) {
      await appendAudit(actualRootDir, issueId, { event: 'claim-skip-capacity', agent_id, current, max });
      return { ok: true, task: null, reason: 'at-capacity' };
    }
  }

  const res: any = await withRetry(() => callTool(claimnexttask, { dbPath, agent_id }));
  if (!res.ok) return res;
  const task = res.task;
  if (task) {
    try {
      const payload = JSON.parse(task.payload_json || '{}');
      const graphId = payload.id ?? String(task.id);
      await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: graphId, state: 'in_progress' }));
      await appendAudit(actualRootDir, issueId, { event: 'claim', agent_id, dbTaskId: task.id, graphId });
    } catch {
      const sid = String(task.id);
      await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: sid, state: 'in_progress' }));
      await appendAudit(actualRootDir, issueId, { event: 'claim', agent_id, dbTaskId: task.id, graphId: sid });
    }
  }
  return res;
}

export async function completeTaskForAgent(
  rootDir: string,
  issueId: string,
  dbPath: string,
  agent_id: string | undefined,
  dbTaskId: number | string,
  ok = true,
  error_text?: string,
  payloadGraphId?: string,
) {
  // Defensive check: ensure rootDir is a string, extract from context if needed
  const actualRootDir = typeof rootDir === 'string' ? rootDir : (rootDir as any)?.directory || process.cwd();

  const taskIdNumeric = Number(dbTaskId);
  if (ok && agent_id) {
    await withRetry(() => callTool(checkofftask, { dbPath, task_id: String(taskIdNumeric), agent_id }));
  }

  let outstandingAgents: string[] = [];
  if (ok) {
    const lg: any = await withRetry(() => callTool(listgraph, { dbPath, issue_id: issueId }));
    const taskNode = lg?.ok ? (lg.tasks as any[]).find(t => t.id === (payloadGraphId ?? String(dbTaskId))) : undefined;
    const expectedAgents: string[] = normalizeAgentsList(taskNode?.agents);
    if (expectedAgents.length > 0) {
      const checksRes: any = await withRetry(() => callTool(listtaskchecks, { dbPath, task_id: String(taskIdNumeric) }));
      const doneAgents = new Set(
        Array.isArray(checksRes?.checks)
          ? checksRes.checks.filter((c: any) => c?.status === 'done').map((c: any) => c.agent_id)
          : []
      );
      outstandingAgents = expectedAgents.filter(agent => !doneAgents.has(agent));
      if (outstandingAgents.length > 0) {
        await appendAudit(actualRootDir, issueId, {
          event: 'complete-blocked',
          dbTaskId,
          graphId: payloadGraphId ?? String(dbTaskId),
          agent_id,
          outstanding_agents: outstandingAgents,
        });
        return {
          ok: false,
          blocked: true,
          outstanding_agents: outstandingAgents,
        };
      }
    }
  }

  const toolRes: any = ok
    ? await withRetry(() => callTool(marktaskdone, { dbPath, id: String(dbTaskId) }))
    : await withRetry(() => callTool(marktaskfailed, { dbPath, id: String(dbTaskId), error_text: error_text ?? 'error' }));

  const graphId = payloadGraphId ?? String(dbTaskId);
  let retried = false;
  if (!ok) {
    const policy = await loadRetryPolicy(actualRootDir);
    const max = policy.maxAttemptsPerTask ?? 0;
    if (max > 0) {
      const counts = await loadRetries(actualRootDir);
      const next = (counts[graphId] ?? 0) + 1;
      counts[graphId] = next;
      await saveRetries(actualRootDir, counts);
      if (next <= max) {
        // Re-enqueue task instead of marking failed
        // Pull details from DB listgraph instead of file
        const lg: any = await withRetry(() => callTool(listgraph, { dbPath, issue_id: issueId }));
        const taskNode = lg?.ok ? (lg.tasks as any[]).find(t => t.id === graphId) : undefined;
        if (taskNode) {
          await withRetry(() => callTool(createtask, { dbPath, title: taskNode.title || taskNode.id, payload_json: JSON.stringify(taskNode), priority: '100' }));
          await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: graphId, state: 'queued' }));
          retried = true;
          await appendAudit(actualRootDir, issueId, { event: 'retry-enqueue', graphId, attempt: next, max });
        }
      }
    }
  }
  if (ok) await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: graphId, state: 'done' }));
  else if (!retried) await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: graphId, state: 'failed' }));
  await appendAudit(actualRootDir, issueId, { event: 'complete', ok, dbTaskId, graphId, retried, error_text: ok ? undefined : error_text });
  // No file-based claims tracking needed; SQLite reflects current in_progress

  if (ok) {
    const readyRes: any = await withRetry(() => callTool(computeready, { dbPath, issue_id: issueId }));
    const tasks: TaskNode[] = readyRes.ok ? readyRes.tasks : [];
    for (const t of tasks) {
      const expectedAgents = normalizeAgentsList((t as any).agents);
      const payload = { ...t, agents: expectedAgents };
      await withRetry(() => callTool(createtask, {
        dbPath,
        title: t.title || t.id,
        payload_json: JSON.stringify(payload),
        priority: '100',
        expected_agents_json: JSON.stringify(expectedAgents)
      }));
      await withRetry(() => callTool(setgraphstate, { dbPath, issue_id: issueId, task_id: t.id, state: 'queued' }));
    }
  }
  return toolRes;
}

export const WorkflowOrchestrator = async ({ $, project, directory, worktree }) => {
  return {
    async event({ event }: { event: EventPayload }) {
      if (event.type === "session.idle") {
        try { await $`osascript -e 'display notification "Session completed!" with title "opencode"'` } catch {}
      }
    },
  }
}