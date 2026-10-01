import test from "node:test";
import assert from "node:assert/strict";
import { runAlgorithm, solveLP, knapsack } from "../lib/algorithms";
import {
  Graph,
  Mode,
  generateGraph,
  example,
  oddExample,
  feasible,
  profit,
  incident,
  EPS,
} from "../lib/model";
function exact(g: Graph, unit = false) {
  let best = 0;
  for (let mask = 0; mask < 2 ** g.edges.length; mask++) {
    const ids = g.edges.filter((_, i) => mask & (1 << i)).map((e) => e.id);
    if (feasible(g, ids)) best = Math.max(best, profit(g, ids, unit));
  }
  return best;
}
test("LP produces a basic fractional optimum on an odd triangle", () => {
  const x = solveLP(oddExample);
  assert.deepEqual(Object.values(x), [2.5, 2.5, 2.5]);
});
test("Every procedure completes on its applicable worked examples", () => {
  for (const mode of [
    "augment",
    "color",
    "random",
    "cardinality",
    "fptas",
  ] as Mode[]) {
    for (const g of mode === "fptas" ? [example] : [example, oddExample]) {
      const r = runAlgorithm(g, mode);
      assert.equal(r.error, undefined, `${mode}: ${r.error}`);
      assert.ok(r.steps.length);
      assert.ok(feasible(g, r.result));
    }
  }
});
test("Generated graphs are simple, reproducible and honor n, m and individual feasibility", () => {
  for (const kind of ["tree", "bipartite", "general"] as const) {
    const g = generateGraph(8, 7, kind, 8);
    assert.deepEqual(g, generateGraph(8, 7, kind, 8));
    assert.equal(g.nodes.length, 8);
    assert.equal(g.edges.length, 7);
    assert.equal(
      new Set(g.edges.map((e) => [e.u, e.v].sort().join("-"))).size,
      7,
    );
    for (const e of g.edges) assert.ok(feasible(g, [e.id]));
  }
  assert.throws(() => generateGraph(3, 4, "general", 1));
  assert.throws(() => generateGraph(4, 2, "tree", 1));
});
test("Deterministic bounds, structural coloring, and sampled feasibility across 240 graphs", () => {
  for (const kind of ["tree", "bipartite", "general"] as const)
    for (let seed = 1; seed <= 80; seed++) {
      const g = generateGraph(7, kind === "tree" ? 6 : 10, kind, seed),
        opt = exact(g),
        cardOpt = exact(g, true);
      for (const mode of [
        "augment",
        "color",
        "random",
        "cardinality",
      ] as Mode[]) {
        const r = runAlgorithm(g, mode, 0.276, 0.1, seed);
        assert.equal(r.error, undefined, `${kind} ${seed} ${mode}: ${r.error}`);
        assert.ok(feasible(g, r.result), `${kind} ${seed} ${mode} infeasible`);
        if (mode === "augment")
          assert.ok(
            profit(g, r.result) *
              (kind === "tree" ? 2 : kind === "bipartite" ? 3 : 3.5) +
              EPS >=
              opt,
          );
        if (mode === "cardinality")
          assert.ok(
            r.result.length * (kind === "general" ? 3 : 2.5) + EPS >= cardOpt,
          );
        if (mode === "color") {
          const last = r.steps.at(-1)!;
          assert.ok(
            feasible(
              g,
              Object.keys(last.colors).filter(
                (id) => last.colors[id] === "red",
              ),
            ),
          );
          for (const v of g.nodes) {
            const bronze = g.edges.filter((e) =>
              last.bronze[e.id]?.includes(v.id),
            );
            assert.ok(
              bronze.length <= 1,
              `too many bronze incidences at ${v.id}`,
            );
            const copper = g.edges.filter(
              (e) =>
                last.colors[e.id] &&
                last.colors[e.id] !== "red" &&
                incident(e, v.id) &&
                !last.bronze[e.id]?.includes(v.id),
            );
            assert.ok(
              copper.reduce((s, e) => s + e.demand, 0) <= v.capacity + EPS,
              `copper overload ${kind} seed ${seed} at ${v.id}`,
            );
          }
        }
      }
    }
});
test("Tree FPTAS matches the global approximation bound across roots and error budgets", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = generateGraph(8, 7, "tree", seed),
      opt = exact(g);
    for (const eps of [0.05, 0.1, 0.5]) {
      const r = runAlgorithm(g, "fptas", 0.276, eps, 42, g.nodes[seed % 8].id);
      assert.equal(r.error, undefined);
      assert.ok(feasible(g, r.result));
      assert.ok(
        profit(g, r.result) * (1 + eps) + EPS >= opt,
        `seed ${seed} eps ${eps}`,
      );
    }
  }
});
test("Knapsack scaling preserves its approximation bound", () => {
  const items = [
    { id: "a", demand: 6, gain: 13.2 },
    { id: "b", demand: 5, gain: 12.8 },
    { id: "c", demand: 3, gain: 7.1 },
    { id: "d", demand: 2, gain: 4.6 },
  ];
  for (const capacity of [0, 2, 5, 7, 9, 12])
    for (const eta of [0.01, 0.1, 0.5]) {
      const chosen = knapsack(items, capacity, eta);
      const score = items
        .filter((i) => chosen.includes(i.id))
        .reduce((s, i) => s + i.gain, 0);
      let opt = 0;
      for (let mask = 0; mask < 16; mask++) {
        const s = items.filter((_, i) => mask & (1 << i));
        if (s.reduce((v, i) => v + i.demand, 0) <= capacity)
          opt = Math.max(
            opt,
            s.reduce((v, i) => v + i.gain, 0),
          );
      }
      assert.ok(score * (1 + eta) + EPS >= opt);
    }
});
test("Empty, singleton, disconnected and invalid-mode inputs return useful outcomes", () => {
  assert.match(
    runAlgorithm({ nodes: [], edges: [] }, "augment").error!,
    /Add a node/,
  );
  const single = generateGraph(1, 0, "tree", 0);
  assert.equal(runAlgorithm(single, "fptas").error, undefined);
  assert.match(
    runAlgorithm(oddExample, "fptas").error!,
    /connected simple tree/,
  );
  assert.match(runAlgorithm(example, "random", 0.7).error!, /0 and 0.5/);
  const g = {
    ...example,
    edges: example.edges.map((e) => ({ ...e, demand: 999 })),
  };
  assert.equal(runAlgorithm(g, "augment").error, undefined);
  assert.equal(runAlgorithm(g, "augment").result.length, 0);
});
test("Balloons, odd-cycle promotion, and greedy cases have explicit traces", () => {
  for (const [seed, mode, title] of [
    [4, "cardinality", "balloon"],
    [139, "cardinality", "minimum-gap"],
    [3, "cardinality", "copper BFS"],
    [42, "cardinality", "Case (i)"],
    [91, "cardinality", "sibling leaves"],
    [264, "cardinality", "Case (ii)"],
    [579, "cardinality", "deepest-leaf"],
  ] as const) {
    const r = runAlgorithm(generateGraph(12, 20, "general", seed), mode);
    assert.equal(r.error, undefined);
    assert.ok(
      r.steps.some((s) => s.title.includes(title)),
      `${mode} seed ${seed} missing ${title}`,
    );
  }
});
test("Coincident neighbours in a nonbipartite triangle are handled honestly and feasibly", () => {
  const g = generateGraph(12, 20, "general", 150),
    r = runAlgorithm(g, "cardinality");
  assert.equal(r.error, undefined);
  assert.ok(feasible(g, r.result));
  assert.ok(
    r.steps.some(
      (s) => s.title === "Overlapping neighbours: resolve a triangle",
    ),
  );
  assert.match(r.guarantee, /bound not asserted/);
});
test("The opening example exhibits augmentation and temporary overload", () => {
  const r = runAlgorithm(example, "augment");
  assert.ok(r.steps.some((s) => s.phase === "Augment"));
  assert.ok(
    r.steps.some((s) =>
      example.nodes.some(
        (v) =>
          example.edges
            .filter((e) => incident(e, v.id))
            .reduce((sum, e) => sum + (s.x[e.id] || 0), 0) >
          v.capacity + EPS,
      ),
    ),
  );
  assert.ok(feasible(example, r.result));
});
