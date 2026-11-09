// Vercel: дані для лендінгу → GET /api/participants
import { participantsPayload } from "../lib/handler.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    // CDN Vercel кешує відповідь на 60 с — база не читається на кожен перегляд
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(await participantsPayload());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}
