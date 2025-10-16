import { tool } from "@opencode-ai/plugin";
import Database from "better-sqlite3";
import { mkdir } from "fs/promises";
import path from "path";

function openDb(dbPath: string) {
  const db = new Database(dbPath);
  // PRAGMAs for concurrency and durability balance
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  return db;
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id            INTEGER PRIMARY KEY,
      title         TEXT NOT NULL,
      payload_json  TEXT NOT NULL,
      priority      INTEGER NOT NULL DEFAULT 100,
      state         TEXT NOT NULL CHECK (state IN ('queued','in_progress','done','failed')) DEFAULT 'queued',
      agent_id      TEXT,
      created_at    DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      started_at    DATETIME,
      finished_at   DATETIME,
      error_text    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_state_pri_created ON tasks(state, priority, created_at);
  `);
}

const DEFAULT_DB = ".opencode/state/tasks.db";

export const inittasksdb = tool({
  description: "Initialize the SQLite task DB with pragmas and schema",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
  },
  async execute(args) {
    try {
      const dbPath = args.dbPath || DEFAULT_DB;
      await mkdir(path.dirname(dbPath), { recursive: true });
      const db = openDb(dbPath);
      ensureSchema(db as any);
      (db as any).close();
      return JSON.stringify({ ok: true, dbPath });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});

export const createtask = tool({
  description: "Create a new task in the queue",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    title: tool.schema.string().describe("Task title"),
    payload_json: tool.schema.string().describe("Task JSON payload for agents"),
    priority: tool.schema.string().optional().describe("Lower number = higher priority").default("100"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureSchema(db as any);
      const stmt = (db as any).prepare(
        `INSERT INTO tasks (title, payload_json, priority) VALUES (?, ?, ?)`
      );
      const info = stmt.run(args.title, args.payload_json, Number(args.priority ?? 100));
      const row = (db as any).prepare(`SELECT * FROM tasks WHERE id = ?`).get(info.lastInsertRowid);
      (db as any).close();
      return JSON.stringify({ ok: true, task: row });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});

export const claimnexttask = tool({
  description: "Atomically claim the next queued task ordered by priority,created_at",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    agent_id: tool.schema.string().describe("Agent identifier claiming the task"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureSchema(db as any);
      const begin = (db as any).prepare("BEGIN IMMEDIATE");
      const selectNext = (db as any).prepare(
        `SELECT id FROM tasks WHERE state = 'queued' ORDER BY priority ASC, created_at ASC LIMIT 1`
      );
      const updateClaim = (db as any).prepare(
        `UPDATE tasks
         SET state='in_progress', agent_id=?, started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND state='queued'`
      );
      const getById = (db as any).prepare(`SELECT * FROM tasks WHERE id = ?`);

      begin.run();
      const row = selectNext.get();
      if (!row) {
        (db as any).prepare("COMMIT").run();
        (db as any).close();
        return JSON.stringify({ ok: true, task: null });
      }
      const res = updateClaim.run(args.agent_id, row.id);
      (db as any).prepare("COMMIT").run();
      const claimed = res.changes === 1 ? getById.get(row.id) : null;
      (db as any).close();
      return JSON.stringify({ ok: true, task: claimed });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});

export const marktaskdone = tool({
  description: "Mark a task as done",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    id: tool.schema.string().describe("Task ID"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      const stmt = (db as any).prepare(
        `UPDATE tasks SET state='done', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error_text=NULL WHERE id = ?`
      );
      const res = stmt.run(Number(args.id));
      const row = (db as any).prepare(`SELECT * FROM tasks WHERE id = ?`).get(Number(args.id));
      (db as any).close();
      return JSON.stringify({ ok: res.changes === 1, task: row });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});

export const marktaskfailed = tool({
  description: "Mark a task as failed with an error message",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    id: tool.schema.string().describe("Task ID"),
    error_text: tool.schema.string().describe("Error details"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      const stmt = (db as any).prepare(
        `UPDATE tasks SET state='failed', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error_text=? WHERE id = ?`
      );
      const res = stmt.run(args.error_text, Number(args.id));
      const row = (db as any).prepare(`SELECT * FROM tasks WHERE id = ?`).get(Number(args.id));
      (db as any).close();
      return JSON.stringify({ ok: res.changes === 1, task: row });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});

export const listtasks = tool({
  description: "List tasks, optionally filtered by state",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    state: tool.schema.string().optional().describe("queued|in_progress|done|failed"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureSchema(db as any);
      const query = args.state
        ? `SELECT * FROM tasks WHERE state = ? ORDER BY priority ASC, created_at ASC`
        : `SELECT * FROM tasks ORDER BY state ASC, priority ASC, created_at ASC`;
      const stmt = (db as any).prepare(query);
      const rows = args.state ? stmt.all(args.state) : stmt.all();
      (db as any).close();
      return JSON.stringify({ ok: true, tasks: rows });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});
