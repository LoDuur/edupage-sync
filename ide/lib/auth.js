import { createHash, timingSafeEqual } from "node:crypto";

const ACCESS_HASH = (process.env.ACCESS_HASH || "").trim().toLowerCase();
export const AUTH_ENABLED = process.env.AUTH !== "off";

if (AUTH_ENABLED && !/^[0-9a-f]{64}$/.test(ACCESS_HASH)) {
  console.error("Refusing to start: ACCESS_HASH is not set (sha256 hex of the class access code). Set AUTH=off only for local development.");
  process.exit(1);
}

export function checkKey(key) {
  if (!AUTH_ENABLED) return true;
  if (typeof key !== "string" || !key) return false;
  const h = Buffer.from(createHash("sha256").update(key.trim().toUpperCase()).digest("hex"));
  return h.length === ACCESS_HASH.length && timingSafeEqual(h, Buffer.from(ACCESS_HASH));
}

export function requireKey(req, res, next) {
  if (checkKey(req.get("X-Access-Key"))) return next();
  res.status(403).json({ error: "access denied" });
}
