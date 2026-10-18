export const SHAPE_TOOLS = new Set(["line", "rect", "ellipse"]);

const SIMPLIFY_TOLERANCE = 0.35;

function traceFreehand(context, points) {
  context.beginPath();
  context.moveTo(points[0], points[1]);
  if (points.length === 2) {
    context.lineTo(points[0] + 0.01, points[1]);
    return;
  }
  for (let index = 2; index < points.length - 2; index += 2) {
    const midX = (points[index] + points[index + 2]) / 2;
    const midY = (points[index + 1] + points[index + 3]) / 2;
    context.quadraticCurveTo(points[index], points[index + 1], midX, midY);
  }
  context.lineTo(points[points.length - 2], points[points.length - 1]);
}

function traceShape(context, tool, [x0, y0, x1, y1]) {
  context.beginPath();
  if (tool === "line") {
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
  } else if (tool === "rect") {
    context.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  } else {
    context.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
  }
}

export function drawStroke(context, stroke, eraserColor) {
  if (!stroke.points.length) return;
  const isEraser = stroke.tool === "eraser";
  context.save();
  context.globalCompositeOperation = isEraser && !eraserColor ? "destination-out" : "source-over";
  context.strokeStyle = isEraser ? eraserColor || "#000" : stroke.color;
  context.lineWidth = stroke.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (SHAPE_TOOLS.has(stroke.tool)) traceShape(context, stroke.tool, stroke.points);
  else traceFreehand(context, stroke.points);
  context.stroke();
  context.restore();
}

export function lastActiveClearIndex(ops) {
  for (let index = ops.length - 1; index >= 0; index--) {
    if (ops[index].tool === "clear" && !ops[index].undone) return index;
  }
  return -1;
}

export function renderOps(context, ops, width, height) {
  context.clearRect(0, 0, width, height);
  for (let index = lastActiveClearIndex(ops) + 1; index < ops.length; index++) {
    if (!ops[index].undone) drawStroke(context, ops[index]);
  }
}

function distanceToSegmentSquared(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  const nearestX = ax + t * dx - px;
  const nearestY = ay + t * dy - py;
  return nearestX * nearestX + nearestY * nearestY;
}

export function simplifyPoints(points) {
  const pointCount = points.length / 2;
  if (pointCount <= 2) return points.slice();
  const keep = new Uint8Array(pointCount);
  keep[0] = keep[pointCount - 1] = 1;
  const toleranceSquared = SIMPLIFY_TOLERANCE * SIMPLIFY_TOLERANCE;
  const ranges = [[0, pointCount - 1]];
  while (ranges.length) {
    const [first, last] = ranges.pop();
    let farthestIndex = -1;
    let farthestDistance = toleranceSquared;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegmentSquared(points[index * 2], points[index * 2 + 1], points[first * 2], points[first * 2 + 1], points[last * 2], points[last * 2 + 1]);
      if (distance > farthestDistance) {
        farthestIndex = index;
        farthestDistance = distance;
      }
    }
    if (farthestIndex < 0) continue;
    keep[farthestIndex] = 1;
    ranges.push([first, farthestIndex], [farthestIndex, last]);
  }
  const simplified = [];
  for (let index = 0; index < pointCount; index++) {
    if (keep[index]) simplified.push(Math.round(points[index * 2] * 10) / 10, Math.round(points[index * 2 + 1] * 10) / 10);
  }
  return simplified;
}

export function constrainShape(tool, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (tool === "line") {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return [x0 + Math.cos(angle) * length, y0 + Math.sin(angle) * length];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [x0 + Math.sign(dx || 1) * side, y0 + Math.sign(dy || 1) * side];
}
