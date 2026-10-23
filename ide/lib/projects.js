import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "28teh.db");
const AUTO_VERSION_MS = 10 * 60_000;
export const MAX_VERSIONS = 50;
export const MAX_PROJECTS_PER_OWNER = 500;
export const VISIBILITIES = ["private", "link", "public"];

if (DB_PATH !== ":memory:") mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    lesson TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private',
    editable INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL DEFAULT 1,
    forked_from TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner, updated_at DESC);
  CREATE INDEX IF NOT EXISTS projects_public ON projects(visibility, updated_at DESC);
  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    rev INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS versions_project ON versions(project_id, created_at DESC);
`);

export const ownerHash = token => createHash("sha256").update(token).digest("hex");
const newId = () => randomBytes(9).toString("base64url");

const SUMMARY = "id, author, title, description, lesson, language, visibility, editable, rev, forked_from, created_at, updated_at";
const toProject = row => row && { id: row.id, author: row.author, title: row.title, description: row.description, lesson: row.lesson, language: row.language, code: row.code, visibility: row.visibility, editable: !!row.editable, rev: row.rev, forkedFrom: row.forked_from, createdAt: row.created_at, updatedAt: row.updated_at };

const q = {
  get: db.prepare("SELECT * FROM projects WHERE id = ?"),
  mine: db.prepare(`SELECT ${SUMMARY} FROM projects WHERE owner = ? ORDER BY updated_at DESC LIMIT 500`),
  publicList: db.prepare(`SELECT ${SUMMARY} FROM projects WHERE visibility = 'public' ORDER BY updated_at DESC LIMIT 200`),
  countMine: db.prepare("SELECT COUNT(*) AS n FROM projects WHERE owner = ?"),
  insert: db.prepare("INSERT INTO projects (id, owner, author, title, description, lesson, language, code, visibility, editable, forked_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  remove: db.prepare("DELETE FROM projects WHERE id = ?"),
  lastVersion: db.prepare("SELECT created_at FROM versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"),
  addVersion: db.prepare("INSERT INTO versions (project_id, rev, label, code, created_at) VALUES (?, ?, ?, ?, ?)"),
  pruneVersions: db.prepare("DELETE FROM versions WHERE project_id = ? AND id NOT IN (SELECT id FROM versions WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)"),
  versions: db.prepare("SELECT id, rev, label, created_at, length(code) AS size FROM versions WHERE project_id = ? ORDER BY created_at DESC, id DESC"),
  version: db.prepare("SELECT * FROM versions WHERE id = ? AND project_id = ?"),
};

const summaries = rows => rows.map(r => { const p = toProject({ ...r, code: undefined }); delete p.code; return p; });

export const get = id => toProject(q.get.get(id));
export const ownerOf = id => q.get.get(id)?.owner ?? null;
export const listMine = owner => summaries(q.mine.all(owner));
export const listPublic = () => summaries(q.publicList.all());
export const countMine = owner => q.countMine.get(owner).n;

export function access(id, owner) {
  const row = q.get.get(id);
  if (!row) return { project: null, isOwner: false, canView: false, canEdit: false };
  const isOwner = row.owner === owner;
  const canView = isOwner || row.visibility !== "private";
  return { project: toProject(row), isOwner, canView, canEdit: isOwner || (canView && !!row.editable) };
}

function snapshot(id, rev, code, label, now) {
  q.addVersion.run(id, rev, label, code, now);
  q.pruneVersions.run(id, id, MAX_VERSIONS);
}

export function create(owner, { author = "", title, description = "", lesson = "", language, code, forkedFrom = null }) {
  const id = newId(), now = Date.now();
  q.insert.run(id, owner, author, title, description, lesson, language, code, "private", 0, forkedFrom, now, now);
  snapshot(id, 1, code, "Created", now);
  return get(id);
}

export function update(id, fields, baseRev) {
  const current = get(id);
  if (!current) return { error: "not found" };
  if (baseRev !== undefined && baseRev !== current.rev) return { conflict: current };
  const columns = { author: "author", title: "title", description: "description", lesson: "lesson", language: "language", code: "code", visibility: "visibility", editable: "editable" };
  const sets = [], values = [];
  for (const [key, column] of Object.entries(columns)) if (fields[key] !== undefined) { sets.push(`${column} = ?`); values.push(key === "editable" ? (fields[key] ? 1 : 0) : fields[key]); }
  if (!sets.length) return { project: current };
  const now = Date.now();
  db.prepare(`UPDATE projects SET ${sets.join(", ")}, rev = rev + 1, updated_at = ? WHERE id = ?`).run(...values, now, id);
  const project = get(id);
  if (fields.code !== undefined && fields.code !== current.code) {
    const last = q.lastVersion.get(id)?.created_at || 0;
    if (now - last > AUTO_VERSION_MS) snapshot(id, project.rev, project.code, "", now);
  }
  return { project };
}

export const remove = id => q.remove.run(id);
export const listVersions = id => q.versions.all(id).map(v => ({ id: v.id, rev: v.rev, label: v.label, createdAt: v.created_at, size: v.size }));
export const getVersion = (id, versionId) => { const v = q.version.get(versionId, id); return v && { id: v.id, rev: v.rev, label: v.label, code: v.code, createdAt: v.created_at }; };
export function saveVersion(id, label) { const p = get(id); if (!p) return null; snapshot(id, p.rev, p.code, label, Date.now()); return listVersions(id); }
