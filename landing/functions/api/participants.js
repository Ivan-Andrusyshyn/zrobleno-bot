// Cloudflare Pages Function: дані для лендінгу → GET /api/participants
// Відповідь кешується на 60 с, тож база не читається на кожен перегляд.
import { participantsPayload } from "../../server/handler.js";

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL("/api/participants", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const res = Response.json(await participantsPayload(env), {
      headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
    });
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    console.error(e);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
