const POLL_MS = 4000;

export function socketLive(socket) {
  let watched = null;
  socket.on("connect", () => { if (watched) socket.emit("project:watch", watched); });
  return {
    watch(project) { watched = project.id; socket.emit("project:watch", project.id); },
    on: (event, handler) => socket.on(event, handler),
  };
}

export function pollingLive(api) {
  const handlers = { "project:changed": [], "project:closed": [] };
  let watched = null, rev = 0, timer = 0;
  const emit = (event, payload) => { for (const fn of handlers[event]) fn(payload); };
  async function poll() {
    timer = setTimeout(poll, POLL_MS);
    if (!watched || document.hidden) return;
    const id = watched;
    try {
      const { project } = await api.get(`/api/projects/${encodeURIComponent(id)}`);
      if (id !== watched) return;
      if (project.visibility === "private" && !project.isOwner) return emit("project:closed", { id });
      if (project.rev !== rev) { rev = project.rev; emit("project:changed", project); }
    } catch (e) { if (e.status === 404 && id === watched) emit("project:closed", { id }); }
  }
  return {
    watch(project) {
      watched = project.visibility === "private" ? null : project.id;
      rev = project.rev;
      clearTimeout(timer);
      if (watched) timer = setTimeout(poll, POLL_MS);
    },
    on: (event, handler) => handlers[event].push(handler),
  };
}
