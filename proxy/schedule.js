const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_FAILURE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CHANGES_PER_SAVE = 100;
const HISTORY_LIMIT = 60;
const PERIOD_COUNT = 10;
const FIELD_LIMITS = { subject: 80, room: 24, teacher: 60, note: 160 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_PATTERN = /^v1\.(\d{13})\.([0-9a-f]{64})$/;
const encoder = new TextEncoder();

class RequestError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

const toHex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const fromHex = hex => new Uint8Array(hex.match(/../g).map(pair => parseInt(pair, 16)));
const sha256 = text => crypto.subtle.digest("SHA-256", encoder.encode(text));
const sessionSecret = env => `schedule-session:${env.SCHEDULE_ADMIN_KEY}`;
const hmacKey = secret => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

const parseAdminKeys = env => (env.SCHEDULE_ADMIN_KEY || "").split(",").map(key => key.trim()).filter(Boolean);

async function keysMatch(candidate, expectedKeys) {
  const candidateDigest = await sha256(candidate);
  const comparisons = await Promise.all(expectedKeys.map(async expected => crypto.subtle.timingSafeEqual(candidateDigest, await sha256(expected))));
  return comparisons.includes(true);
}

async function issueSession(env) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `v1.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(sessionSecret(env)), encoder.encode(payload));
  return { token: `${payload}.${toHex(signature)}`, expiresAt };
}

async function sessionExpiry(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return 0;
  const expiresAt = Number(match[1]);
  if (expiresAt <= Date.now()) return 0;
  const isValid = await crypto.subtle.verify("HMAC", await hmacKey(sessionSecret(env)), fromHex(match[2]), encoder.encode(`v1.${match[1]}`));
  return isValid ? expiresAt : 0;
}

async function readJsonBody(request) {
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) throw new RequestError("body_too_large", 413);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new RequestError("body_too_large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("invalid_json");
  }
}

function isRealDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanText(value, field) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new RequestError(`invalid_${field}`);
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > FIELD_LIMITS[field]) throw new RequestError(`${field}_too_long`);
  return text;
}

function parseChange(raw) {
  if (!raw || typeof raw !== "object") throw new RequestError("invalid_change");
  if (!isRealDate(raw.date)) throw new RequestError("invalid_date");
  if (!Number.isInteger(raw.period) || raw.period < 1 || raw.period > PERIOD_COUNT) throw new RequestError("invalid_period");
  if (raw.override === null) return { date: raw.date, period: raw.period, override: null };
  if (!raw.override || typeof raw.override !== "object") throw new RequestError("invalid_override");
  const isRemoved = raw.override.removed === true;
  const override = {
    subject: cleanText(raw.override.subject, "subject"),
    room: cleanText(raw.override.room, "room"),
    teacher: cleanText(raw.override.teacher, "teacher"),
    note: cleanText(raw.override.note, "note"),
    removed: isRemoved ? 1 : 0,
  };
  if (!isRemoved && !override.subject) throw new RequestError("subject_required");
  return { date: raw.date, period: raw.period, override };
}

function parseSaveRequest(body) {
  if (!body || typeof body !== "object") throw new RequestError("invalid_body");
  if (!Number.isInteger(body.baseRevision) || body.baseRevision < 0) throw new RequestError("invalid_base_revision");
  if (!Array.isArray(body.changes) || !body.changes.length) throw new RequestError("no_changes");
  if (body.changes.length > MAX_CHANGES_PER_SAVE) throw new RequestError("too_many_changes");
  const changes = body.changes.map(parseChange);
  const slotKeys = new Set(changes.map(change => `${change.date}|${change.period}`));
  if (slotKeys.size !== changes.length) throw new RequestError("duplicate_slot");
  return { baseRevision: body.baseRevision, changes };
}

async function readState(db, fromDate) {
  const overridesQuery = fromDate
    ? db.prepare("SELECT date, period, subject, room, teacher, note, removed, updated_at AS updatedAt FROM lesson_overrides WHERE date >= ? ORDER BY date, period").bind(fromDate)
    : db.prepare("SELECT date, period, subject, room, teacher, note, removed, updated_at AS updatedAt FROM lesson_overrides ORDER BY date, period");
  const [state, overrides] = await db.batch([db.prepare("SELECT revision FROM schedule_state WHERE id = 1"), overridesQuery]);
  return {
    revision: state.results[0].revision,
    overrides: overrides.results.map(row => ({ ...row, removed: row.removed === 1 })),
  };
}

async function readHistory(db) {
  const { results } = await db.prepare("SELECT id, revision, at, date, period, before, after FROM change_log ORDER BY id DESC LIMIT ?").bind(HISTORY_LIMIT).all();
  const parseSnapshot = text => {
    if (!text) return null;
    const snapshot = JSON.parse(text);
    return { ...snapshot, removed: snapshot.removed === 1 };
  };
  return results.map(row => ({ ...row, before: parseSnapshot(row.before), after: parseSnapshot(row.after) }));
}

async function login(request, env) {
  const db = env.DB;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  const recent = await db.prepare("SELECT COUNT(*) AS failures, MIN(at) AS oldest FROM login_failures WHERE ip = ? AND at > ?").bind(ip, now - LOGIN_WINDOW_MS).first();
  if (recent.failures >= LOGIN_MAX_FAILURES) {
    return { status: 429, body: { error: "too_many_attempts", retryAfterSeconds: Math.ceil((recent.oldest + LOGIN_WINDOW_MS - now) / 1000) } };
  }
  const body = await readJsonBody(request);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (key && key.length <= 256 && await keysMatch(key, parseAdminKeys(env))) return { status: 200, body: await issueSession(env) };
  await db.batch([
    db.prepare("INSERT INTO login_failures (ip, at) VALUES (?, ?)").bind(ip, now),
    db.prepare("DELETE FROM login_failures WHERE at < ?").bind(now - LOGIN_FAILURE_RETENTION_MS),
  ]);
  return { status: 401, body: { error: "invalid_key", attemptsLeft: Math.max(0, LOGIN_MAX_FAILURES - recent.failures - 1) } };
}

async function saveChanges(request, env) {
  const db = env.DB;
  const { baseRevision, changes } = parseSaveRequest(await readJsonBody(request));
  const writeToken = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  const ownsWrite = "EXISTS (SELECT 1 FROM schedule_state WHERE id = 1 AND write_token = ?)";
  const statements = [db.prepare("UPDATE schedule_state SET revision = revision + 1, write_token = ? WHERE id = 1 AND revision = ?").bind(writeToken, baseRevision)];
  for (const { date, period, override } of changes) {
    statements.push(db.prepare(
      `INSERT INTO change_log (revision, at, date, period, before, after)
       SELECT ?, ?, ?, ?, (SELECT json_object('subject', subject, 'room', room, 'teacher', teacher, 'note', note, 'removed', removed) FROM lesson_overrides WHERE date = ? AND period = ?), ?
       WHERE ${ownsWrite}`
    ).bind(baseRevision + 1, savedAt, date, period, date, period, override ? JSON.stringify(override) : null, writeToken));
    statements.push(override
      ? db.prepare(
        `INSERT INTO lesson_overrides (date, period, subject, room, teacher, note, removed, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ownsWrite}
         ON CONFLICT (date, period) DO UPDATE SET subject = excluded.subject, room = excluded.room, teacher = excluded.teacher, note = excluded.note, removed = excluded.removed, updated_at = excluded.updated_at`
      ).bind(date, period, override.subject, override.room, override.teacher, override.note, override.removed, savedAt, writeToken)
      : db.prepare(`DELETE FROM lesson_overrides WHERE date = ? AND period = ? AND ${ownsWrite}`).bind(date, period, writeToken));
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes === 0) return { status: 409, body: { error: "stale_revision", ...(await readState(db)) } };
  return { status: 200, body: await readState(db) };
}

async function route(request, env, url) {
  const { pathname } = url;
  const method = request.method;
  if (pathname === "/schedule/overrides" && method === "GET") {
    const fromDate = url.searchParams.get("from");
    if (fromDate && !isRealDate(fromDate)) throw new RequestError("invalid_date");
    return { status: 200, body: await readState(env.DB, fromDate) };
  }
  if (!parseAdminKeys(env).length) return { status: 503, body: { error: "admin_key_not_configured" } };
  if (pathname === "/schedule/login" && method === "POST") return login(request, env);
  const expiresAt = await sessionExpiry(request, env);
  if (!expiresAt) return { status: 401, body: { error: "session_required" } };
  if (pathname === "/schedule/session" && method === "GET") return { status: 200, body: { expiresAt } };
  if (pathname === "/schedule/history" && method === "GET") return { status: 200, body: { history: await readHistory(env.DB) } };
  if (pathname === "/schedule/changes" && method === "POST") return saveChanges(request, env);
  return { status: 404, body: { error: "not_found" } };
}

export async function handleSchedule(request, env, url, cors) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  const respond = (body, status) => new Response(JSON.stringify(body), { status, headers: cors(request, { "Content-Type": "application/json", "Cache-Control": "no-store" }) });
  if (!env.DB) return respond({ error: "storage_not_configured" }, 503);
  try {
    const { status, body } = await route(request, env, url);
    return respond(body, status);
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status);
    console.error("schedule request failed", error);
    return respond({ error: "storage_unavailable" }, 500);
  }
}
