// Netlify: вебхук Telegram → POST /api/tg
import { handleUpdate } from "../../bot/lib/handler.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    await handleUpdate(await req.json());
  } catch (e) {
    console.error("update error", e); // 200, щоб Telegram не повторював без кінця
  }
  return new Response("ok");
};
