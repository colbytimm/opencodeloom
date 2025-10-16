import { describe, it, expect, vi } from 'vitest';
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
const OrchestratorMod: any = await import(new URL('../../.opencode/plugin/workflow-orchestrator.ts', import.meta.url).href);

function shellMock() {
  const calls: string[] = [];
  const fn = (strings: TemplateStringsArray, ..._args: any[]) => {
    calls.push(strings.join(''));
    return Promise.resolve({});
  };
  return { fn, calls } as const;
}

describe('WorkflowOrchestrator', () => {
  it('exposes event hook without pre-execute file checks', async () => {
    const { fn: $, calls } = shellMock();
    const workflow = await OrchestratorMod.WorkflowOrchestrator({ $, project: {}, directory: '/tmp' });
    expect(typeof workflow.event).toBe('function');
  });


  it('posts a macOS notification on session.idle (best-effort, no throw)', async () => {
    const { fn: $, calls } = shellMock();
    const workflow = await OrchestratorMod.WorkflowOrchestrator({ $, project: {}, directory: '/tmp' });

    await workflow.event({ event: { type: 'session.idle' } });
    expect(calls.some(c => c.includes('display notification'))).toBe(true);
  });
});
