import { tool } from "@opencode-ai/plugin";
import { Database } from "bun:sqlite";
import { mkdir } from "fs/promises";
import path from "path";

function openDb(dbPath: string) {
  const db = new Database(dbPath);
  // PRAGMAs for concurrency and durability balance
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA temp_store = MEMORY");
  return db;
}

function ensureSchema(db: Database) {
  db.run(`
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
    CREATE TABLE IF NOT EXISTS task_agent_checks (
      task_id     INTEGER NOT NULL,
      agent_id    TEXT NOT NULL,
      role        TEXT,
      status      TEXT NOT NULL CHECK (status IN ('pending','done')) DEFAULT 'pending',
      checked_at  DATETIME,
      PRIMARY KEY (task_id, agent_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_agent_checks_status ON task_agent_checks(task_id, status);
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
      ensureSchema(db);
      db.close();
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
    expected_agents_json: tool.schema.string().optional().describe("JSON array of expected agent ids for checkoff"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureSchema(db);
      const stmt = db.prepare(
        `INSERT INTO tasks (title, payload_json, priority) VALUES (?, ?, ?)`
      );
      const info = stmt.run(args.title, args.payload_json, Number(args.priority ?? 100));
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(info.lastInsertRowid) as any;
  const taskId = row?.id ?? info.lastInsertRowid;
      if (args.expected_agents_json) {
        try {
          const parsed = JSON.parse(args.expected_agents_json);
          const agents: string[] = Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string' && a.trim().length > 0) : [];
          if (agents.length > 0) {
            const insert = db.prepare(`INSERT OR IGNORE INTO task_agent_checks(task_id, agent_id, status) VALUES(?, ?, 'pending')`);
            for (const agent of agents) {
              insert.run(taskId, agent.trim());
            }
          }
        } catch {
          // ignore bad json, do not fail task creation
        }
      }
      db.close();
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
      ensureSchema(db);
      const begin = db.prepare("BEGIN IMMEDIATE");
      const selectNext = db.prepare(
        `SELECT id FROM tasks WHERE state = 'queued' ORDER BY priority ASC, created_at ASC LIMIT 1`
      );
      const updateClaim = db.prepare(
        `UPDATE tasks
         SET state='in_progress', agent_id=?, started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND state='queued'`
      );
      const getById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

      begin.run();
      const row = selectNext.get() as { id: number } | undefined;
      if (!row) {
        db.prepare("COMMIT").run();
        db.close();
        return JSON.stringify({ ok: true, task: null });
      }
      const res = updateClaim.run(args.agent_id, row.id);
      db.prepare("COMMIT").run();
      const claimed = res.changes === 1 ? getById.get(row.id) : null;
      db.close();
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
      ensureSchema(db);
      const stmt = db.prepare(
        `UPDATE tasks SET state='done', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error_text=NULL WHERE id = ?`
      );
      const res = stmt.run(Number(args.id));
      const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(Number(args.id));
      db.close();
      return JSON.stringify({ ok: res.changes === 1, task: row });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});

export const checkofftask = tool({
  description: "Mark an agent's checkoff status for a task",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    task_id: tool.schema.string().describe("Task ID"),
    agent_id: tool.schema.string().describe("Agent ID performing the checkoff"),
    role: tool.schema.string().optional().describe("Optional role or note for the agent")
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureSchema(db);
      const taskId = Number(args.task_id);
      const agentId = String(args.agent_id);
      const role = args.role ? String(args.role) : null;

      // ensure row exists
      const upsert = db.prepare(`INSERT OR IGNORE INTO task_agent_checks(task_id, agent_id, role) VALUES(?, ?, ?)`);
      upsert.run(taskId, agentId, role);

      const update = db.prepare(`UPDATE task_agent_checks SET status='done', role=COALESCE(?, role), checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE task_id=? AND agent_id=?`);
      const res = update.run(role, taskId, agentId);
      const row = db.prepare(`SELECT * FROM task_agent_checks WHERE task_id=? AND agent_id=?`).get(taskId, agentId);
      db.close();
      return JSON.stringify({ ok: res.changes === 1, check: row });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
});

export const listtaskchecks = tool({
  description: "List agent checkoff status for a task",
  args: {
    dbPath: tool.schema.string().optional().describe("Path to sqlite DB").default(DEFAULT_DB),
    task_id: tool.schema.string().describe("Task ID"),
  },
  async execute(args) {
    try {
      const db = openDb(args.dbPath || DEFAULT_DB);
      ensureSchema(db);
      const rows = db.prepare(`SELECT agent_id, role, status, checked_at FROM task_agent_checks WHERE task_id=? ORDER BY agent_id ASC`).all(Number(args.task_id));
      db.close();
      return JSON.stringify({ ok: true, checks: rows });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  }
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
      ensureSchema(db);
      const stmt = db.prepare(
        `UPDATE tasks SET state='failed', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error_text=? WHERE id = ?`
      );
      const res = stmt.run(args.error_text, Number(args.id));
      const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(Number(args.id));
      db.close();
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
      ensureSchema(db);
      const query = args.state
        ? `SELECT * FROM tasks WHERE state = ? ORDER BY priority ASC, created_at ASC`
        : `SELECT * FROM tasks ORDER BY state ASC, priority ASC, created_at ASC`;
      const stmt = db.prepare(query);
      const rows = args.state ? stmt.all(args.state) : stmt.all();
      db.close();
      return JSON.stringify({ ok: true, tasks: rows });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  },
});
