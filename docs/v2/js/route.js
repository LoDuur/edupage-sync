const DAY_MINUTES = 1440;
const CHANGE_BUFFER_MIN = 2;
const NO_PICKUP = 1;
const NO_DROPOFF = 2;

const dayIndex = (start, date) => Math.round((Date.UTC(...date.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(...start.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)))) / 86400000);

export function isActive(serviceHex, day) {
  if (day < 0) return false;
  const digit = serviceHex.length - 1 - Math.floor(day / 4);
  if (digit < 0) return false;
  return ((parseInt(serviceHex[digit], 16) >> (day % 4)) & 1) === 1;
}

const connectionCache = new Map();

function connectionsFor(core, day) {
  const key = `${core.generated}|${day}`;
  if (connectionCache.has(key)) return connectionCache.get(key);
  const list = [];
  core.trips.forEach((trip, tripIdx) => {
    const [, serviceIdx, , stopIdxs, deltas, flags = ""] = trip;
    const offsets = [];
    if (isActive(core.services[serviceIdx], day)) offsets.push(0);
    if (isActive(core.services[serviceIdx], day - 1)) offsets.push(-DAY_MINUTES);
    for (const offset of offsets) {
      let time = deltas[0] + offset;
      for (let i = 0; i < stopIdxs.length - 1; i++) {
        const next = time + deltas[i + 1];
        if (next >= 0) list.push({ dep: time, arr: next, from: stopIdxs[i], to: stopIdxs[i + 1], trip: tripIdx, offset, canBoard: !(Number(flags[i] || 0) & NO_PICKUP), canAlight: !(Number(flags[i + 1] || 0) & NO_DROPOFF) });
        time = next;
      }
    }
  });
  list.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  connectionCache.clear();
  connectionCache.set(key, list);
  return list;
}

function footpaths(core) {
  if (!core._footpaths) {
    const map = new Map();
    for (const [a, b, walk] of core.transfers) {
      if (!map.has(a)) map.set(a, []);
      map.get(a).push([b, walk]);
    }
    core._footpaths = map;
  }
  return core._footpaths;
}

function stopsOfPlace(core, place) {
  const result = [];
  core.stops.forEach((stop, idx) => { if (stop[3] === place) result.push(idx); });
  return result;
}

function earliest(core, connections, sources, targets, after, maxLegs) {
  const walks = footpaths(core);
  const ready = new Map();
  const arrival = new Map();
  const via = new Map();
  const tripState = new Map();
  const reach = (stop, time, readyTime, how) => {
    if ((arrival.get(stop) ?? Infinity) <= time) return false;
    arrival.set(stop, time);
    ready.set(stop, Math.min(ready.get(stop) ?? Infinity, readyTime));
    via.set(stop, how);
    return true;
  };
  for (const stop of sources) reach(stop, after, after, { kind: "start", legs: 0 });
  for (const stop of sources) for (const [other, walk] of walks.get(stop) || []) reach(other, after + walk, after + walk, { kind: "walk", from: stop, legs: 0 });
  let best = Infinity;
  for (const c of connections) {
    if (c.dep < after) continue;
    if (c.dep >= best) break;
    let state = tripState.get(`${c.trip}|${c.offset}`);
    if (!state && c.canBoard && (ready.get(c.from) ?? Infinity) <= c.dep) {
      const legs = via.get(c.from).legs + 1;
      if (legs <= maxLegs) {
        state = { boardStop: c.from, boardTime: c.dep, legs, parent: c.from };
        tripState.set(`${c.trip}|${c.offset}`, state);
      }
    }
    if (!state || !c.canAlight) continue;
    if (reach(c.to, c.arr, c.arr + CHANGE_BUFFER_MIN, { kind: "trip", trip: c.trip, offset: c.offset, board: state, legs: state.legs })) {
      if (targets.has(c.to)) best = Math.min(best, c.arr);
      for (const [other, walk] of walks.get(c.to) || []) {
        if (reach(other, c.arr + walk, c.arr + walk, { kind: "walk", from: c.to, legs: state.legs })) {
          if (targets.has(other)) best = Math.min(best, c.arr + walk);
        }
      }
    }
  }
  let target = null;
  for (const stop of targets) if ((arrival.get(stop) ?? Infinity) === best) target = stop;
  return target === null ? null : { target, arrival, via };
}

function rebuild(core, result) {
  const legs = [];
  let stop = result.target;
  for (let guard = 0; guard < 64; guard++) {
    const how = result.via.get(stop);
    if (!how || how.kind === "start") break;
    if (how.kind === "walk") { stop = how.from; continue; }
    legs.unshift({ routeIdx: core.trips[how.trip][0], tripIdx: how.trip, fromStop: how.board.boardStop, toStop: stop, dep: how.board.boardTime, arr: result.arrival.get(stop) });
    stop = how.board.parent;
  }
  if (!legs.length) return null;
  const dep = legs[0].dep;
  const arr = legs[legs.length - 1].arr;
  return { dep, arr, duration: arr - dep, transfers: legs.length - 1, legs };
}

export function search(core, { fromPlace, toPlace, date, afterMinutes, maxTransfers = 2, limit = 6 }) {
  const day = dayIndex(core.start, date);
  if (day < 0 || day >= core.days) return [];
  const sources = stopsOfPlace(core, fromPlace);
  const targets = new Set(stopsOfPlace(core, toPlace));
  if (!sources.length || !targets.size) return [];
  const connections = connectionsFor(core, day);
  const journeys = [];
  let after = afterMinutes;
  while (journeys.length < limit) {
    const result = earliest(core, connections, sources, targets, after, maxTransfers + 1);
    const journey = result && rebuild(core, result);
    if (!journey) break;
    const previous = journeys[journeys.length - 1];
    if (previous && previous.arr === journey.arr) journeys[journeys.length - 1] = journey;
    else journeys.push(journey);
    after = journey.dep + 1;
  }
  return journeys;
}

export function fareKeys(core, routeIdx) {
  return core.routes[routeIdx][4] || [String(routeIdx)];
}

export function shardOf(key, shards = 128) {
  const text = String(key);
  if (/^\d+$/.test(text)) return Number(text) % shards;
  let sum = 0;
  for (const ch of text) sum += ch.charCodeAt(0);
  return sum % shards;
}

export function legFare(shard, key, fromStop, toStop) {
  const price = shard?.[key]?.[fromStop]?.[toStop];
  return typeof price === "number" ? price : null;
}
