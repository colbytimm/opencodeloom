import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export type TaskNode = {
  id: string;
  title?: string;
  deps?: string[];
  [key: string]: any;
};

export type TaskGraph = {
  version: string;
  tasks: TaskNode[];
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
  const ineligible = new Set([...state.in_progress, ...state.queued, ...state.failed]);

  return graph.tasks.filter(task => {
    if (done.has(task.id) || ineligible.has(task.id)) return false;
    const deps = Array.isArray(task.deps) ? task.deps : [];
    return deps.every(dep => done.has(dep));
  });
}

export async function loadTaskGraph(rootDir: string, issueId: string): Promise<TaskGraph> {
  const graphPath = join(rootDir, 'issues', issueId, 'task-graph.json');
  const raw = await readFile(graphPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid graph file');
  return parsed;
}

export async function loadIssueState(rootDir: string, issueId: string): Promise<IssueState> {
  const statePath = join(rootDir, 'issues', issueId, 'state.json');
  try {
    await access(statePath);
  } catch {
    return defaultIssueState();
  }
  const raw = await readFile(statePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return defaultIssueState();
  return {
    queued: Array.isArray(parsed.queued) ? parsed.queued.slice() : [],
    in_progress: Array.isArray(parsed.in_progress) ? parsed.in_progress.slice() : [],
    done: Array.isArray(parsed.done) ? parsed.done.slice() : [],
    failed: Array.isArray(parsed.failed) ? parsed.failed.slice() : [],
  };
}

export async function saveIssueState(rootDir: string, issueId: string, state: IssueState): Promise<void> {
  const issueDir = join(rootDir, 'issues', issueId);
  await mkdir(issueDir, { recursive: true });
  const statePath = join(issueDir, 'state.json');
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

export async function enqueueReadyTasks(
  rootDir: string,
  issueId: string,
  graph: TaskGraph,
  state: IssueState,
  creator: (task: TaskNode) => Promise<any>,
): Promise<{ ok: boolean; enqueued: number }> {
  const ready = computeReadyTasks(graph, state);
  let enqueued = 0;
  for (const task of ready) {
    await creator(task);
    state.queued.push(task.id);
    enqueued += 1;
  }
  if (enqueued > 0) {
    await saveIssueState(rootDir, issueId, state);
  }
  return { ok: true, enqueued };
}
