import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('@opencode-ai/plugin', () => {
  const schemaBase = { describe() { return this; }, optional() { return this; }, default() { return this; }, transform() { return this; } };
  const schema = { string: () => ({ ...schemaBase }) };
  return { tool: Object.assign((def: any) => def, { schema }) };
});

const Orchestrator: any = await import(new URL('../../.opencode/plugin/workflow-orchestrator.ts', import.meta.url).href);
const Graph: any = await import(new URL('../../.opencode/tool/graph-db-tool.ts', import.meta.url).href);

import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import path from 'path';

const root = path.join(process.cwd(), 'tmp-db-only');

function getExec(exp: any) { return exp?.execute ?? exp; }

describe('Integration: DB-only orchestrator + graph state', () => {
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('imports graph, enqueues ready tasks, enforces capacity, unlocks dependents, and logs audit', async () => {
    const issueId = 'ISSUE-DB';
    const dbPath = path.join(root, 'tasks.db');

    // Prepare issue and graph JSON
    await mkdir(path.join(root, 'issues', issueId), { recursive: true });
    await writeFile(path.join(root, 'issues', issueId, 'task-graph.json'), JSON.stringify({
      version: 'v1',
      tasks: [
        { id: 'T1', title: 'one' },
        { id: 'T2', title: 'two' },
        { id: 'T3', title: 'three', deps: ['T1','T2'] },
      ],
    }, null, 2));

    // Set optional capacity limits: impl-1 can only run 1 task at a time
    await mkdir(path.join(root, '.opencode', 'state'), { recursive: true });
    await writeFile(path.join(root, '.opencode', 'state', 'limits.json'), JSON.stringify({ 'impl-1': 1 }, null, 2));

    // Bootstrap: imports graph -> computes ready (T1,T2) -> enqueues -> sets graph states to queued
    const boot = await Orchestrator.bootstrapIssueQueue(root, issueId, dbPath);
    expect(boot.enqueued).toBe(2);

    // Verify graph states via DB listing
    const list = getExec(Graph.listgraph);
  const rawListOut = await list({ dbPath, issue_id: issueId });
  let listOut: any;
  try { listOut = JSON.parse(rawListOut); } catch { throw new Error(`listgraph returned non-JSON: ${String(rawListOut)}`); }
  expect(listOut.ok, `listgraph out: ${rawListOut}`).toBe(true);
    const byId: Record<string, any> = Object.fromEntries(listOut.tasks.map((t: any) => [t.id, t]));
    expect(byId['T1'].state).toBe('queued');
    expect(byId['T2'].state).toBe('queued');
    expect(byId['T3'].state).toBe('new');

    // Claims honoring capacity
    const c1: any = await Orchestrator.claimNextTaskForAgent(root, issueId, dbPath, 'impl-1');
    expect(c1.ok).toBe(true); expect(c1.task).toBeTruthy();
    const c2Cap: any = await Orchestrator.claimNextTaskForAgent(root, issueId, dbPath, 'impl-1');
    expect(c2Cap.ok).toBe(true); expect(c2Cap.task).toBeNull(); expect(c2Cap.reason).toBe('at-capacity');
    const c2: any = await Orchestrator.claimNextTaskForAgent(root, issueId, dbPath, 'impl-2');
    expect(c2.ok).toBe(true); expect(c2.task).toBeTruthy();

    // Complete T1 first; T3 still blocked until T2 finishes
    const payload1 = JSON.parse(c1.task.payload_json);
    const done1 = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'impl-1', c1.task.id, true, undefined, payload1.id);
    expect(done1.ok).toBe(true);

    // Finish T2; T3 should now enqueue and be claimable
    const payload2 = JSON.parse(c2.task.payload_json);
    const done2 = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'impl-2', c2.task.id, true, undefined, payload2.id);
    expect(done2.ok).toBe(true);

    const c3: any = await Orchestrator.claimNextTaskForAgent(root, issueId, dbPath, 'impl-3');
    expect(c3.ok).toBe(true); expect(c3.task).toBeTruthy();
    const payload3 = JSON.parse(c3.task.payload_json);
    const done3 = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'impl-3', c3.task.id, true, undefined, payload3.id);
    expect(done3.ok).toBe(true);

    // Verify final states all done
    const listOut2 = JSON.parse(await list({ dbPath, issue_id: issueId }));
    const finalStates = Object.fromEntries(listOut2.tasks.map((t: any) => [t.id, t.state]));
    expect(finalStates['T1']).toBe('done');
    expect(finalStates['T2']).toBe('done');
    expect(finalStates['T3']).toBe('done');

    // Audit log present and contains some events
    const auditPath = path.join(root, '.artifacts', issueId, 'events.log');
    const audit = await readFile(auditPath, 'utf-8');
    expect(audit).toContain('"event":"bootstrap"');
    expect(audit).toContain('"event":"claim"');
    expect(audit).toContain('"event":"complete"');
  });

  it('blocks completion until all expected agents check off', async () => {
    const issueId = 'ISSUE-AGENTS';
    const dbPath = path.join(root, 'agents.db');

    await mkdir(path.join(root, 'issues', issueId), { recursive: true });
    await writeFile(path.join(root, 'issues', issueId, 'task-graph.json'), JSON.stringify({
      version: 'v1',
      tasks: [
        { id: 'T1', title: 'paired task', agents: ['impl-1', 'impl-2'] },
      ],
    }, null, 2));

    await mkdir(path.join(root, '.opencode', 'state'), { recursive: true });

    const boot = await Orchestrator.bootstrapIssueQueue(root, issueId, dbPath);
    expect(boot.enqueued).toBe(1);

    const claim: any = await Orchestrator.claimNextTaskForAgent(root, issueId, dbPath, 'impl-1');
    expect(claim.ok).toBe(true); expect(claim.task).toBeTruthy();
    const payload = JSON.parse(claim.task.payload_json);

    const firstComplete = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'impl-1', claim.task.id, true, undefined, payload.id);
    expect(firstComplete.ok).toBe(false);
    expect(firstComplete.blocked).toBe(true);
    expect(firstComplete.outstanding_agents).toContain('impl-2');

    const list = JSON.parse(await getExec(Graph.listgraph)({ dbPath, issue_id: issueId }));
    expect(list.tasks.find((t: any) => t.id === 'T1').state).toBe('in_progress');

    const secondComplete = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'impl-2', claim.task.id, true, undefined, payload.id);
    expect(secondComplete.ok).toBe(true);

    const listFinal = JSON.parse(await getExec(Graph.listgraph)({ dbPath, issue_id: issueId }));
    expect(listFinal.tasks.find((t: any) => t.id === 'T1').state).toBe('done');
  });

  it('adds code-quality agent before reviewer and enforces ordering', async () => {
    const issueId = 'ISSUE-REVIEW-FLOW';
    const dbPath = path.join(root, 'review.db');

    await mkdir(path.join(root, 'issues', issueId), { recursive: true });
    await writeFile(path.join(root, 'issues', issueId, 'task-graph.json'), JSON.stringify({
      version: 'v1',
      tasks: [
        { id: 'TQ', title: 'needs review', agents: ['reviewer'] },
      ],
    }, null, 2));

    await mkdir(path.join(root, '.opencode', 'state'), { recursive: true });

    const boot = await Orchestrator.bootstrapIssueQueue(root, issueId, dbPath);
    expect(boot.enqueued).toBe(1);

    const listBefore = JSON.parse(await getExec(Graph.listgraph)({ dbPath, issue_id: issueId }));
    const taskInfo = listBefore.tasks.find((t: any) => t.id === 'TQ');
    expect(taskInfo.agents).toEqual(['code-quality', 'reviewer']);

    const claim: any = await Orchestrator.claimNextTaskForAgent(root, issueId, dbPath, 'code-quality');
    expect(claim.ok).toBe(true); expect(claim.task).toBeTruthy();
    const payload = JSON.parse(claim.task.payload_json);
    expect(payload.agents).toEqual(['code-quality', 'reviewer']);

    const reviewerAttempt = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'reviewer', claim.task.id, true, undefined, payload.id);
    expect(reviewerAttempt.ok).toBe(false);
    expect(reviewerAttempt.blocked).toBe(true);
    expect(reviewerAttempt.outstanding_agents).toEqual(['code-quality']);

    const codeQualityComplete = await Orchestrator.completeTaskForAgent(root, issueId, dbPath, 'code-quality', claim.task.id, true, undefined, payload.id);
    expect(codeQualityComplete.ok).toBe(true);

    const listAfter = JSON.parse(await getExec(Graph.listgraph)({ dbPath, issue_id: issueId }));
    expect(listAfter.tasks.find((t: any) => t.id === 'TQ').state).toBe('done');
  });
});
