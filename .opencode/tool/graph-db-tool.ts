import { tool } from "@opencode-ai/plugin";
import { Database } from "bun:sqlite";
import { mkdir } from 'fs/promises';
import path from 'path';

const DEFAULT_DB = ".opencode/state/tasks.db";

function openDb(dbPath: string) {
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA temp_store = MEMORY");
  return db;
}

function ensureGraphSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS issues (
      issue_id TEXT PRIMARY KEY,
      meta_json TEXT
    );
    CREATE TABLE IF NOT EXISTS issue_tasks (
      issue_id TEXT NOT NULL,
      task_id  TEXT NOT NULL,
      title    TEXT NOT NULL,
      summary  TEXT,
      acceptance_json TEXT,
      skills_json TEXT,
      repo_paths_json TEXT,
      agents_json TEXT,
      PRIMARY KEY (issue_id, task_id),
      FOREIGN KEY (issue_id) REFERENCES issues(issue_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS issue_task_deps (
      issue_id TEXT NOT NULL,
      task_id  TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      PRIMARY KEY (issue_id, task_id, depends_on),
      FOREIGN KEY (issue_id, task_id) REFERENCES issue_tasks(issue_id, task_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS issue_task_state (
      issue_id TEXT NOT NULL,
      task_id  TEXT NOT NULL,
      state    TEXT NOT NULL CHECK (state IN ('new','queued','in_progress','done','failed')) DEFAULT 'new',
      PRIMARY KEY (issue_id, task_id),
      FOREIGN KEY (issue_id, task_id) REFERENCES issue_tasks(issue_id, task_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_issue_task_state ON issue_task_state(issue_id, state);
  `);
  try { db.run("ALTER TABLE issue_tasks ADD COLUMN agents_json TEXT"); } catch { /* ignore if exists */ }
}

function normalizeAgentsList(input: any): string[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!seen.has(trimmed)) {
      cleaned.push(trimmed);
      seen.add(trimmed);
    }
  }
  const reviewerIndex = cleaned.indexOf('reviewer');
  if (reviewerIndex >= 0) {
    const codeQualityIndex = cleaned.indexOf('code-quality');
    if (codeQualityIndex === -1) {
      cleaned.splice(reviewerIndex, 0, 'code-quality');
    } else if (codeQualityIndex > reviewerIndex) {
      cleaned.splice(codeQualityIndex, 1);
      cleaned.splice(reviewerIndex, 0, 'code-quality');
    }
  }
  return cleaned;
}

export const initgraphtables = tool({
  description: "Initialize graph tables in the SQLite DB",
  args: {
    dbPath: tool.schema.string().optional().default(DEFAULT_DB),
  },
  async execute(args) {
    try {
      const dbPath = args.dbPath || DEFAULT_DB;
      await mkdir(path.dirname(dbPath), { recursive: true });
      const db = openDb(dbPath);
      ensureGraphSchema(db);
      db.close();
      return JSON.stringify({ ok: true, dbPath });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});

export const importgraph = tool({
  description: "Import a task graph JSON into DB tables for an issue",
  args: {
    dbPath: tool.schema.string().optional().default(DEFAULT_DB),
    issue_id: tool.schema.string().describe('Issue identifier'),
    graph_json: tool.schema.string().describe('Task graph JSON string'),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureGraphSchema(db);
      const graph = JSON.parse(args.graph_json);
      const tasks = Array.isArray(graph.tasks) ? graph.tasks : [];
      const meta = JSON.stringify({ version: graph.version ?? 'v1', risks: graph.risks ?? [], assumptions: graph.assumptions ?? [] });

      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM issue_task_deps WHERE issue_id = ?`).run(args.issue_id);
        db.prepare(`DELETE FROM issue_task_state WHERE issue_id = ?`).run(args.issue_id);
        db.prepare(`DELETE FROM issue_tasks WHERE issue_id = ?`).run(args.issue_id);
        db.prepare(`INSERT OR REPLACE INTO issues(issue_id, meta_json) VALUES(?, ?)`).run(args.issue_id, meta);

  const insTask = db.prepare(`INSERT OR REPLACE INTO issue_tasks(issue_id, task_id, title, summary, acceptance_json, skills_json, repo_paths_json, agents_json) VALUES(?,?,?,?,?,?,?,?)`);
        const insState = db.prepare(`INSERT OR IGNORE INTO issue_task_state(issue_id, task_id, state) VALUES(?, ?, 'new')`);
        const insDep = db.prepare(`INSERT OR IGNORE INTO issue_task_deps(issue_id, task_id, depends_on) VALUES(?,?,?)`);

        for (const t of tasks) {
          const agents = normalizeAgentsList((t as any).agents);
          insTask.run(
            args.issue_id,
            t.id,
            t.title ?? t.id,
            t.summary ?? null,
            JSON.stringify(t.acceptance_criteria ?? []),
            JSON.stringify(t.skills ?? []),
            JSON.stringify(t.repo_paths ?? []),
            JSON.stringify(agents)
          );
          insState.run(args.issue_id, t.id);
          const deps = Array.isArray(t.deps) ? t.deps : [];
          for (const d of deps) insDep.run(args.issue_id, t.id, d);
        }
      });
      tx();
      db.close();
      return JSON.stringify({ ok: true, tasks: tasks.length });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});

export const setgraphstate = tool({
  description: "Set graph state for a single task",
  args: {
    dbPath: tool.schema.string().optional().default(DEFAULT_DB),
    issue_id: tool.schema.string(),
    task_id: tool.schema.string(),
    state: tool.schema.string().describe("new|queued|in_progress|done|failed"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureGraphSchema(db);
      const stmt = db.prepare(`INSERT INTO issue_task_state(issue_id, task_id, state) VALUES(?,?,?) ON CONFLICT(issue_id, task_id) DO UPDATE SET state=excluded.state`);
      stmt.run(args.issue_id, args.task_id, args.state);
      db.close();
      return JSON.stringify({ ok: true });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});

export const computeready = tool({
  description: "Compute ready tasks (all deps done) for an issue",
  args: {
    dbPath: tool.schema.string().optional().default(DEFAULT_DB),
    issue_id: tool.schema.string(),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureGraphSchema(db);
      const sql = `
  SELECT t.task_id as id, t.title, t.summary, t.acceptance_json, t.skills_json, t.repo_paths_json, t.agents_json
        FROM issue_tasks t
        LEFT JOIN issue_task_state s ON s.issue_id=t.issue_id AND s.task_id=t.task_id
        WHERE t.issue_id=? AND COALESCE(s.state,'new')='new' AND NOT EXISTS (
          SELECT 1 FROM issue_task_deps d
          LEFT JOIN issue_task_state sd ON sd.issue_id=d.issue_id AND sd.task_id=d.depends_on
          WHERE d.issue_id=t.issue_id AND d.task_id=t.task_id AND COALESCE(sd.state,'new')<>'done'
        )
      `;
      const rows = db.prepare(sql).all(args.issue_id) as any[];
      db.close();
      const tasks = rows.map(r => ({
        id: r.id,
        title: r.title,
        summary: r.summary ?? undefined,
        acceptance_criteria: safeParseJson(r.acceptance_json, []),
        skills: safeParseJson(r.skills_json, []),
        repo_paths: safeParseJson(r.repo_paths_json, []),
        agents: normalizeAgentsList(safeParseJson(r.agents_json, [])),
      }));
      return JSON.stringify({ ok: true, tasks });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});

export const listgraph = tool({
  description: "List all tasks in an issue with state and deps",
  args: {
    dbPath: tool.schema.string().optional().default(DEFAULT_DB),
    issue_id: tool.schema.string(),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureGraphSchema(db);
  const tasks = db.prepare(`SELECT t.task_id as id, t.title, t.summary, t.acceptance_json, t.skills_json, t.repo_paths_json, t.agents_json, COALESCE(s.state,'new') as state FROM issue_tasks t LEFT JOIN issue_task_state s ON s.issue_id=t.issue_id AND s.task_id=t.task_id WHERE t.issue_id=?`).all(args.issue_id) as any[];
      const deps = db.prepare(`SELECT task_id, depends_on FROM issue_task_deps WHERE issue_id=?`).all(args.issue_id) as any[];
      db.close();
      const depMap = new Map<string, string[]>();
      for (const d of deps) {
        const arr = depMap.get(d.task_id) ?? [];
        arr.push(d.depends_on);
        depMap.set(d.task_id, arr);
      }
      const out = tasks.map(t => ({
        id: t.id,
        title: t.title,
        summary: t.summary ?? undefined,
        acceptance_criteria: safeParseJson(t.acceptance_json, []),
        skills: safeParseJson(t.skills_json, []),
        repo_paths: safeParseJson(t.repo_paths_json, []),
        agents: normalizeAgentsList(safeParseJson(t.agents_json, [])),
        state: t.state,
        deps: depMap.get(t.id) ?? [],
      }));
      return JSON.stringify({ ok: true, tasks: out });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});

function safeParseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback } catch { return fallback }
}
