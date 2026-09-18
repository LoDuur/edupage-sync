// Line diff (LCS) for AIDiff: returns [{ content, kind, number }] with 3 lines of context around each change.
export function diffLines(a, b, context = 3) {
  const A = a.replace(/\r\n/g, "\n").split("\n"), B = b.replace(/\r\n/g, "\n").split("\n");
  if (A.length * B.length > 4e6) return [...A.map((c, i) => ({ content: c, kind: "removed", number: i + 1 })), ...B.map((c, i) => ({ content: c, kind: "added", number: i + 1 }))];
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push({ content: A[i], kind: "context", number: j + 1 }); i++; j++; }
    else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { ops.push({ content: A[i], kind: "removed", number: i + 1 }); i++; }
    else { ops.push({ content: B[j], kind: "added", number: j + 1 }); j++; }
  }
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, k) => { if (o.kind !== "context") for (let t = Math.max(0, k - context); t <= Math.min(ops.length - 1, k + context); t++) keep[t] = true; });
  const out = []; let gap = false;
  ops.forEach((o, k) => { if (keep[k]) { if (gap && out.length) out.push({ content: "⋯", kind: "context" }); gap = false; out.push(o); } else gap = true; });
  return out;
}
export const hasChanges = lines => lines.some(l => l.kind !== "context");
