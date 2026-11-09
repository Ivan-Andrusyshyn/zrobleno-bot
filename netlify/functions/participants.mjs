// Netlify: дані для лендінгу → GET /api/participants
import { participantsPayload } from "../../bot/lib/handler.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    return Response.json(await participantsPayload(), {
      headers: {
        ...CORS,
        "cache-control": "public, max-age=0, must-revalidate",
        // CDN Netlify тримає відповідь 60 с — база не читається на кожен перегляд
        "netlify-cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "server error" }, { status: 500, headers: CORS });
  }
};
