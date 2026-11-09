// Cloudflare Pages Function: вебхук Telegram → POST /api/tg
import { handleUpdate } from "../../server/handler.js";

export async function onRequestPost({ request, env, waitUntil }) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();
  // відповідаємо Telegram одразу, а обробка триває у фоні
  waitUntil(handleUpdate(update, env).catch((e) => console.error("update error", e)));
  return new Response("ok");
}
