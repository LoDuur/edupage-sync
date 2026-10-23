import { store, randomToken } from "./util.js";

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export function workspaceKey() {
  let key = store.get("owner", "");
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(key)) { key = randomToken(); store.set("owner", key); }
  return key;
}

export function createApi(accessKey) {
  const headers = () => ({ "Content-Type": "application/json", "X-Access-Key": accessKey, "X-Owner": workspaceKey() });
  async function request(method, url, body) {
    let response;
    try { response = await fetch(url, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new ApiError("Cannot reach the server. Check your connection.", 0); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status}).`, response.status, data);
    return data;
  }
  return {
    headers,
    get: url => request("GET", url),
    post: (url, body = {}) => request("POST", url, body),
    put: (url, body) => request("PUT", url, body),
    del: url => request("DELETE", url),
  };
}

export async function checkAccess(key) {
  try {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    return (await r.json()).ok === true;
  } catch { return false; }
}
