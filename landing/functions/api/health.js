// GET /api/health — перевірка: чи підключені база і секрети (без розкриття значень)
export async function onRequestGet({ env }) {
  let db = false;
  try { await env.DB.prepare("SELECT 1").first(); db = true; } catch {}
  return Response.json({
    ok: db && !!env.BOT_TOKEN && !!env.WEBHOOK_SECRET && !!env.ADMIN_CODE,
    db, botToken: !!env.BOT_TOKEN, webhookSecret: !!env.WEBHOOK_SECRET, adminCode: !!env.ADMIN_CODE,
  });
}
