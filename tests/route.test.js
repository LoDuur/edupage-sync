import { test } from "node:test";
import assert from "node:assert/strict";
import { search, isActive, shardOf, legFare, fareKeys } from "../docs/v2/js/route.js";

const everyDay = "f".repeat(15);
const neverDay = "0".repeat(15);

function makeCore({ trips, transfers = [], services = [everyDay, neverDay] }) {
  return {
    generated: `test-${Math.random()}`,
    start: "2026-11-12",
    days: 60,
    fareShards: 128,
    agencies: [["Carrier", "https://example.test"]],
    routes: [["1", "A-B", 0, 3, ["0", "atd"]], ["2", "B-C", 0, 3, ["1", "atd"]]],
    places: [["A", 0, 0], ["B", 0, 0], ["B2", 0, 0], ["C", 0, 0]],
    stops: [["A", 0, 0, 0], ["B", 0, 0, 1], ["B2", 0, 0, 2], ["C", 0, 0, 3]],
    services,
    trips,
    transfers,
  };
}

test("finds a direct trip after the requested time", () => {
  const core = makeCore({ trips: [[0, 0, "B", [0, 1], [480, 30]], [0, 0, "B", [0, 1], [600, 30]]] });
  const journeys = search(core, { fromPlace: 0, toPlace: 1, date: "2026-11-13", afterMinutes: 500 });
  assert.equal(journeys.length, 1);
  assert.deepEqual([journeys[0].dep, journeys[0].arr, journeys[0].transfers], [600, 630, 0]);
});

test("connects two trips through a walking transfer", () => {
  const core = makeCore({
    trips: [[0, 0, "B", [0, 1], [480, 30]], [1, 0, "C", [2, 3], [520, 40]]],
    transfers: [[1, 2, 5]],
  });
  const [journey] = search(core, { fromPlace: 0, toPlace: 3, date: "2026-11-13", afterMinutes: 0 });
  assert.equal(journey.transfers, 1);
  assert.deepEqual(journey.legs.map(l => [l.fromStop, l.toStop]), [[0, 1], [2, 3]]);
  assert.equal(journey.arr, 560);
});

test("misses a connection that leaves before the walk ends", () => {
  const core = makeCore({
    trips: [[0, 0, "B", [0, 1], [480, 30]], [1, 0, "C", [2, 3], [512, 40]]],
    transfers: [[1, 2, 5]],
  });
  assert.deepEqual(search(core, { fromPlace: 0, toPlace: 3, date: "2026-11-13", afterMinutes: 0 }), []);
});

test("ignores trips whose service does not run that day", () => {
  const core = makeCore({ trips: [[0, 1, "B", [0, 1], [480, 30]]] });
  assert.deepEqual(search(core, { fromPlace: 0, toPlace: 1, date: "2026-11-13", afterMinutes: 0 }), []);
});

test("respects no-pickup and no-dropoff flags", () => {
  const core = makeCore({ trips: [[0, 0, "C", [0, 1, 3], [480, 30, 30], "021"]] });
  assert.deepEqual(search(core, { fromPlace: 0, toPlace: 1, date: "2026-11-13", afterMinutes: 0 }), []);
  assert.equal(search(core, { fromPlace: 0, toPlace: 3, date: "2026-11-13", afterMinutes: 0 })[0].arr, 540);
});

test("returns nothing outside the data window", () => {
  const core = makeCore({ trips: [[0, 0, "B", [0, 1], [480, 30]]] });
  assert.deepEqual(search(core, { fromPlace: 0, toPlace: 1, date: "2027-03-01", afterMinutes: 0 }), []);
});

test("service bitsets and fare lookup", () => {
  assert.equal(isActive("0002", 1), true);
  assert.equal(isActive("0002", 0), false);
  assert.equal(shardOf("130", 128), 2);
  const core = makeCore({ trips: [] });
  assert.deepEqual(fareKeys(core, 0), ["0", "atd"]);
  assert.equal(legFare({ 0: { 0: { 1: 2.5 } } }, "0", 0, 1), 2.5);
  assert.equal(legFare(null, "0", 0, 1), null);
});
