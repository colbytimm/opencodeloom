import { readFile, writeFile, mkdir, access } from 'fs/promises';
import path from 'path';

export type TaskNode = {
  id: string;
  title: string;
  summary?: string;
  acceptance_criteria?: string[];
  deps?: string[];
  skills?: string[];
  repo_paths?: string[];
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

export async function loadTaskGraph(rootDir: string, issueId: string): Promise<TaskGraph> {
  const file = path.join(rootDir, 'issues', issueId, 'task-graph.json');
  const raw = await readFile(file, 'utf-8');
  return JSON.parse(raw);
}

export async function loadIssueState(rootDir: string, issueId: string): Promise<IssueState> {
  const file = path.join(rootDir, 'issues', issueId, 'state.json');
  try {
    await access(file);
    const raw = await readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { queued: [], in_progress: [], done: [], failed: [] };
  }
}

export async function saveIssueState(rootDir: string, issueId: string, state: IssueState) {
  const dir = path.join(rootDir, 'issues', issueId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'state.json');
  await writeFile(file, JSON.stringify(state, null, 2), 'utf-8');
}

export function computeReadyTasks(graph: TaskGraph, state: IssueState): TaskNode[] {
  const done = new Set(state.done);
  const alreadyHandled = new Set([...state.queued, ...state.in_progress, ...state.done, ...state.failed]);
  return graph.tasks.filter(t => {
    if (alreadyHandled.has(t.id)) return false;
    const deps = t.deps ?? [];
    return deps.every(d => done.has(d));
  });
}

export type CreateTaskFn = (t: TaskNode) => Promise<void>;

export async function enqueueReadyTasks(rootDir: string, issueId: string, graph: TaskGraph, state: IssueState, createTask: CreateTaskFn) {
  const ready = computeReadyTasks(graph, state);
  for (const t of ready) {
    await createTask(t);
    state.queued.push(t.id);
  }
  await saveIssueState(rootDir, issueId, state);
  return { enqueued: ready.length };
}
