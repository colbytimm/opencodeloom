import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@opencode-ai/plugin', () => {
  const schemaBase = { describe() { return this; }, optional() { return this; }, default() { return this; }, transform() { return this; } };
  const schema = { string: () => ({ ...schemaBase }) };
  return { tool: Object.assign((def: any) => def, { schema }) };
});
import { mkdir, rm } from 'fs/promises';
import path from 'path';

const GraphMod: any = await import(new URL('../../.opencode/tool/graph-db-tool.ts', import.meta.url).href);

function getExec(exp: any) { return exp?.execute ?? exp; }

const tmpRoot = path.join(process.cwd(), 'tmp-graph-db');
const dbPath = path.join(tmpRoot, 'graph.db');

describe('graph-db-tool (unit)', () => {
  beforeEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('init, import, compute ready, set state, list graph', async () => {
    const init = getExec(GraphMod.initgraphtables);
    const imp = getExec(GraphMod.importgraph);
    const ready = getExec(GraphMod.computeready);
    const set = getExec(GraphMod.setgraphstate);
    const list = getExec(GraphMod.listgraph);

    const issue = 'ISS-DB-ONLY';
    const graph = {
      version: 'v1',
      tasks: [
        { id: 'A', title: 'Task A' },
        { id: 'B', title: 'Task B', deps: ['A'] },
      ],
    };

    let out = JSON.parse(await init({ dbPath }));
    expect(out.ok).toBe(true);

    out = JSON.parse(await imp({ dbPath, issue_id: issue, graph_json: JSON.stringify(graph) }));
    expect(out.ok).toBe(true);
    expect(out.tasks).toBe(2);

    out = JSON.parse(await ready({ dbPath, issue_id: issue }));
    expect(out.ok).toBe(true);
    const r1 = out.tasks.map((t: any) => t.id).sort();
    expect(r1).toEqual(['A']);

    // Mark A done, now B should be ready
    out = JSON.parse(await set({ dbPath, issue_id: issue, task_id: 'A', state: 'done' }));
    expect(out.ok).toBe(true);

    out = JSON.parse(await ready({ dbPath, issue_id: issue }));
    expect(out.ok).toBe(true);
    const r2 = out.tasks.map((t: any) => t.id).sort();
    expect(r2).toEqual(['B']);

    // listgraph shows states
    out = JSON.parse(await list({ dbPath, issue_id: issue }));
    expect(out.ok).toBe(true);
    const all = out.tasks;
    const A = all.find((t: any) => t.id === 'A');
    const B = all.find((t: any) => t.id === 'B');
    expect(A.state).toBe('done');
    expect(B.state).toBe('new');

    // Re-import should reset states to new
    out = JSON.parse(await imp({ dbPath, issue_id: issue, graph_json: JSON.stringify(graph) }));
    expect(out.ok).toBe(true);
    out = JSON.parse(await list({ dbPath, issue_id: issue }));
    const A2 = out.tasks.find((t: any) => t.id === 'A');
    const B2 = out.tasks.find((t: any) => t.id === 'B');
    expect(A2.state).toBe('new');
    expect(B2.state).toBe('new');
  });
});
