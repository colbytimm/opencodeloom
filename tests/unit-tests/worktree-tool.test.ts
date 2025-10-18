import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@opencode-ai/plugin', () => {
  const schemaBase = {
    describe() { return this; },
    optional() { return this; },
    default() { return this; },
    transform() { return this; },
  };
  const schema = {
    string: () => ({ ...schemaBase }),
  };
  return {
    tool: Object.assign((def: any) => def, { schema }),
  };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  rmdir: vi.fn(),
}));
vi.mock('child_process', () => ({ exec: vi.fn() }));
const execAsyncMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
vi.mock('util', () => ({
  promisify: () => execAsyncMock,
}));

import { mkdir, rmdir } from 'fs/promises';
const WorktreeMod: any = await import(new URL('../../.opencode/tool/worktree-tool.ts', import.meta.url).href);

function getExecute(toolExport: any) {
  return toolExport?.execute ?? toolExport;
}

describe('worktree-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execAsyncMock.mockReset();
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('createworktree returns ok and constructs paths correctly', async () => {
    (mkdir as any).mockResolvedValueOnce(undefined);

    const execFn = getExecute((WorktreeMod as any).createworktree);
    const out = await execFn({ taskId: 'TEST-1', repoPath: '.', worktreeDir: '.worktrees', branchPrefix: 'feat', baseBranch: 'main', pullLatest: 'true' });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.branch).toBe('feat/TEST-1');
    expect(parsed.path).toContain('.worktrees/TEST-1');
    expect(parsed.baseBranch).toBe('main');
    expect(parsed.pulled).toBe(true);

    expect(mkdir).toHaveBeenCalledWith('./.worktrees', { recursive: true });
  });

  it('deleteworktree returns ok when removal succeeds', async () => {
    (rmdir as any).mockResolvedValueOnce(undefined);

    const execFn = getExecute((WorktreeMod as any).deleteworktree);
    const out = await execFn({ taskId: 'TEST-1', repoPath: '.', worktreeDir: '.worktrees', branchPrefix: 'feat' });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);

    expect(rmdir).toHaveBeenCalledWith('./.worktrees/TEST-1', { recursive: true });
  });
});
