// База Cloudflare D1 (SQLite). Таблиці створюються автоматично при першому запиті.
//
// ПОТОКИ (з 17.11.2026). Кожен потік — свої 30 днів, своя група коментарів, свої відмітки й медалі.
// Правило: в одній групі одночасно йде лише один потік (наступний — після завершення попереднього).
// Учасник (participants) — один на всі потоки: імʼя, Telegram, історія. Звичка/мінімум — у stream_members.
//
// Старі таблиці checkins / awards лишились: для потоку №1 бот і далі дублює туди записи,
// щоб попередню версію бота можна було повернути без втрати жодної відмітки.

import { TOTAL_DAYS } from "./parse.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // пости каналу в групі коментарів: kind = 'day' (є «День N») або 'info'
  `CREATE TABLE IF NOT EXISTS threads (
     chat_id TEXT NOT NULL, msg_id INTEGER NOT NULL, kind TEXT NOT NULL, num INTEGER,
     created_at TEXT NOT NULL, PRIMARY KEY (chat_id, msg_id))`,
  `CREATE TABLE IF NOT EXISTS participants (
     user_id INTEGER PRIMARY KEY, tg_name TEXT, name TEXT, habit TEXT, minimum TEXT, why TEXT,
     hidden INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL)`,
  // СТАРА таблиця відміток (до потоків). Лише для відкату: потік №1 дублюється сюди.
  `CREATE TABLE IF NOT EXISTS checkins (
     user_id INTEGER NOT NULL, day INTEGER NOT NULL, status TEXT NOT NULL, note TEXT, text TEXT,
     msg_id INTEGER, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, day))`,
  // СТАРА таблиця нагород (до потоків). Лише для відкату: потік №1 дублюється сюди.
  `CREATE TABLE IF NOT EXISTS awards (
     user_id INTEGER NOT NULL, key TEXT NOT NULL, instant INTEGER NOT NULL, at TEXT NOT NULL,
     reported INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, key))`,

  // ---- потоки ----
  // status: 'active' (йде або стартує пізніше) | 'closed'. group_id = NULL — чекає на підключення групи.
  `CREATE TABLE IF NOT EXISTS streams (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, group_id TEXT, group_title TEXT,
     start_date TEXT, total_days INTEGER NOT NULL DEFAULT ${TOTAL_DAYS}, status TEXT NOT NULL DEFAULT 'active',
     awards_seeded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, closed_at TEXT)`,
  // учасник потоку: звичка саме в цьому потоці; результат — після закриття потоку
  `CREATE TABLE IF NOT EXISTS stream_members (
     stream_id INTEGER NOT NULL, user_id INTEGER NOT NULL, habit TEXT, minimum TEXT, why TEXT,
     joined_at TEXT NOT NULL, result_days INTEGER, finished INTEGER, PRIMARY KEY (stream_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS stream_checkins (
     stream_id INTEGER NOT NULL, user_id INTEGER NOT NULL, day INTEGER NOT NULL, status TEXT NOT NULL,
     note TEXT, text TEXT, msg_id INTEGER, updated_at TEXT NOT NULL, first_at TEXT,
     PRIMARY KEY (stream_id, user_id, day))`,
  `CREATE TABLE IF NOT EXISTS stream_awards (
     stream_id INTEGER NOT NULL, user_id INTEGER NOT NULL, key TEXT NOT NULL, instant INTEGER NOT NULL,
     at TEXT NOT NULL, reported INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (stream_id, user_id, key))`,
];

// Нові колонки для вже існуючих баз (додаються один раз; помилку «вже є» ігноруємо)
const MIGRATIONS = [
  `ALTER TABLE checkins ADD COLUMN first_at TEXT`,
  `ALTER TABLE threads ADD COLUMN stream_id INTEGER`,
];

export const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
/** «2026-11-10» → «Листопад 2026» */
export const monthName = (ymd) => (ymd ? `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}` : "Потік 1");

/**
 * Одноразове перенесення в потоки (одна транзакція): поточний челендж стає потоком №1.
 * Перед цим — резервні копії таблиць у самій базі (bak_streams_*). Повторний запуск нічого не змінює.
 */
async function migrateToStreams(db) {
  const done = await db.prepare("SELECT value FROM settings WHERE key = 'streamsMigrated'").first();
  if (done) return;
  const get = async (k) => {
    const r = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(k).first();
    return r ? JSON.parse(r.value) : null;
  };
  const groupId = await get("groupId");
  const groupTitle = await get("groupTitle");
  const startDate = await get("startDate");
  const seeded = await get("awardsSeeded");
  const any = await db.prepare("SELECT (SELECT COUNT(*) FROM checkins) + (SELECT COUNT(*) FROM participants) AS n").first();
  const ts = new Date().toISOString();
  const q = [];
  // резервні копії (лише раз)
  for (const t of ["settings", "threads", "participants", "checkins", "awards"]) {
    q.push(db.prepare(`CREATE TABLE IF NOT EXISTS bak_streams_${t} AS SELECT * FROM ${t}`));
  }
  if (groupId || any?.n) {
    q.push(
      db.prepare("INSERT OR IGNORE INTO streams (id, name, group_id, group_title, start_date, total_days, status, awards_seeded, created_at) VALUES (1, ?, ?, ?, ?, ?, 'active', ?, ?)")
        .bind(monthName(startDate), groupId, groupTitle, startDate, TOTAL_DAYS, seeded ? 1 : 0, ts),
      db.prepare("INSERT OR IGNORE INTO stream_members (stream_id, user_id, habit, minimum, why, joined_at) SELECT 1, user_id, habit, minimum, why, joined_at FROM participants"),
      db.prepare("INSERT OR IGNORE INTO stream_checkins (stream_id, user_id, day, status, note, text, msg_id, updated_at, first_at) SELECT 1, user_id, day, status, note, text, msg_id, updated_at, first_at FROM checkins"),
      db.prepare("INSERT OR IGNORE INTO stream_awards (stream_id, user_id, key, instant, at, reported) SELECT 1, user_id, key, instant, at, reported FROM awards"),
      db.prepare("UPDATE threads SET stream_id = 1 WHERE stream_id IS NULL"),
      // заявки на тижневі підсумки: weekly:N → weekly:1:N
      db.prepare("INSERT OR IGNORE INTO settings (key, value) SELECT 'weekly:1:' || substr(key, 8), value FROM settings WHERE key GLOB 'weekly:[0-9]*' AND key NOT GLOB 'weekly:*:*'"),
    );
  }
  q.push(db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('streamsMigrated', ?)").bind(JSON.stringify(ts)));
  await db.batch(q);
}

let schemaReady = null;
const now = () => new Date().toISOString();

export async function store(db) {
  if (!db) throw new Error("Немає бази D1: додай binding DB (Settings → Bindings → D1)");
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s)))
      .then(async () => { for (const m of MIGRATIONS) await db.prepare(m).run().catch(() => {}); })
      .then(() => migrateToStreams(db))
      .catch((e) => { schemaReady = null; throw e; });
  }
  await schemaReady;

  const settingsAll = async () => {
    const { results } = await db.prepare("SELECT key, value FROM settings").all();
    return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
  };
  const settingsSet = async (fields) => {
    const e = Object.entries(fields);
    if (!e.length) return;
    await db.batch(e.map(([k, v]) =>
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(k, JSON.stringify(v ?? null))));
  };
  const toStream = (r) => r && ({
    id: r.id, name: r.name, groupId: r.group_id, groupTitle: r.group_title, startDate: r.start_date,
    totalDays: r.total_days, status: r.status, awardsSeeded: !!r.awards_seeded, createdAt: r.created_at, closedAt: r.closed_at,
  });

  const base = {
    // ---------- глобальні налаштування (адміни, медалі в чаті, lastSkip, …) ----------
    all: settingsAll,
    set: settingsSet,

    // ---------- потоки ----------
    async streams() {
      const { results } = await db.prepare("SELECT * FROM streams ORDER BY id").all();
      return results.map(toStream);
    },
    async stream(id) {
      return toStream(await db.prepare("SELECT * FROM streams WHERE id = ?").bind(id).first());
    },
    async createStream({ name, groupId = null, groupTitle = null, startDate }) {
      const r = await db.prepare("INSERT INTO streams (name, group_id, group_title, start_date, total_days, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
        .bind(name, groupId, groupTitle, startDate, TOTAL_DAYS, now()).first();
      return r.id;
    },
    async updateStream(id, f) {
      // потік без дати мав тимчасову назву «Потік 1» — з першою датою старту стає «Листопад 2026»
      if (f.startDate && !("name" in f)) {
        const cur = await base.stream(id);
        if (cur && cur.name === monthName(null)) {
          const names = new Set((await base.streams()).filter((x) => x.id !== id).map((x) => x.name));
          let n = monthName(f.startDate);
          for (let i = 2; names.has(n); i++) n = `${monthName(f.startDate)} · ${i}`;
          f = { ...f, name: n };
        }
      }
      const cols = { name: "name", groupId: "group_id", groupTitle: "group_title", startDate: "start_date", status: "status", awardsSeeded: "awards_seeded", closedAt: "closed_at" };
      const e = Object.entries(f).filter(([k]) => cols[k]);
      if (!e.length) return;
      await db.prepare(`UPDATE streams SET ${e.map(([k]) => `${cols[k]} = ?`).join(", ")} WHERE id = ?`)
        .bind(...e.map(([k, v]) => (k === "awardsSeeded" ? (v ? 1 : 0) : v ?? null)), id).run();
      if (id === 1) { // для можливого відкату — старі ключі налаштувань теж актуальні
        const legacy = {};
        if ("groupId" in f) legacy.groupId = f.groupId;
        if ("groupTitle" in f) legacy.groupTitle = f.groupTitle;
        if ("startDate" in f) legacy.startDate = f.startDate;
        if ("awardsSeeded" in f) legacy.awardsSeeded = !!f.awardsSeeded;
        await settingsSet(legacy);
      }
    },
    async saveMemberResults(streamId, rows) {
      for (const r of rows) {
        await db.prepare("UPDATE stream_members SET result_days = ?, finished = ? WHERE stream_id = ? AND user_id = ?")
          .bind(r.days, r.finished ? 1 : 0, streamId, r.userId).run();
      }
    },

    // ---------- пости каналу в групі ----------
    async saveThread(chatId, msgId, kind, num, streamId) {
      await db.prepare("INSERT OR REPLACE INTO threads (chat_id, msg_id, kind, num, created_at, stream_id) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(String(chatId), msgId, kind, num ?? null, now(), streamId ?? null).run();
    },
    async thread(chatId, msgId) {
      return db.prepare("SELECT kind, num, created_at, stream_id AS streamId FROM threads WHERE chat_id = ? AND msg_id = ?").bind(String(chatId), msgId).first();
    },
    async latestThread(chatId) {
      return db.prepare("SELECT msg_id, created_at FROM threads WHERE chat_id = ? ORDER BY created_at DESC, msg_id DESC LIMIT 1").bind(String(chatId)).first();
    },

    // ---------- учасники (одні на всі потоки) ----------
    async touchParticipant(userId, tgName) {
      await db.prepare(
        "INSERT INTO participants (user_id, tg_name, joined_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET tg_name = excluded.tg_name",
      ).bind(userId, tgName, now()).run();
    },
    async setHidden(userId, hidden) {
      await db.prepare("UPDATE participants SET hidden = ? WHERE user_id = ?").bind(hidden ? 1 : 0, userId).run();
    },
    /** Скільки потоків людина пройшла (для титулів) */
    async finishedCounts() {
      const { results } = await db.prepare("SELECT user_id AS userId, COUNT(*) AS n FROM stream_members WHERE finished = 1 GROUP BY user_id").all();
      return new Map(results.map((r) => [r.userId, r.n]));
    },
  };

  /**
   * Вид бази для одного потоку — ті самі методи, що були до потоків, тож тижневі підсумки,
   * медалі й розбір відміток працюють без змін, просто в межах свого потоку.
   */
  base.forStream = (st) => {
    const sid = st.id;
    const legacy = sid === 1; // потік №1 дублюємо в старі таблиці (для відкату)
    return {
      ...base,
      streamId: sid,
      /** Налаштування як раніше: глобальні + дані потоку (startDate, groupId, …) */
      async all() {
        const g = await settingsAll();
        const cur = (await base.stream(sid)) ?? st;
        return { ...g, streamId: sid, streamName: cur.name, groupId: cur.groupId, groupTitle: cur.groupTitle, startDate: cur.startDate, awardsSeeded: cur.awardsSeeded, streamStatus: cur.status };
      },
      async set(fields) {
        const { startDate, groupId, groupTitle, awardsSeeded, ...rest } = fields;
        const sf = {};
        if ("startDate" in fields) sf.startDate = startDate;
        if ("groupId" in fields) sf.groupId = groupId;
        if ("groupTitle" in fields) sf.groupTitle = groupTitle;
        if ("awardsSeeded" in fields) sf.awardsSeeded = awardsSeeded;
        await base.updateStream(sid, sf);
        await settingsSet(rest);
      },
      async saveThread(chatId, msgId, kind, num) { return base.saveThread(chatId, msgId, kind, num, sid); },
      /** Повідомлення поста «День N» цього потоку (останнє, якщо їх кілька) */
      async dayThread(chatId, day) {
        const r = await db.prepare("SELECT msg_id FROM threads WHERE chat_id = ? AND kind = 'day' AND num = ? AND stream_id = ? ORDER BY created_at DESC, msg_id DESC LIMIT 1")
          .bind(String(chatId), day, sid).first();
        return r?.msg_id ?? null;
      },
      async maxDay() {
        const r = await db.prepare("SELECT MAX(num) AS d FROM threads WHERE kind = 'day' AND stream_id = ?").bind(sid).first();
        return r?.d ?? 0;
      },
      async claimWeek(week) {
        const r = await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING RETURNING key")
          .bind(`weekly:${sid}:${week}`, JSON.stringify(now())).first();
        if (r && legacy) await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(`weekly:${week}`, JSON.stringify(now())).run();
        return !!r;
      },
      async unclaimWeek(week) {
        await db.prepare("DELETE FROM settings WHERE key = ?").bind(`weekly:${sid}:${week}`).run();
        if (legacy) await db.prepare("DELETE FROM settings WHERE key = ?").bind(`weekly:${week}`).run();
      },
      async awardKeysOf(userId) {
        const { results } = await db.prepare("SELECT key FROM stream_awards WHERE stream_id = ? AND user_id = ?").bind(sid, userId).all();
        return new Set(results.map((r) => r.key));
      },
      /** Записати нагороди; повертає лише ті, яких ще не було (без дублів навіть при одночасних запитах) */
      async addAwards(userId, list, reported) {
        const added = [];
        for (const a of list) {
          const r = await db.prepare(
            "INSERT INTO stream_awards (stream_id, user_id, key, instant, at, reported) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(stream_id, user_id, key) DO NOTHING RETURNING key",
          ).bind(sid, userId, a.key, a.instant ? 1 : 0, now(), reported ? 1 : 0).first();
          if (r) {
            added.push(a);
            if (legacy) {
              await db.prepare("INSERT OR IGNORE INTO awards (user_id, key, instant, at, reported) VALUES (?, ?, ?, ?, ?)")
                .bind(userId, a.key, a.instant ? 1 : 0, now(), reported ? 1 : 0).run();
            }
          }
        }
        return added;
      },
      async unreportedQuiet() {
        const { results } = await db.prepare(
          "SELECT a.user_id AS userId, a.key, COALESCE(p.name, p.tg_name) AS name FROM stream_awards a JOIN participants p ON p.user_id = a.user_id " +
          "WHERE a.stream_id = ? AND a.instant = 0 AND a.reported = 0 AND p.hidden = 0 ORDER BY p.joined_at, a.at",
        ).bind(sid).all();
        return results;
      },
      async markQuietReported(rows) {
        for (const r of rows) {
          await db.prepare("UPDATE stream_awards SET reported = 1 WHERE stream_id = ? AND user_id = ? AND key = ?").bind(sid, r.userId, r.key).run();
          if (legacy) await db.prepare("UPDATE awards SET reported = 1 WHERE user_id = ? AND key = ?").bind(r.userId, r.key).run();
        }
      },

      /** Людина бере участь у цьому потоці (звичка — остання відома, поки не напише нову анкету) */
      async touchParticipant(userId, tgName) {
        await base.touchParticipant(userId, tgName);
        await db.prepare(
          "INSERT OR IGNORE INTO stream_members (stream_id, user_id, habit, minimum, why, joined_at) SELECT ?, user_id, habit, minimum, why, ? FROM participants WHERE user_id = ?",
        ).bind(sid, now(), userId).run();
      },
      async saveProfile(userId, p) {
        await db.batch([
          db.prepare("UPDATE participants SET name = ?, habit = ?, minimum = ?, why = ? WHERE user_id = ?")
            .bind(p.name ?? null, p.habit ?? null, p.minimum ?? null, p.why ?? null, userId),
          db.prepare("UPDATE stream_members SET habit = ?, minimum = ?, why = ? WHERE stream_id = ? AND user_id = ?")
            .bind(p.habit ?? null, p.minimum ?? null, p.why ?? null, sid, userId),
        ]);
      },
      async saveCheckin(userId, day, status, note, text, msgId) {
        const t = now();
        await db.prepare(
          "INSERT INTO stream_checkins (stream_id, user_id, day, status, note, text, msg_id, updated_at, first_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(stream_id, user_id, day) DO UPDATE SET status = excluded.status, note = excluded.note, text = excluded.text, msg_id = excluded.msg_id, updated_at = excluded.updated_at, " +
          "first_at = COALESCE(stream_checkins.first_at, stream_checkins.updated_at)",
        ).bind(sid, userId, day, status, note ?? null, text ?? null, msgId ?? null, t, t).run();
        if (legacy) {
          await db.prepare(
            "INSERT INTO checkins (user_id, day, status, note, text, msg_id, updated_at, first_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(user_id, day) DO UPDATE SET status = excluded.status, note = excluded.note, text = excluded.text, msg_id = excluded.msg_id, updated_at = excluded.updated_at, " +
            "first_at = COALESCE(checkins.first_at, checkins.updated_at)",
          ).bind(userId, day, status, note ?? null, text ?? null, msgId ?? null, t, t).run();
        }
      },
      /** Учасники потоку (видимі) і їхні відмітки — у тому ж форматі, що й до потоків */
      async participantsWithCheckins() {
        const [p, c] = await db.batch([
          db.prepare(
            "SELECT p.user_id AS userId, p.tg_name AS tgName, p.name, COALESCE(m.habit, p.habit) AS habit, COALESCE(m.minimum, p.minimum) AS minimum, COALESCE(m.why, p.why) AS why, m.joined_at AS joinedAt " +
            "FROM stream_members m JOIN participants p ON p.user_id = m.user_id WHERE m.stream_id = ? AND p.hidden = 0 ORDER BY p.joined_at",
          ).bind(sid),
          db.prepare(
            "SELECT c.user_id AS userId, c.day, c.status, c.text, c.updated_at AS updatedAt, COALESCE(c.first_at, c.updated_at) AS firstAt " +
            "FROM stream_checkins c JOIN participants p ON p.user_id = c.user_id WHERE c.stream_id = ? AND p.hidden = 0",
          ).bind(sid),
        ]);
        return { people: p.results, marks: c.results };
      },
      /** Усі учасники потоку з кількістю зарахованих днів (для закриття потоку) */
      async memberTotals() {
        const { results } = await db.prepare(
          "SELECT m.user_id AS userId, COALESCE(p.name, p.tg_name) AS name, p.hidden, " +
          "(SELECT COUNT(*) FROM stream_checkins c WHERE c.stream_id = m.stream_id AND c.user_id = m.user_id AND c.status IN ('done','min') AND c.day <= ?) AS ok " +
          "FROM stream_members m JOIN participants p ON p.user_id = m.user_id WHERE m.stream_id = ? ORDER BY p.joined_at",
        ).bind(TOTAL_DAYS, sid).all();
        return results;
      },
      async counts(day) {
        const r = await db.batch([
          db.prepare("SELECT COUNT(*) AS n FROM stream_members WHERE stream_id = ?").bind(sid),
          db.prepare("SELECT COUNT(*) AS n FROM stream_checkins WHERE stream_id = ? AND day = ?").bind(sid, day),
          db.prepare("SELECT COUNT(*) AS n FROM threads WHERE kind = 'day' AND stream_id = ?").bind(sid),
        ]);
        return { participants: r[0].results[0].n, today: r[1].results[0].n, dayPosts: r[2].results[0].n };
      },
    };
  };

  return base;
}

/** Для тестів: скинути кеш схеми */
export function __resetSchemaForTests() { schemaReady = null; }
