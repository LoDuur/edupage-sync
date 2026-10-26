import { store, toast } from "./util.js";
import { settings } from "./settings.js";
import { LANGUAGE_META } from "./languages.js";
import { createModel, setModelLanguage } from "./editor.js";

const SAVE_DELAY_MS = 1000;
const RETRY_MS = 5000;
const MAX_RECENT = 12;

export function createWorkspace({ api, live, editor }) {
  const listeners = new Set();
  const models = new Map();
  const state = { mine: [], shared: [], recent: store.get("recent-shared", []), current: null, saveState: "idle", savedAt: 0, saveError: "", conflict: null, listError: "" };
  let saveTimer = 0, inFlight = null, applyingRemote = false;

  const emit = reason => { for (const fn of listeners) fn(state, reason); };
  const draftKey = id => "draft:" + id;
  const isDirty = () => state.saveState === "dirty" || state.saveState === "error";

  function rememberRecent(project) {
    if (project.isOwner) return;
    state.recent = [{ id: project.id, title: project.title, language: project.language, author: project.author }, ...state.recent.filter(r => r.id !== project.id)].slice(0, MAX_RECENT);
    store.set("recent-shared", state.recent);
  }

  function upsertSummary(project) {
    if (!project.isOwner) return;
    const { code, isOwner, canEdit, ...summary } = project;
    state.mine = [summary, ...state.mine.filter(p => p.id !== project.id)].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function loadList() {
    try { state.mine = (await api.get("/api/projects")).projects; state.listError = ""; }
    catch (e) { state.listError = e.message; }
    emit("list");
  }

  async function loadShared() {
    try { state.shared = (await api.get("/api/projects/public")).projects; }
    catch (e) { toast(e.message, "error"); }
    emit("list");
  }

  function modelFor(project) {
    let model = models.get(project.id);
    if (!model) {
      model = createModel(project.code, project.language);
      model.onDidChangeContent(() => { if (!applyingRemote && state.current?.id === project.id) onLocalEdit(); });
      models.set(project.id, model);
    }
    return model;
  }

  function onLocalEdit() {
    const p = state.current;
    if (!p?.canEdit) return;
    store.set(draftKey(p.id), { code: models.get(p.id).getValue(), rev: p.rev });
    if (state.saveState !== "conflict") state.saveState = "dirty";
    emit("save");
    if (settings.autosave) { clearTimeout(saveTimer); saveTimer = setTimeout(save, SAVE_DELAY_MS); }
  }

  function applyRemote(project) {
    const model = models.get(project.id);
    if (!model) return;
    if (model.getValue() !== project.code) {
      applyingRemote = true;
      const view = state.current?.id === project.id ? editor.saveViewState() : null;
      model.setValue(project.code);
      if (view) editor.restoreViewState(view);
      applyingRemote = false;
    }
    if (model.getLanguageId() !== (LANGUAGE_META[project.language]?.monaco || "plaintext")) setModelLanguage(model, project.language);
  }

  async function open(id, { quiet = false } = {}) {
    if (state.current?.id === id) return state.current;
    if (isDirty()) await save();
    let project;
    try { project = (await api.get(`/api/projects/${encodeURIComponent(id)}`)).project; }
    catch (e) {
      if (!quiet) toast(e.message, "error");
      if (e.status === 404) { state.recent = state.recent.filter(r => r.id !== id); store.set("recent-shared", state.recent); emit("list"); }
      return null;
    }
    clearTimeout(saveTimer);
    state.current = project; state.conflict = null; state.saveError = "";
    const model = modelFor(project);
    applyRemote(project);
    state.saveState = project.canEdit ? "saved" : "readonly";
    state.savedAt = project.updatedAt;
    const draft = store.get(draftKey(id), null);
    if (project.canEdit && draft && draft.code !== project.code) {
      if (draft.rev === project.rev) { model.setValue(draft.code); toast("Restored unsaved changes from this browser."); }
      else store.remove(draftKey(id));
    }
    editor.setModel(model);
    editor.updateOptions({ readOnly: !project.canEdit, readOnlyMessage: { value: "This project is read-only. Duplicate it to make your own copy." } });
    rememberRecent(project);
    store.set("last-project", id);
    history.replaceState(null, "", `?p=${encodeURIComponent(id)}`);
    live.watch(project);
    emit("open");
    return project;
  }

  async function save({ force = false } = {}) {
    clearTimeout(saveTimer);
    const p = state.current;
    if (!p?.canEdit) return;
    if (inFlight) { await inFlight; if (!isDirty()) return; }
    const code = models.get(p.id).getValue();
    if (!force && state.saveState === "conflict") return;
    if (code === p.code && !force) { state.saveState = "saved"; store.remove(draftKey(p.id)); emit("save"); return; }
    state.saveState = "saving"; emit("save");
    inFlight = (async () => {
      try {
        const { project } = await api.put(`/api/projects/${p.id}`, force ? { code } : { code, rev: p.rev });
        if (state.current?.id !== p.id) return;
        Object.assign(p, project, { code: project.code });
        const stillDirty = models.get(p.id).getValue() !== project.code;
        state.saveState = stillDirty ? "dirty" : "saved"; state.savedAt = project.updatedAt; state.conflict = null; state.saveError = "";
        if (!stillDirty) store.remove(draftKey(p.id)); else if (settings.autosave) saveTimer = setTimeout(save, SAVE_DELAY_MS);
        upsertSummary(p);
      } catch (e) {
        if (e.status === 409 && e.data?.project) { state.saveState = "conflict"; state.conflict = e.data.project; }
        else { state.saveState = "error"; state.saveError = e.message; if (e.status === 0 || e.status >= 500 || e.status === 429) saveTimer = setTimeout(save, RETRY_MS); }
      }
      emit("save");
    })();
    try { await inFlight; } finally { inFlight = null; }
  }

  async function resolveConflict(useTheirs) {
    const theirs = state.conflict; if (!theirs) return;
    if (useTheirs) {
      Object.assign(state.current, theirs);
      applyRemote(theirs);
      state.conflict = null; state.saveState = "saved"; store.remove(draftKey(theirs.id));
      emit("save");
    } else {
      state.conflict = null; state.saveState = "dirty";
      await save({ force: true });
    }
  }

  async function create({ language, title = "", lesson = "", code } = {}) {
    try {
      const { project } = await api.post("/api/projects", { language, title: title || "Untitled", lesson, author: settings.author, code: code ?? LANGUAGE_META[language]?.template ?? "" });
      upsertSummary(project);
      emit("list");
      await open(project.id);
      return project;
    } catch (e) { toast(e.message, "error"); return null; }
  }

  async function updateMeta(fields) {
    const p = state.current; if (!p?.isOwner) return null;
    try {
      const { project } = await api.put(`/api/projects/${p.id}`, fields);
      const code = p.code;
      Object.assign(p, project, { code: isDirty() ? code : project.code });
      if (fields.language) setModelLanguage(models.get(p.id), project.language);
      if (fields.visibility) live.watch(p);
      upsertSummary(p);
      emit("meta");
      return p;
    } catch (e) { toast(e.message, "error"); return null; }
  }

  async function duplicate(id = state.current?.id) {
    if (!id) return;
    if (state.current?.id === id && isDirty()) await save();
    try {
      const { project } = await api.post(`/api/projects/${id}/fork`, { author: settings.author });
      upsertSummary(project); emit("list");
      await open(project.id);
      toast("Duplicated into your projects");
    } catch (e) { toast(e.message, "error"); }
  }

  async function remove(id) {
    try { await api.del(`/api/projects/${id}`); }
    catch (e) { return toast(e.message, "error"); }
    models.get(id)?.dispose(); models.delete(id); store.remove(draftKey(id));
    state.mine = state.mine.filter(p => p.id !== id);
    if (state.current?.id === id) {
      state.current = null; state.saveState = "idle"; editor.setModel(null); history.replaceState(null, "", location.pathname);
      if (state.mine[0]) await open(state.mine[0].id);
    }
    emit("list"); emit("open");
  }

  async function listVersions() { return (await api.get(`/api/projects/${state.current.id}/versions`)).versions; }
  async function getVersion(versionId) { return (await api.get(`/api/projects/${state.current.id}/versions/${versionId}`)).version; }
  async function saveVersion(label = "") {
    if (isDirty()) await save();
    const versions = (await api.post(`/api/projects/${state.current.id}/versions`, { label })).versions;
    emit("versions");
    return versions;
  }
  async function restoreVersion(versionId) {
    const { project } = await api.post(`/api/projects/${state.current.id}/versions/${versionId}/restore`);
    Object.assign(state.current, project);
    applyRemote(project);
    state.saveState = "saved"; state.savedAt = project.updatedAt; store.remove(draftKey(project.id));
    upsertSummary(state.current);
    emit("save"); emit("versions");
  }

  live.on("project:changed", project => {
    const current = state.current;
    if (!current || current.id !== project.id) return;
    const model = models.get(project.id);
    if (model.getValue() === project.code) { Object.assign(current, project); if (!isDirty()) state.saveState = current.canEdit ? "saved" : "readonly"; state.savedAt = project.updatedAt; emit("meta"); return; }
    if (project.rev <= current.rev) return;
    if (isDirty() || state.saveState === "saving") { state.saveState = "conflict"; state.conflict = { ...current, ...project }; emit("save"); return; }
    Object.assign(current, project);
    applyRemote(project);
    state.savedAt = project.updatedAt;
    emit("remote");
  });
  live.on("project:closed", ({ id }) => {
    if (state.current?.id !== id || state.current.isOwner) return;
    toast("The owner stopped sharing this project.", "error");
    state.current.canEdit = false; state.saveState = "readonly";
    editor.updateOptions({ readOnly: true });
    emit("meta");
  });
  addEventListener("beforeunload", e => { if (isDirty() || state.saveState === "saving") { e.preventDefault(); e.returnValue = ""; } });

  return {
    state, loadList, loadShared, open, save, create, updateMeta, duplicate, remove, resolveConflict,
    listVersions, getVersion, saveVersion, restoreVersion, isDirty,
    onUpdate: fn => listeners.add(fn),
    get model() { return state.current ? models.get(state.current.id) : null; },
    importLocalFiles: async files => {
      const byExt = Object.fromEntries(Object.entries(LANGUAGE_META).map(([id, m]) => [m.file.split(".").pop(), id]));
      let imported = 0;
      for (const f of files) {
        const language = byExt[(f.name.split(".").pop() || "").toLowerCase()];
        if (!language || !f.content?.trim()) continue;
        try { const { project } = await api.post("/api/projects", { language, title: f.name, author: settings.author, code: f.content }); upsertSummary(project); imported++; } catch {}
      }
      if (imported) { emit("list"); toast(`Imported ${imported} file${imported === 1 ? "" : "s"} from the old workspace`); }
      return imported;
    },
  };
}
