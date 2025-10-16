import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));
vi.mock('os', () => ({ homedir: () => '/home/test' }));
vi.mock('path', () => ({
  default: {
    resolve: (...parts: string[]) => parts.join('/').replace(/\\+/g, '/'),
  },
}));

import { readFile, access } from 'fs/promises';

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
const RepoToolMod: any = await import(new URL('../../.opencode/tool/repository-tool.ts', import.meta.url).href);

function getExecute(toolExport: any) {
  return toolExport?.execute ?? toolExport;
}

describe('repository-tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('listrepositories returns ok with repositories when all accessible', async () => {
    (readFile as any).mockResolvedValueOnce(JSON.stringify([
      { id: 'repo1', path: '~/code/repo1', language: 'ts', framework: 'node', scripts: {} },
    ]));
    (access as any).mockResolvedValueOnce(undefined);

    const execFn = getExecute((RepoToolMod as any).listrepositories);
    const out = await execFn({});
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.repositories)).toBe(true);
    expect(parsed.repositories[0].path).toContain('/home/test');
  });

  it('listrepositories returns error when any repo missing', async () => {
    (readFile as any).mockResolvedValueOnce(JSON.stringify([
      { id: 'repo1', path: '~/code/repo1', language: 'ts', framework: 'node', scripts: {} },
      { id: 'repo2', path: '~/code/repo2', language: 'ts', framework: 'node', scripts: {} },
    ]));
    (access as any)
      .mockResolvedValueOnce(undefined) // repo1 ok
      .mockRejectedValueOnce(new Error('missing')); // repo2 missing

    const execFn = getExecute((RepoToolMod as any).listrepositories);
    const out = await execFn({});
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toContain('missing or inaccessible');
  });

  it('getrepository returns ok and resolved path when found and accessible', async () => {
    (readFile as any).mockResolvedValueOnce(JSON.stringify([
      { id: 'repo1', path: '~/code/repo1', language: 'ts', framework: 'node', scripts: {} },
    ]));
    (access as any).mockResolvedValueOnce(undefined);

    const execFn = getExecute((RepoToolMod as any).getrepository);
    const out = await execFn({ repositoryId: 'repo1' });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.repository.path).toContain('/home/test');
  });

  it('getrepository returns error when repo not found', async () => {
    (readFile as any).mockResolvedValueOnce(JSON.stringify([]));

    const execFn = getExecute((RepoToolMod as any).getrepository);
    const out = await execFn({ repositoryId: 'missing' });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toContain('not found');
  });
});
