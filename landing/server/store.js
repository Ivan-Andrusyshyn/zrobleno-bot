// База Cloudflare D1 (SQLite). Таблиці створюються автоматично при першому запиті.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // пости каналу в групі коментарів: kind = 'day' (є «День N») або 'info'
  `CREATE TABLE IF NOT EXISTS threads (
     chat_id TEXT NOT NULL, msg_id INTEGER NOT NULL, kind TEXT NOT NULL, num INTEGER,
     created_at TEXT NOT NULL, PRIMARY KEY (chat_id, msg_id))`,
  `CREATE TABLE IF NOT EXISTS participants (
     user_id INTEGER PRIMARY KEY, tg_name TEXT, name TEXT, habit TEXT, minimum TEXT, why TEXT,
     hidden INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL)`,
  // одна відмітка на людину на день; нова перезаписує стару
  `CREATE TABLE IF NOT EXISTS checkins (
     user_id INTEGER NOT NULL, day INTEGER NOT NULL, status TEXT NOT NULL, note TEXT, text TEXT,
     msg_id INTEGER, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, day))`,
];

let schemaReady = null;
const now = () => new Date().toISOString();

export async function store(db) {
  if (!db) throw new Error("Немає бази D1: додай binding DB (Settings → Bindings → D1)");
  if (!schemaReady) schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  await schemaReady;

  return {
    /** Налаштування як обʼєкт: { admins: [...], groupId, groupTitle, startDate } */
    async all() {
      const { results } = await db.prepare("SELECT key, value FROM settings").all();
      return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
    },
    async set(fields) {
      await db.batch(Object.entries(fields).map(([k, v]) =>
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(k, JSON.stringify(v ?? null))));
    },

    async saveThread(chatId, msgId, kind, num) {
      await db.prepare("INSERT OR REPLACE INTO threads (chat_id, msg_id, kind, num, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(String(chatId), msgId, kind, num ?? null, now()).run();
    },
    async thread(chatId, msgId) {
      return db.prepare("SELECT kind, num, created_at FROM threads WHERE chat_id = ? AND msg_id = ?").bind(String(chatId), msgId).first();
    },
    async maxDay() {
      const r = await db.prepare("SELECT MAX(num) AS d FROM threads WHERE kind = 'day'").first();
      return r?.d ?? 0;
    },

    async touchParticipant(userId, tgName) {
      await db.prepare(
        "INSERT INTO participants (user_id, tg_name, joined_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET tg_name = excluded.tg_name",
      ).bind(userId, tgName, now()).run();
    },
    async saveProfile(userId, p) {
      await db.prepare("UPDATE participants SET name = ?, habit = ?, minimum = ?, why = ? WHERE user_id = ?")
        .bind(p.name ?? null, p.habit ?? null, p.minimum ?? null, p.why ?? null, userId).run();
    },
    async setHidden(userId, hidden) {
      await db.prepare("UPDATE participants SET hidden = ? WHERE user_id = ?").bind(hidden ? 1 : 0, userId).run();
    },

    async saveCheckin(userId, day, status, note, text, msgId) {
      await db.prepare(
        "INSERT INTO checkins (user_id, day, status, note, text, msg_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(user_id, day) DO UPDATE SET status = excluded.status, note = excluded.note, text = excluded.text, msg_id = excluded.msg_id, updated_at = excluded.updated_at",
      ).bind(userId, day, status, note ?? null, text ?? null, msgId ?? null, now()).run();
    },

    async participantsWithCheckins() {
      const [p, c] = await db.batch([
        db.prepare("SELECT user_id AS userId, tg_name AS tgName, name, habit, minimum, why FROM participants WHERE hidden = 0 ORDER BY joined_at"),
        db.prepare("SELECT c.user_id AS userId, c.day, c.status, c.text, c.updated_at AS updatedAt FROM checkins c JOIN participants p ON p.user_id = c.user_id WHERE p.hidden = 0"),
      ]);
      return { people: p.results, marks: c.results };
    },

    async counts(day) {
      const r = await db.batch([
        db.prepare("SELECT COUNT(*) AS n FROM participants"),
        db.prepare("SELECT COUNT(*) AS n FROM checkins WHERE day = ?").bind(day),
        db.prepare("SELECT COUNT(*) AS n FROM threads WHERE kind = 'day'"),
      ]);
      return { participants: r[0].results[0].n, today: r[1].results[0].n, dayPosts: r[2].results[0].n };
    },
  };
}

/** Для тестів: скинути кеш схеми */
export function __resetSchemaForTests() { schemaReady = null; }
