const KEY_PATTERN = /^\/transit\/(core|meta|fares\/(\d{1,3}))$/;
const FARE_SHARDS = 128;
const CACHE_SECONDS = 3600;

export async function handleTransit(request, env, url, cors) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  const respond = (body, status, extra = {}) => new Response(body, { status, headers: cors(request, { "Content-Type": "application/json", ...extra }) });
  if (request.method !== "GET") return respond(JSON.stringify({ error: "method_not_allowed" }), 405);
  const match = KEY_PATTERN.exec(url.pathname);
  if (!match || (match[2] !== undefined && Number(match[2]) >= FARE_SHARDS)) return respond(JSON.stringify({ error: "not_found" }), 404);
  if (!env.TRANSIT) return respond(JSON.stringify({ error: "storage_not_configured" }), 503);
  const key = match[2] !== undefined ? `transit:fares:${Number(match[2])}` : `transit:${match[1]}`;
  try {
    const value = await env.TRANSIT.get(key, "stream");
    if (value === null) return respond(JSON.stringify({ error: "not_published" }), 404, { "Cache-Control": "no-store" });
    return respond(value, 200, { "Cache-Control": `public, max-age=${CACHE_SECONDS}` });
  } catch (error) {
    console.error("transit read failed", error);
    return respond(JSON.stringify({ error: "storage_unavailable" }), 500);
  }
}
