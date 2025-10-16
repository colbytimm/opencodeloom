import { tool } from "@opencode-ai/plugin";
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
const execAsync = promisify(exec);

async function run(cmd: string) {
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { ok: true, stdout, stderr };
  } catch (e: any) {
    return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? String(e) };
  }
}

export const securityscan = tool({
  description: "Run Semgrep and OSV-Scanner; store outputs under .artifacts/security.",
  args: {
    repoPath: tool.schema.string().optional().default('.'),
    artifactsDir: tool.schema.string().optional().default('.artifacts/security'),
    semgrepConfig: tool.schema.string().optional().describe('Semgrep ruleset, e.g. p/ci or a URL').default('p/ci'),
    osvLockfile: tool.schema.string().optional().describe('Path to package-lock.json or lockfile for OSV-Scanner').default('package-lock.json'),
  },
  async execute(args) {
    const repoPath = args.repoPath;
    const outDir = path.isAbsolute(args.artifactsDir) ? args.artifactsDir : path.join(repoPath, args.artifactsDir);
    await mkdir(outDir, { recursive: true });

    const semgrepJson = path.join(outDir, 'semgrep.json');
    const osvJson = path.join(outDir, 'osv.json');

    const semgrep = await run(`semgrep --config ${args.semgrepConfig} --json --quiet --error --skip-unknown-extensions --exclude .worktrees --exclude .artifacts -o ${semgrepJson} ${repoPath}`);
    const osv = await run(`osv-scanner --lockfile=${path.join(repoPath, args.osvLockfile)} --json > ${osvJson}`);

    const result = { ok: semgrep.ok && osv.ok, semgrepOk: semgrep.ok, osvOk: osv.ok, artifacts: { semgrep: semgrepJson, osv: osvJson } };
    await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(result, null, 2), 'utf-8');
    return JSON.stringify(result);
  }
});
