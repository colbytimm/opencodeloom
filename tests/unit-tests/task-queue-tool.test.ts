import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@opencode-ai/plugin', () => {
  const schemaBase = {
    describe() { return this; },
    optional() { return this; },
    default() { return this; },
    transform() { return this; },
  };
  const schema = { string: () => ({ ...schemaBase }) };
  return { tool: Object.assign((def: any) => def, { schema }) };
});
import path from 'path';
import fs from 'fs';

const mod: any = await import(new URL('../../.opencode/tool/task-queue-tool.ts', import.meta.url).href);

function execOf(toolExport: any) { return toolExport?.execute ?? toolExport; }

describe('task-queue-tool', () => {
  const dbPath = path.join(process.cwd(), '.opencode', 'state', 'test-tasks.db');

  beforeEach(() => {
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.rmdirSync(path.dirname(dbPath)); } catch {}
    try { fs.rmdirSync(path.join(process.cwd(), '.opencode', 'state')); } catch {}
  });

  it('initializes DB and schema', async () => {
    const init = execOf(mod.inittasksdb);
    const res = JSON.parse(await init({ dbPath }));
    expect(res.ok).toBe(true);
  });

  it('creates and claims tasks in priority order', async () => {
    const init = execOf(mod.inittasksdb);
    await init({ dbPath });

    const create = execOf(mod.createtask);
    await create({ dbPath, title: 'low-pri', payload_json: '{}', priority: '200' });
    await create({ dbPath, title: 'high-pri', payload_json: '{}', priority: '10' });

    const claim = execOf(mod.claimnexttask);
    let claim1 = JSON.parse(await claim({ dbPath, agent_id: 'agent-A' }));
    expect(claim1.ok).toBe(true);
    expect(claim1.task.title).toBe('high-pri');

    let claim2 = JSON.parse(await claim({ dbPath, agent_id: 'agent-B' }));
    expect(claim2.ok).toBe(true);
    expect(claim2.task.title).toBe('low-pri');

    let claim3 = JSON.parse(await claim({ dbPath, agent_id: 'agent-C' }));
    expect(claim3.ok).toBe(true);
    expect(claim3.task).toBe(null);
  });

  it('marks tasks done and failed', async () => {
    const init = execOf(mod.inittasksdb);
    await init({ dbPath });
    const create = execOf(mod.createtask);
    const created = JSON.parse(await create({ dbPath, title: 'work', payload_json: '{}' }));

    const done = execOf(mod.marktaskdone);
    const resDone = JSON.parse(await done({ dbPath, id: String(created.task.id) }));
    expect(resDone.ok).toBe(true);
    expect(resDone.task.state).toBe('done');

    const failed = execOf(mod.marktaskfailed);
    const created2 = JSON.parse(await create({ dbPath, title: 'work2', payload_json: '{}' }));
    const resFail = JSON.parse(await failed({ dbPath, id: String(created2.task.id), error_text: 'boom' }));
    expect(resFail.ok).toBe(true);
    expect(resFail.task.state).toBe('failed');
    expect(resFail.task.error_text).toBe('boom');
  });
});
