const ALLOWED = /^\/timetable\/server\/(ttviewer|regulartt)\.js$/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (request.headers.get("X-Proxy-Key") !== env.PROXY_KEY) return new Response("forbidden", { status: 403 });
    const url = new URL(request.url);
    if (!ALLOWED.test(url.pathname)) return new Response("not found", { status: 404 });
    const school = url.searchParams.get("school") || env.SCHOOL || "valteh";
    url.searchParams.delete("school");
    const target = `https://${school}.edupage.org${url.pathname}${url.search}`;
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": `https://${school}.edupage.org`,
        "Referer": `https://${school}.edupage.org/timetable/view.php`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      },
      body: await request.text(),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  },
};
