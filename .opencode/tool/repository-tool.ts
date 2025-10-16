import { tool } from "@opencode-ai/plugin";
import { readFile, access } from "fs/promises";
import { homedir } from "os";
import path from "path";
import zod from 'zod';

const repositorySchema = zod.object({
  id: zod.string(),
  description: zod.string().optional(),
  path: zod.string(),
  language: zod.string(),
  framework: zod.string(),
  packageManager: zod.string().optional(),
  scripts: zod.object({
    testUnit: zod.string().optional(),
    testIntegration: zod.string().optional(),
    lint: zod.string().optional(),
    format: zod.string().optional(),
    build: zod.string().optional(),
  })
});

export const getrepository = tool({
  description: "Get the current repository information",
  args: {
    repositoryId: tool.schema.string().describe("Repository ID"),
  },
  async execute(args) {
      try {
        const repositoryFile = await readFile(new URL('../repos.json', import.meta.url), 'utf-8');
        const repositories = repositorySchema.array().parse(JSON.parse(repositoryFile));
        const repository = repositories.find(repo => repo.id === args.repositoryId);
        if (!repository) {
          throw new Error(`Repository with ID ${args.repositoryId} not found`);
        }
        const resolvedPath = path.resolve(repository.path.replace(/^~(?=$|\/)/, homedir()));
        await access(resolvedPath).catch(() => {
          throw new Error(`Repository path ${resolvedPath} is missing or inaccessible`);
        });
        return JSON.stringify({ ok: true, repository: { ...repository, path: resolvedPath } });
      } catch (e) {
        return JSON.stringify({ ok: false, repositoryId: args.repositoryId, error: String(e) });
      }
  },
});

export const listrepositories = tool({
  description: "List all available repositories",
  args: {},
  async execute() {
      try {
        const repositoryFile = await readFile(new URL('../repos.json', import.meta.url), 'utf-8');
        const repositories = repositorySchema.array().parse(JSON.parse(repositoryFile)).map(repo => ({
          ...repo,
          path: path.resolve(repo.path.replace(/^~(?=$|\/)/, homedir())),
        }));
        if (repositories.length === 0) {
          throw new Error("No repositories found");
        }
        const missingRepos: string[] = [];
        for (const repo of repositories) {
          try {
            await access(repo.path);
          } catch {
            missingRepos.push(repo.path);
          }
        }
        if (missingRepos.length > 0) {
          throw new Error(`The following repositories are missing or inaccessible: ${missingRepos.join(', ')}`);
        }
        return JSON.stringify({ ok: true, repositories });
      } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
      }
  },
});
