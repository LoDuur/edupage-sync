const MAX_CODE = 200 * 1024;
const MAX_BODY_BYTES = 512 * 1024;
const TEXT_LIMITS = { title: 80, description: 4000, lesson: 60, author: 60 };
const OWNER_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const VISIBILITIES = ["private", "link", "public"];
const MAX_PROJECTS_PER_OWNER = 500;
const MAX_VERSIONS = 50;
const AUTO_VERSION_MS = 10 * 60_000;
const LANGUAGES = [
  ["python", "Python", "py"], ["javascript", "JavaScript", "js"], ["java", "Java", "java"], ["c", "C", "c"], ["cpp", "C++", "cpp"],
  ["csharp", "C#", "cs"], ["lua", "Lua", "lua"], ["pil", "PIL", "pil"], ["bash", "Bash", "sh"],
].map(([id, name, ext]) => ({ id, name, ext, available: true }));
const LANGUAGE_IDS = new Set(LANGUAGES.map(l => l.id));
const SUMMARY = "id, author, title, description, lesson, language, visibility, editable, rev, forked_from, created_at, updated_at";

class HttpError extends Error {
  constructor(message, status = 400, data = {}) { super(message); this.status = status; this.data = data; }
}

const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, "0")).join("");
const newId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9)))).replace(/\+/g, "-").replace(/\//g, "_");
const toProject = row => row && { id: row.id, author: row.author, title: row.title, description: row.description, lesson: row.lesson, language: row.language, code: row.code, visibility: row.visibility, editable: !!row.editable, rev: row.rev, forkedFrom: row.forked_from, createdAt: row.created_at, updatedAt: row.updated_at };
const summary = row => { const p = toProject({ ...row, code: undefined }); delete p.code; return p; };

function readFields(body) {
  const out = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") throw new HttpError(`${key} must be text`);
    out[key] = body[key].trim().slice(0, max);
  }
  if (body.code !== undefined) {
    if (typeof body.code !== "string") throw new HttpError("code must be text");
    if (body.code.length > MAX_CODE) throw new HttpError("The file is too large (200 KB limit).");
    out.code = body.code;
  }
  if (body.language !== undefined) { if (!LANGUAGE_IDS.has(body.language)) throw new HttpError("unknown language"); out.language = body.language; }
  if (body.visibility !== undefined) { if (!VISIBILITIES.includes(body.visibility)) throw new HttpError("unknown visibility"); out.visibility = body.visibility; }
  if (body.editable !== undefined) out.editable = !!body.editable;
  return out;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError("Request too large.", 413);
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError("Invalid JSON."); }
}

const getRow = (db, id) => db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
const countMine = async (db, owner) => (await db.prepare("SELECT COUNT(*) AS n FROM projects WHERE owner = ?").bind(owner).first()).n;
const snapshot = (db, id, rev, code, label, now) => [
  db.prepare("INSERT INTO project_versions (project_id, rev, label, code, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, rev, label, code, now),
  db.prepare("DELETE FROM project_versions WHERE project_id = ? AND id NOT IN (SELECT id FROM project_versions WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)").bind(id, id, MAX_VERSIONS),
];

async function access(db, id, owner) {
  const row = await getRow(db, id);
  if (!row) return { project: null, isOwner: false, canView: false, canEdit: false };
  const isOwner = row.owner === owner, canView = isOwner || row.visibility !== "private";
  return { project: toProject(row), isOwner, canView, canEdit: isOwner || (canView && !!row.editable) };
}
const withAccess = (a, project = a.project) => ({ ...project, isOwner: a.isOwner, canEdit: a.canEdit });

async function viewable(db, id, owner) {
  const a = await access(db, id, owner);
  if (!a.canView) throw new HttpError("Project not found or not shared with you.", 404);
  return a;
}
async function editable(db, id, owner) {
  const a = await viewable(db, id, owner);
  if (!a.canEdit) throw new HttpError("This project is read-only for you. Duplicate it to make changes.", 403);
  return a;
}

async function create(db, owner, { author = "", title = "Untitled", description = "", lesson = "", language, code = "", forkedFrom = null }) {
  if (await countMine(db, owner) >= MAX_PROJECTS_PER_OWNER) throw new HttpError(`You have ${MAX_PROJECTS_PER_OWNER} projects – delete some first.`, 409);
  const id = newId(), now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO projects (id, owner, author, title, description, lesson, language, code, visibility, editable, forked_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', 0, ?, ?, ?)").bind(id, owner, author, title, description, lesson, language, code, forkedFrom, now, now),
    ...snapshot(db, id, 1, code, "Created", now),
  ]);
  return { ...toProject(await getRow(db, id)), isOwner: true, canEdit: true };
}

async function update(db, id, fields, baseRev) {
  const current = toProject(await getRow(db, id));
  if (baseRev !== undefined && baseRev !== current.rev) return { conflict: current };
  const sets = [], values = [];
  for (const key of ["author", "title", "description", "lesson", "language", "code", "visibility", "editable"]) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = ?`); values.push(key === "editable" ? (fields[key] ? 1 : 0) : fields[key]);
  }
  if (!sets.length) return { project: current };
  const now = Date.now();
  const statements = [db.prepare(`UPDATE projects SET ${sets.join(", ")}, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?`).bind(...values, now, id, current.rev)];
  if (fields.code !== undefined && fields.code !== current.code) {
    const last = await db.prepare("SELECT created_at FROM project_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).first();
    if (now - (last?.created_at || 0) > AUTO_VERSION_MS) statements.push(...snapshot(db, id, current.rev + 1, fields.code, "", now));
  }
  const [result] = await db.batch(statements);
  if (!result.meta.changes) return { conflict: toProject(await getRow(db, id)) };
  return { project: toProject(await getRow(db, id)) };
}

const listVersions = async (db, id) => (await db.prepare("SELECT id, rev, label, created_at, length(code) AS size FROM project_versions WHERE project_id = ? ORDER BY created_at DESC, id DESC").bind(id).all()).results
  .map(v => ({ id: v.id, rev: v.rev, label: v.label, createdAt: v.created_at, size: v.size }));
const getVersion = async (db, id, versionId) => {
  const v = await db.prepare("SELECT * FROM project_versions WHERE id = ? AND project_id = ?").bind(versionId, id).first();
  if (!v) throw new HttpError("Version not found.", 404);
  return { id: v.id, rev: v.rev, label: v.label, code: v.code, createdAt: v.created_at };
};

async function route(request, db, owner, path, models) {
  const method = request.method;
  if (path === "/api/config" && method === "GET") return { models, languages: LANGUAGES, sandbox: { mode: "remote", reason: "" }, idleMs: 0 };
  if (!owner) throw new HttpError("missing workspace key");
  if (path === "/api/projects" && method === "GET") return { projects: (await db.prepare(`SELECT ${SUMMARY} FROM projects WHERE owner = ? ORDER BY updated_at DESC LIMIT 500`).bind(owner).all()).results.map(summary) };
  if (path === "/api/projects/public" && method === "GET") return { projects: (await db.prepare(`SELECT ${SUMMARY} FROM projects WHERE visibility = 'public' ORDER BY updated_at DESC LIMIT 200`).all()).results.map(summary) };
  if (path === "/api/projects" && method === "POST") {
    const fields = readFields(await readBody(request));
    if (!fields.language) throw new HttpError("language required");
    return [201, { project: await create(db, owner, fields) }];
  }
  const m = path.match(/^\/api\/projects\/([A-Za-z0-9_-]{1,32})(?:\/(fork|versions)(?:\/(\d+)(\/restore)?)?)?$/);
  if (!m) throw new HttpError("not found", 404);
  const [, id, sub, versionId, restore] = m;

  if (!sub && method === "GET") return { project: withAccess(await viewable(db, id, owner)) };
  if (!sub && method === "PUT") {
    const a = await editable(db, id, owner);
    const body = await readBody(request), fields = readFields(body);
    if (!a.isOwner) for (const key of Object.keys(fields)) if (key !== "code") delete fields[key];
    const result = await update(db, id, fields, Number.isInteger(body.rev) ? body.rev : undefined);
    if (result.conflict) throw new HttpError("Someone else saved a newer version.", 409, { project: withAccess(a, result.conflict) });
    return { project: withAccess(a, result.project) };
  }
  if (!sub && method === "DELETE") {
    const a = await viewable(db, id, owner);
    if (!a.isOwner) throw new HttpError("Only the owner can delete this project.", 403);
    await db.batch([db.prepare("DELETE FROM project_versions WHERE project_id = ?").bind(id), db.prepare("DELETE FROM projects WHERE id = ?").bind(id)]);
    return { ok: true };
  }
  if (sub === "fork" && method === "POST") {
    const a = await viewable(db, id, owner), body = await readBody(request);
    const author = typeof body.author === "string" ? body.author.trim().slice(0, TEXT_LIMITS.author) : "";
    const { title, description, lesson, language, code } = a.project;
    return [201, { project: await create(db, owner, { author, title: `${title} (copy)`.slice(0, TEXT_LIMITS.title), description, lesson, language, code, forkedFrom: id }) }];
  }
  if (sub === "versions" && !versionId && method === "GET") { await viewable(db, id, owner); return { versions: await listVersions(db, id) }; }
  if (sub === "versions" && versionId && !restore && method === "GET") { await viewable(db, id, owner); return { version: await getVersion(db, id, +versionId) }; }
  if (sub === "versions" && !versionId && method === "POST") {
    await editable(db, id, owner);
    const body = await readBody(request), label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    const p = toProject(await getRow(db, id));
    await db.batch(snapshot(db, id, p.rev, p.code, label || "Saved version", Date.now()));
    return [201, { versions: await listVersions(db, id) }];
  }
  if (sub === "versions" && restore && method === "POST") {
    const a = await editable(db, id, owner), version = await getVersion(db, id, +versionId);
    const { project } = await update(db, id, { code: version.code });
    await db.batch(snapshot(db, id, project.rev, project.code, `Restored from revision ${version.rev}`, Date.now()));
    return { project: withAccess(a, project) };
  }
  throw new HttpError("not found", 404);
}

export async function handleIde(request, env, url, cors, models) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(request, { "Content-Type": "application/json", "Cache-Control": "no-store" }) });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  const path = url.pathname.slice("/ide".length);
  try {
    if (path === "/api/auth" && request.method === "POST") {
      const { key } = await readBody(request);
      return json({ ok: typeof key === "string" && !!env.ACCESS_HASH && await sha256(key.trim().toUpperCase()) === env.ACCESS_HASH });
    }
    const key = request.headers.get("X-Access-Key") || "";
    if (!env.ACCESS_HASH || await sha256(key.trim().toUpperCase()) !== env.ACCESS_HASH) return json({ error: "access denied" }, 403);
    const token = request.headers.get("X-Owner") || "";
    const owner = OWNER_TOKEN.test(token) ? await sha256("owner:" + token) : null;
    const result = await route(request, env.DB, owner, path, models);
    return Array.isArray(result) ? json(result[1], result[0]) : json(result);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.data }, e.status);
    console.error(`[ide] ${request.method} ${path}: ${e.stack || e.message}`);
    return json({ error: "Could not complete the request." }, 500);
  }
}
