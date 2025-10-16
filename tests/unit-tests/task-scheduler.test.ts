import { describe, it, expect, vi, beforeEach } from 'vitest';

const readFile = vi.fn();
const writeFile = vi.fn();
const mkdir = vi.fn();
const access = vi.fn();
vi.mock('fs/promises', () => ({ readFile, writeFile, mkdir, access }));

const mod: any = await import(new URL('../../.opencode/plugin/task-scheduler.ts', import.meta.url).href);

describe('task-scheduler (unit)', () => {
  beforeEach(() => {
    readFile.mockReset();
    writeFile.mockReset();
    mkdir.mockReset();
    access.mockReset();
  });

  it('computeReadyTasks respects dependencies', () => {
    const graph = { version: 'v1', tasks: [
      { id: 'A', title: 'A' },
      { id: 'B', title: 'B', deps: ['A'] },
    ]};
  const state: any = { queued: [], in_progress: [], done: [], failed: [] };
    const ready1 = mod.computeReadyTasks(graph, state).map((t: any) => t.id);
    expect(ready1).toEqual(['A']);
    state.done.push('A');
    const ready2 = mod.computeReadyTasks(graph, state).map((t: any) => t.id);
    expect(ready2).toEqual(['B']);
  });

  it('loadTaskGraph reads and parses task-graph.json', async () => {
    readFile.mockResolvedValueOnce('{"version":"v1","tasks":[{"id":"T","title":"t"}] }');
    const root = '/root';
    const issueId = 'ISS-1';
    const graph = await mod.loadTaskGraph(root, issueId);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect((readFile.mock.calls[0][0] as string).endsWith('/issues/ISS-1/task-graph.json')).toBe(true);
    expect(graph.version).toBe('v1');
    expect(graph.tasks[0].id).toBe('T');
  });

  it('loadIssueState returns default when file missing', async () => {
    access.mockRejectedValueOnce(new Error('missing'));
  const state: any = await mod.loadIssueState('/root', 'ISS-1');
    expect(state).toEqual({ queued: [], in_progress: [], done: [], failed: [] });
  });

  it('loadIssueState reads state.json when present', async () => {
    access.mockResolvedValueOnce(undefined);
    readFile.mockResolvedValueOnce('{"queued":["A"],"in_progress":[],"done":[],"failed":[]}');
    const state = await mod.loadIssueState('/root', 'ISS-1');
    expect(state.queued).toEqual(['A']);
  });

  it('saveIssueState writes to the expected path', async () => {
    writeFile.mockResolvedValueOnce(undefined);
    mkdir.mockResolvedValueOnce(undefined);
    await mod.saveIssueState('/root', 'ISS-1', { queued: ['A'], in_progress: [], done: [], failed: [] });
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect((mkdir.mock.calls[0][0] as string).endsWith('/issues/ISS-1')).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect((writeFile.mock.calls[0][0] as string).endsWith('/issues/ISS-1/state.json')).toBe(true);
  });

  it('enqueueReadyTasks calls createTask for each ready task and saves state', async () => {
    writeFile.mockResolvedValue(undefined);
    mkdir.mockResolvedValue(undefined);

    const root = '/root';
    const issueId = 'ISS-1';
    const graph = { version: 'v1', tasks: [
      { id: 'root1', title: 'R1' },
      { id: 'root2', title: 'R2' },
      { id: 'child', title: 'C', deps: ['root1', 'root2'] },
    ]};
  const state: any = { queued: [], in_progress: [], done: [], failed: [] };

    const created: string[] = [];
    const res = await mod.enqueueReadyTasks(root, issueId, graph, state, async (t: any) => { created.push(t.id); });
    expect(res.enqueued).toBe(2);
    expect(created.sort()).toEqual(['root1', 'root2']);
    expect(writeFile).toHaveBeenCalled();
  });
});
