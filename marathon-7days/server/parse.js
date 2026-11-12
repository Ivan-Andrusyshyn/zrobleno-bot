// Розбір тексту коментарів (чиста логіка — без Telegram і бази)

export const TOTAL_DAYS = 7; // марафон: 7 днів

/** «День 5 ✅ — …» → 5 */
export function parseDay(text) {
  const m = (text || "").match(/д[ен]{1,2}ь\s*№?\s*(\d{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= TOTAL_DAYS ? n : null;
}

/** Статус відмітки за першим знайденим значком */
export function parseStatus(text) {
  const t = text || "";
  const marks = [
    { re: /✅|✔️|✔|☑️/u, s: "done" },
    { re: /🟨|🟡|🔶/u, s: "min" },
    { re: /❌|✖️|✖|⛔/u, s: "miss" },
  ];
  let best = null;
  for (const { re, s } of marks) {
    const i = t.search(re);
    if (i >= 0 && (best === null || i < best.i)) best = { i, s };
  }
  return best ? best.s : null;
}

/** Текст після тире: «День 5 ✅ — 15 сторінок» → «15 сторінок» */
export function parseNote(text) {
  const m = (text || "").match(/[—–-]\s*(.+)$/su);
  return m ? m[1].trim().slice(0, 200) : null;
}

/**
 * Реєстрація під постом:
 * 1️⃣ Імʼя  2️⃣ Звичка  3️⃣ Мінімум  4️⃣ Навіщо
 * Потрібні всі 4 пункти — тоді дані повністю замінюються.
 * Якщо рядки пронумеровані — поле визначає цифра (порядок не важливий),
 * а рядки без цифри ігноруються. Порожній шаблон або незмінений приклад
 * не вважаються реєстрацією.
 */
const LABEL_RE = /^(імʼя|ім'я|ім’я|имя|звичка|мінімум|навіщо( тобі)?( це)?)\s*[:—–-]?\s*/iu;
const NUM_RE = /^\s*(\d)(?:\uFE0F?\u20E3|[.)])\s*/u;
const EXAMPLE = ["олена", "читання", "1 сторінка"];

export function parseRegistration(text) {
  const raw = (text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const numbered = raw.filter((l) => NUM_RE.test(l));
  const fields = [null, null, null, null];
  let labelsOnly = 0;
  const clean = (l) => {
    const before = l.replace(/^\s*[-•*]\s*/u, "").trim();
    const after = before.replace(LABEL_RE, "").trim();
    if (!after && before) labelsOnly++;
    return after;
  };
  if (numbered.length >= 2) {
    for (const l of numbered) {
      const i = Number(l.match(NUM_RE)[1]) - 1;
      const v = clean(l.replace(NUM_RE, ""));
      if (i >= 0 && i < 4 && v && !fields[i]) fields[i] = v;
    }
  } else {
    raw.map(clean).filter(Boolean).slice(0, 4).forEach((v, i) => (fields[i] = v));
    const rest = raw.map(clean).filter(Boolean).slice(4);
    if (rest.length && fields[3]) fields[3] += " " + rest.join(" ");
  }
  if (labelsOnly >= 2) return null; // скопійовано порожній шаблон
  if (!fields.every(Boolean)) return null; // потрібні всі 4 пункти
  const low = fields.slice(0, 3).map((f) => (f || "").toLowerCase());
  if (low.every((f, i) => f === EXAMPLE[i])) return null; // незмінений приклад
  const cut = (s) => (s ? s.slice(0, 120) : null);
  return { name: cut(fields[0]), habit: cut(fields[1]), minimum: cut(fields[2]), why: cut(fields[3]) };
}

/** Імʼя для лендінгу: «Іван А.» */
export function displayName(first, last) {
  const f = (first || "").trim();
  const l = (last || "").trim();
  return l ? `${f} ${l.charAt(0)}.` : f || "Учасник";
}

/** Поточна дата в часовому поясі → «2026-11-10» */
export function todayYmd(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function dayNumber(startYmd, ymd) {
  const u = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(ymd) - u(startYmd)) / 86400000) + 1;
}

export function parseDate(s) {
  s = (s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || null;
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) [, d, mo, y] = m;
  else return null;
  const ymd = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(ymd + "T00:00:00Z").toISOString().slice(0, 10) === ymd ? ymd : null;
}
