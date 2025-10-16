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
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  rmdir: vi.fn(),
}));
vi.mock('child_process', () => ({ exec: vi.fn() }));
let execAsyncMock: any;
vi.mock('util', async (orig) => {
  const actual = await (orig as any)();
  execAsyncMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
  return { ...actual, promisify: (_fn: any) => execAsyncMock };
});

import { mkdir, rmdir } from 'fs/promises';
const WorktreeMod: any = await import(new URL('../../.opencode/tool/worktree-tool.ts', import.meta.url).href);

function getExecute(toolExport: any) {
  return toolExport?.execute ?? toolExport;
}

describe('worktree-tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    expect(execAsyncMock).toHaveBeenCalledTimes(4);
    expect(execAsyncMock).toHaveBeenNthCalledWith(1, 'git -C ./ fetch --prune --tags origin');
    expect(execAsyncMock).toHaveBeenNthCalledWith(2, 'git -C ./ checkout main');
    expect(execAsyncMock).toHaveBeenNthCalledWith(3, 'git -C ./ pull --ff-only origin main');
    expect(execAsyncMock).toHaveBeenNthCalledWith(4, 'git -C ./ worktree add -B feat/TEST-1 ./.worktrees/TEST-1 main');
  });

  it('deleteworktree returns ok when removal succeeds', async () => {
    (rmdir as any).mockResolvedValueOnce(undefined);

    const execFn = getExecute((WorktreeMod as any).deleteworktree);
    const out = await execFn({ taskId: 'TEST-1', repoPath: '.', worktreeDir: '.worktrees', branchPrefix: 'feat' });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);

    expect(rmdir).toHaveBeenCalledWith('./.worktrees/TEST-1', { recursive: true });
    expect(execAsyncMock).toHaveBeenCalledTimes(1);
    expect(execAsyncMock).toHaveBeenCalledWith('git -C ./ worktree remove ./.worktrees/TEST-1');
  });
});
