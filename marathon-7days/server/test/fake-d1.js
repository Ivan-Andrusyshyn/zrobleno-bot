// Імітація Cloudflare D1 поверх справжнього SQLite (node:sqlite) — для тестів
import { DatabaseSync } from "node:sqlite";

export function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() { sqlite.prepare(sql).run(...args); return { success: true }; },
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    _exec() {
      const p = sqlite.prepare(sql);
      return /^\s*(SELECT|WITH)/i.test(sql) ? { results: p.all(...args) } : (p.run(...args), { results: [] });
    },
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) { return list.map((s) => s._exec()); },
    sqlite,
  };
}
