// Parses a text/event-stream body into JSON objects (skips [DONE] and non-JSON lines).
export async function* readSSE(body) {
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { yield JSON.parse(data); } catch {}
    }
  }
}
