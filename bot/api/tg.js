// Vercel: вебхук Telegram → POST /api/tg
import { handleUpdate } from "../lib/handler.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("method not allowed");
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) {
    return res.status(403).send("forbidden");
  }
  try {
    await handleUpdate(req.body || {});
  } catch (e) {
    console.error("update error", e); // відповідаємо 200, щоб Telegram не повторював без кінця
  }
  res.status(200).send("ok");
}
