import { tool } from "@opencode-ai/plugin";
import { mkdir, rmdir } from "fs/promises";
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; delayMs?: number } = {}) {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 250;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

export const createworktree = tool({
  description: "Create a git worktree for a task",
  args: {
    taskId: tool.schema.string().describe("Task ID"),
    branchPrefix: tool.schema.string().optional().describe("Branch prefix").default("feat"),
    worktreeDir: tool.schema.string().optional().describe("Worktree directory").default(".worktrees"),
    repoPath: tool.schema
      .string()
      .optional()
      .describe("Repository path")
      .default(".."),
    baseBranch: tool.schema
      .string()
      .optional()
      .describe("Base branch to branch from and pull before creating worktree")
      .default("main"),
    pullLatest: tool.schema
      .string()
      .optional()
      .describe("Whether to pull latest from origin for base branch before creating worktree (true/false)")
      .default("true"),
  },
  async execute(args) {
      const repoPath = args.repoPath.endsWith("/") ? args.repoPath : `${args.repoPath}/`;
      const branch = `${args.branchPrefix}/${args.taskId}`;
      const worktreeRoot = `${repoPath}${args.worktreeDir}`;
      const path = `${worktreeRoot}/${args.taskId}`;
      const baseBranch = args.baseBranch ?? "main";
      const pullLatest = String(args.pullLatest ?? "true").toLowerCase() === "true";
      try {
        await mkdir(worktreeRoot, { recursive: true });
        if (pullLatest) {
          await withRetry(() => execAsync(`git -C ${repoPath} fetch --prune --tags origin`));
          await withRetry(() => execAsync(`git -C ${repoPath} checkout ${baseBranch}`));
          await withRetry(() => execAsync(`git -C ${repoPath} pull --ff-only origin ${baseBranch}`));
        }
        await withRetry(() => execAsync(`git -C ${repoPath} worktree add -B ${branch} ${path} ${baseBranch}`));
        return JSON.stringify({ ok: true, branch, path, baseBranch, pulled: pullLatest });
      } catch (e) {
        return JSON.stringify({ ok: false, branch, path, baseBranch, pulled: pullLatest, error: String(e) });
      }
  },
});

export const deleteworktree = tool({
  description: "Delete a git worktree for a task",
  args: {
    taskId: tool.schema.string().describe("Task ID"),
    branchPrefix: tool.schema.string().optional().describe("Branch prefix").default("feat"),
    worktreeDir: tool.schema.string().optional().describe("Worktree directory").default(".worktrees"),
    repoPath: tool.schema
      .string()
      .optional()
      .describe("Repository path")
      .default(".."),
  },
  async execute(args) {
    const repoPath = args.repoPath.endsWith("/") ? args.repoPath : `${args.repoPath}/`;
    const branch = `${args.branchPrefix}/${args.taskId}`;
    const worktreeRoot = `${repoPath}${args.worktreeDir}`;
    const path = `${worktreeRoot}/${args.taskId}`;
    try {
      await rmdir(path, { recursive: true });
      await execAsync(`git -C ${repoPath} worktree remove ${path}`);
      return JSON.stringify({ ok: true, branch, path });
    } catch (e) {
      return JSON.stringify({ ok: false, branch, path, error: String(e) });
    }
  },
});
