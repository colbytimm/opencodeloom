import { readFile, writeFile, mkdir, access } from 'fs/promises';
import path from 'path';

export type TaskNode = {
  id: string;
  title?: string;
  summary?: string;
  acceptance_criteria?: string[];
  deps?: string[];
  skills?: string[];
  repo_paths?: string[];
  [key: string]: any;
};

export type TaskGraph = {
  version: string;
  tasks: TaskNode[];
  risks?: string[];
  assumptions?: string[];
};

export type IssueState = {
  queued: string[];
  in_progress: string[];
  done: string[];
  failed: string[];
};

export function defaultIssueState(): IssueState {
  return { queued: [], in_progress: [], done: [], failed: [] };
}

export function computeReadyTasks(graph: TaskGraph, state: IssueState): TaskNode[] {
  const done = new Set(state.done);
  const alreadyHandled = new Set([...state.queued, ...state.in_progress, ...state.done, ...state.failed]);
  return graph.tasks.filter(t => {
    if (alreadyHandled.has(t.id)) return false;
    const deps = Array.isArray(t.deps) ? t.deps : [];
    return deps.every(d => done.has(d));
  });
}

export async function loadTaskGraph(rootDir: string, issueId: string): Promise<TaskGraph> {
  const file = path.join(rootDir, 'issues', issueId, 'task-graph.json');
  const raw = await readFile(file, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid graph file');
  return parsed;
}

export async function loadIssueState(rootDir: string, issueId: string): Promise<IssueState> {
  const file = path.join(rootDir, 'issues', issueId, 'state.json');
  try {
    await access(file);
    const raw = await readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultIssueState();
    return {
      queued: Array.isArray(parsed.queued) ? parsed.queued.slice() : [],
      in_progress: Array.isArray(parsed.in_progress) ? parsed.in_progress.slice() : [],
      done: Array.isArray(parsed.done) ? parsed.done.slice() : [],
      failed: Array.isArray(parsed.failed) ? parsed.failed.slice() : [],
    };
  } catch {
    return defaultIssueState();
  }
}

export async function saveIssueState(rootDir: string, issueId: string, state: IssueState): Promise<void> {
  const dir = path.join(rootDir, 'issues', issueId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'state.json');
  await writeFile(file, JSON.stringify(state, null, 2), 'utf-8');
}

export type CreateTaskFn = (t: TaskNode) => Promise<void>;

export async function enqueueReadyTasks(
  rootDir: string,
  issueId: string,
  graph: TaskGraph,
  state: IssueState,
  createTask: CreateTaskFn
): Promise<{ ok: boolean; enqueued: number }> {
  const ready = computeReadyTasks(graph, state);
  let enqueued = 0;
  for (const t of ready) {
    await createTask(t);
    state.queued.push(t.id);
    enqueued += 1;
  }
  if (enqueued > 0) {
    await saveIssueState(rootDir, issueId, state);
  }
  return { ok: true, enqueued };
}
