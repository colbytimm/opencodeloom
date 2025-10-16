import { tool } from "@opencode-ai/plugin";
import { readFile } from "fs/promises";
import path from "path";

function redact(s: string) {
  if (!s) return s;
  const len = Math.min(4, Math.floor(s.length / 4));
  return `${s.slice(0, len)}****${s.slice(-len)}`;
}

async function loadAllowlist(root: string): Promise<string[] | null> {
  try {
    const raw = await readFile(path.join(root, ".opencode", "secrets", "allowlist.json"), "utf-8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch { return null; }
}

export const getsecret = tool({
  description: "Get a secret by key from .opencode/secrets/<KEY>. Returns redacted preview. Enforces optional .opencode/secrets/allowlist.json.",
  args: { key: tool.schema.string().describe("Secret key filename, e.g. GITHUB_TOKEN") },
  async execute(args) {
    try {
      const root = process.cwd();
      const allow = await loadAllowlist(root);
      if (allow && !allow.includes(args.key)) {
        return JSON.stringify({ ok: false, error: `Secret key not allowed by allowlist: ${args.key}` });
      }
      const file = path.join(root, ".opencode", "secrets", args.key);
      const val = (await readFile(file, "utf-8")).trim();
      return JSON.stringify({ ok: true, key: args.key, value: redact(val) });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});
