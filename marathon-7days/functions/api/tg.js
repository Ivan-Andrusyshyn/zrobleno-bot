// Cloudflare Pages Function: вебхук Telegram → POST /api/tg
import { handleUpdate } from "../../server/handler.js";
import { runSummary } from "../../server/summary.js";

export async function onRequestPost({ request, env, waitUntil }) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();
  // відповідаємо Telegram одразу, а обробка триває у фоні
  const job = handleUpdate(update, env).catch((e) => console.error("update error", e));
  // Будь-яке повідомлення в групі «будить» бота: якщо настав час щоденного підсумку — публікуємо
  const chatType = (update.message || update.edited_message)?.chat?.type;
  waitUntil(chatType === "supergroup" || chatType === "group"
    ? job.then(() => runSummary(env)).catch((e) => console.error("summary error", e))
    : job);
  return new Response("ok");
}
