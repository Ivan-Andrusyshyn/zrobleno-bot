// Розбір тексту коментарів (чиста логіка — без Telegram і бази)

export const TOTAL_DAYS = 30;

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
 * Реєстрація під головним постом:
 * 1️⃣ Імʼя  2️⃣ Звичка  3️⃣ Мінімум  4️⃣ Навіщо
 */
export function parseRegistration(text) {
  const lines = (text || "")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(\d️?⃣|\d+[.)]|[-•*])\s*/u, "").trim())
    .map((l) => l.replace(/^(імʼя|ім'я|ім’я|звичка|мінімум|навіщо)\s*[:—–-]\s*/iu, "").trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const cut = (s) => (s ? s.slice(0, 120) : null);
  return { name: cut(lines[0]), habit: cut(lines[1]), minimum: cut(lines[2]), why: cut(lines.slice(3).join(" ")) };
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
