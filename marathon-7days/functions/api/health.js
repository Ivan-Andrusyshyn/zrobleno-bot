// GET /api/health — перевірка: база, секрети і стан вебхука Telegram (без розкриття значень)
export async function onRequestGet({ env, request }) {
  let db = false;
  try { await env.DB.prepare("SELECT 1").first(); db = true; } catch {}

  let webhook = null;
  if (env.BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`);
      const d = await r.json();
      const expected = `${new URL(request.url).origin}/api/tg`;
      webhook = d.ok
        ? {
            connected: d.result.url === expected,
            url: d.result.url || "(не задано — відкрий /api/setup?key=...)",
            pending: d.result.pending_update_count,
            lastError: d.result.last_error_message || null,
            lastErrorAt: d.result.last_error_date ? new Date(d.result.last_error_date * 1000).toISOString() : null,
          }
        : { error: d.description };
    } catch (e) {
      webhook = { error: String(e.message || e) };
    }
  }

  let settings = null;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
    const s = Object.fromEntries(results.map((x) => [x.key, JSON.parse(x.value)]));
    const c = await env.DB.batch([
      env.DB.prepare("SELECT kind, COUNT(*) AS n FROM threads GROUP BY kind"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM participants"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM checkins"),
    ]);
    settings = {
      admins: (s.admins || []).length, group: s.groupTitle || null, startDate: s.startDate || null,
      posts: Object.fromEntries(c[0].results.map((r) => [r.kind, r.n])),
      participants: c[1].results[0].n, checkins: c[2].results[0].n,
      lastSkippedComment: s.lastSkip || null,
    };
  } catch {}

  return Response.json({
    ok: db && !!env.BOT_TOKEN && !!env.WEBHOOK_SECRET && !!env.ADMIN_CODE && !!webhook?.connected,
    db, botToken: !!env.BOT_TOKEN, webhookSecret: !!env.WEBHOOK_SECRET, adminCode: !!env.ADMIN_CODE,
    webhook, settings,
  });
}
