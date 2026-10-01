import {
  Graph,
  Edge,
  Step,
  Run,
  Mode,
  Color,
  Conflict,
  EPS,
  fmt,
  incident,
  other,
  rng,
  graphKind,
  profit,
  feasible,
} from "./model";

// Primal simplex for max c*x, A*x <= b, x >= 0. Slack basis is feasible.
// Bland's entering/leaving rule avoids cycling and returns a basic optimum.
export function solveLP(g: Graph, unit = false): Record<string, number> {
  const es = g.edges,
    n = es.length,
    m = g.nodes.length + n,
    cols = n + m;
  if (!n) return {};
  const a = Array.from(
    { length: m + 1 },
    () => Array(cols + 1).fill(0) as number[],
  );
  const basis = Array.from({ length: m }, (_, i) => n + i);
  g.nodes.forEach((v, i) => {
    es.forEach((e, j) => {
      if (incident(e, v.id)) a[i][j] = 1;
    });
    a[i][cols] = v.capacity;
  });
  es.forEach((e, j) => {
    a[g.nodes.length + j][j] = 1;
    a[g.nodes.length + j][cols] = e.demand;
    a[m][j] = -(unit ? 1 : e.profit) / e.demand;
  });
  for (let i = 0; i < m; i++) a[i][n + i] = 1;
  let done = false;
  for (let it = 0; it < 20000; it++) {
    const enter = a[m].findIndex((v, j) => j < cols && v < -1e-9);
    if (enter < 0) {
      done = true;
      break;
    }
    let leave = -1,
      ratio = Infinity;
    for (let i = 0; i < m; i++)
      if (a[i][enter] > 1e-9) {
        const r = a[i][cols] / a[i][enter];
        if (
          r < ratio - 1e-9 ||
          (Math.abs(r - ratio) < 1e-9 && (leave < 0 || basis[i] < basis[leave]))
        ) {
          ratio = r;
          leave = i;
        }
      }
    if (leave < 0) throw Error("The LP unexpectedly became unbounded.");
    const pivot = a[leave][enter];
    for (let j = 0; j <= cols; j++) a[leave][j] /= pivot;
    for (let i = 0; i <= m; i++)
      if (i !== leave) {
        const k = a[i][enter];
        if (Math.abs(k) > 1e-12)
          for (let j = 0; j <= cols; j++) a[i][j] -= k * a[leave][j];
      }
    basis[leave] = enter;
  }
  if (!done)
    throw Error("The LP exceeded its iteration limit. Try a smaller graph.");
  const x = Object.fromEntries(es.map((e) => [e.id, 0]));
  basis.forEach((j, i) => {
    if (j < n) x[es[j].id] = Math.max(0, Math.min(es[j].demand, a[i][cols]));
  });
  return x;
}
function components(g: Graph, ids: string[]): string[][] {
  const remaining = new Set(ids),
    result: string[][] = [];
  while (remaining.size) {
    const root = remaining.values().next().value!;
    const set = [root];
    remaining.delete(root);
    for (let i = 0; i < set.length; i++) {
      const e = g.edges.find((e) => e.id === set[i])!;
      for (const id of remaining) {
        const f = g.edges.find((e) => e.id === id)!;
        if (incident(f, e.u) || incident(f, e.v)) {
          set.push(id);
          remaining.delete(id);
        }
      }
    }
    result.push(set);
  }
  return result;
}
function pathBetween(es: Edge[], start: string, end: string): Edge[] {
  const q = [start],
    seen = new Set([start]),
    prev = new Map<string, { node: string; e: Edge }>();
  for (let i = 0; i < q.length; i++) {
    if (q[i] === end) break;
    for (const e of es.filter((e) => incident(e, q[i]))) {
      const v = other(e, q[i]);
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
        prev.set(v, { node: q[i], e });
      }
    }
  }
  const path: Edge[] = [];
  let v = end;
  while (v !== start) {
    const p = prev.get(v);
    if (!p) throw Error("Path not found.");
    path.unshift(p.e);
    v = p.node;
  }
  return path;
}
function cycleEdges(es: Edge[]): Edge[] {
  let core = [...es];
  let changed = true;
  while (changed) {
    changed = false;
    const degree: Record<string, number> = {};
    core.forEach((e) => {
      degree[e.u] = (degree[e.u] || 0) + 1;
      degree[e.v] = (degree[e.v] || 0) + 1;
    });
    const next = core.filter((e) => degree[e.u] > 1 && degree[e.v] > 1);
    changed = next.length !== core.length;
    core = next;
  }
  return core;
}
function orderedCycle(es: Edge[], root: string): Edge[] {
  const result: Edge[] = [];
  let v = root;
  while (result.length < es.length) {
    const e = es.find((e) => incident(e, v) && !result.includes(e));
    if (!e) throw Error("Invalid fractional cycle.");
    result.push(e);
    v = other(e, v);
  }
  return result;
}
export function conflictGraph(
  g: Graph,
  colors: Record<string, Color>,
  bronze: Record<string, string[]>,
): Conflict {
  const vertices = g.edges
    .filter((e) => colors[e.id] && colors[e.id] !== "red")
    .map((e) => e.id);
  const arcs: [string, string][] = [];
  for (let i = 0; i < vertices.length; i++)
    for (let j = i + 1; j < vertices.length; j++) {
      const a = g.edges.find((e) => e.id === vertices[i])!,
        b = g.edges.find((e) => e.id === vertices[j])!;
      if (
        [a.u, a.v].some(
          (v) =>
            incident(b, v) &&
            ((bronze[a.id] || []).includes(v) ||
              (bronze[b.id] || []).includes(v)),
        )
      )
        arcs.push([a.id, b.id]);
    }
  return { vertices, arcs };
}
function neighbors(c: Conflict, id: string, allowed?: Set<string>) {
  return c.arcs
    .filter((a) => a.includes(id))
    .map((a) => (a[0] === id ? a[1] : a[0]))
    .filter((v) => !allowed || allowed.has(v));
}
function bipartition(c: Conflict): Record<string, number> {
  const p: Record<string, number> = {};
  for (const r of c.vertices)
    if (p[r] === undefined) {
      p[r] = 0;
      const q = [r];
      for (let i = 0; i < q.length; i++)
        for (const v of neighbors(c, q[i]))
          if (p[v] === undefined) {
            p[v] = 1 - p[q[i]];
            q.push(v);
          } else if (p[v] === p[q[i]])
            throw Error("Expected a bipartite conflict forest.");
    }
  return p;
}

class Trace {
  steps: Step[] = [];
  x: Record<string, number> = {};
  colors: Record<string, Color> = {};
  bronze: Record<string, string[]> = {};
  discarded: string[] = [];
  add(
    phase: string,
    title: string,
    description: string,
    extra: Partial<Step> = {},
  ) {
    this.steps.push(
      structuredClone({
        phase,
        title,
        description,
        x: this.x,
        colors: this.colors,
        bronze: this.bronze,
        active: [],
        selected: [],
        discarded: this.discarded,
        focusNodes: [],
        ...extra,
      }),
    );
  }
}
function augment(g: Graph, t: Trace, activeIds: string[], extended: boolean) {
  const active = new Set(
    activeIds.filter(
      (id) =>
        t.x[id] > EPS &&
        t.x[id] < g.edges.find((e) => e.id === id)!.demand - EPS,
    ),
  );
  for (const e of g.edges)
    if (activeIds.includes(e.id) && t.x[e.id] >= e.demand - EPS)
      t.colors[e.id] = "copper";
  let count = 0;
  while (true) {
    const comp = components(g, [...active]).find((c) => c.length > 1);
    if (!comp) break;
    if (++count > g.edges.length * 3 + 5)
      throw Error("Augmentation did not converge.");
    const es = g.edges.filter((e) => comp.includes(e.id)),
      deg: Record<string, number> = {};
    es.forEach((e) => {
      deg[e.u] = (deg[e.u] || 0) + 1;
      deg[e.v] = (deg[e.v] || 0) + 1;
    });
    const leaves = Object.keys(deg).filter((v) => deg[v] === 1);
    if (!leaves.length) {
      if (!extended)
        throw Error("An odd cycle must be broken before tree augmentation.");
      let e = es.find((e) => t.x[e.id] <= e.demand / 2 + EPS);
      if (e) {
        t.colors[e.id] = "red";
        active.delete(e.id);
        t.add(
          "Odd cycle",
          "Set aside a red edge",
          `${e.id} has x ≤ d/2. Removing it opens this odd cycle into a path. Red edges form a matching and will be compared with the nonred solution.`,
          {
            active: [e.id],
            formula: `${fmt(t.x[e.id])} ≤ ${fmt(e.demand / 2)}`,
          },
        );
      } else {
        e = [...es].sort(
          (a, b) => a.demand - t.x[a.id] - (b.demand - t.x[b.id]),
        )[0];
        t.x[e.id] = e.demand;
        t.colors[e.id] = "copper";
        active.delete(e.id);
        t.add(
          "Odd cycle",
          "Make the minimum-gap edge copper",
          `Every cycle edge is more than half full. Lemma 4.2 permits rounding ${e.id} to its demand and removing it. Its cycle neighbours become fractional leaves.`,
          { active: [e.id] },
        );
      }
      continue;
    }
    let path: Edge[],
      coeff: Record<string, number> = {},
      balloon = false;
    if (leaves.length >= 2) {
      path = pathBetween(es, leaves[0], leaves[1]);
      path.forEach((e, i) => (coeff[e.id] = i % 2 ? -1 : 1));
    } else {
      balloon = true;
      const cycle = cycleEdges(es);
      if (!cycle.length) throw Error("Expected an odd cycle for the balloon.");
      const cv = new Set(cycle.flatMap((e) => [e.u, e.v]));
      let stem: Edge[] = [];
      let root = "";
      for (const v of cv) {
        const p = pathBetween(es, leaves[0], v);
        if (!root || p.length < stem.length) {
          root = v;
          stem = p;
        }
      }
      const ring = orderedCycle(cycle, root);
      stem.forEach((e, i) => (coeff[e.id] = (i % 2 ? -1 : 1) * 2));
      const first = stem.length ? -coeff[stem[stem.length - 1].id] / 2 : 1;
      ring.forEach((e, i) => (coeff[e.id] = (i % 2 ? -1 : 1) * first));
      path = [...stem, ...ring];
    }
    const slope = path.reduce(
      (s, e) => s + (coeff[e.id] * e.profit) / e.demand,
      0,
    );
    if (slope < -EPS) for (const id in coeff) coeff[id] *= -1;
    const delta = Math.min(
      ...path.map((e) =>
        coeff[e.id] > 0
          ? (e.demand - t.x[e.id]) / coeff[e.id]
          : t.x[e.id] / -coeff[e.id],
      ),
    );
    t.add(
      "Augment",
      balloon
        ? "Follow a leaf-to-itself balloon"
        : "Choose a leaf-to-leaf path",
      balloon
        ? "Traverse the stem and the odd cycle. The stem changes by ±2δ and the cycle by ±δ, preserving every internal node load."
        : "Alternate +δ and −δ along the fractional path. Compare both directions using marginal profit pₑ/dₑ, and use the nondecreasing direction.",
      {
        active: path.map((e) => e.id),
        focusNodes: leaves.slice(0, balloon ? 1 : 2),
        formula: `δ = ${fmt(delta)} · profit change = +${fmt(Math.abs(slope) * delta)}`,
        table: {
          headers: ["Edge", "x before", "Change", "x after"],
          rows: path.map((e) => [
            e.id,
            fmt(t.x[e.id]),
            `${coeff[e.id] > 0 ? "+" : ""}${fmt(coeff[e.id] * delta)}`,
            fmt(t.x[e.id] + coeff[e.id] * delta),
          ]),
        },
      },
    );
    const tightened: Edge[] = [];
    for (const e of path) {
      t.x[e.id] = Math.max(
        0,
        Math.min(e.demand, t.x[e.id] + coeff[e.id] * delta),
      );
      if (t.x[e.id] < EPS) {
        t.x[e.id] = 0;
        active.delete(e.id);
        t.discarded.push(e.id);
      } else if (t.x[e.id] >= e.demand - EPS) {
        t.x[e.id] = e.demand;
        active.delete(e.id);
        tightened.push(e);
        t.colors[e.id] = "copper";
      }
    }
    for (const v of Object.keys(deg))
      if (!g.edges.some((e) => active.has(e.id) && incident(e, v))) {
        const last = tightened.filter((e) => incident(e, v)).at(-1);
        if (last)
          t.bronze[last.id] = [...new Set([...(t.bronze[last.id] || []), v])];
      }
    for (const e of tightened)
      if (t.bronze[e.id]?.length) t.colors[e.id] = "bronze";
    t.add(
      "Augment",
      "Advance to an edge boundary",
      "Push as far as possible: at least one edge reaches 0 or its full demand. Drop zero edges and freeze tight edges. Endpoint loads may exceed capacity temporarily; final selection resolves these conflicts.",
      { active: path.map((e) => e.id), formula: `xₑ ← xₑ + aₑδ; 0 ≤ xₑ ≤ dₑ` },
    );
  }
  for (const id of active) {
    const e = g.edges.find((e) => e.id === id)!;
    t.colors[id] = "bronze";
    t.bronze[id] = [e.u, e.v];
  }
  t.add(
    "Color",
    "The fractional support is a matching",
    "Each remaining fractional edge is bronze at both endpoints. A tight edge is bronze if it was the last fractional edge to tighten at an endpoint; other retained edges are copper.",
    {
      active: [...active],
      table: {
        headers: ["Edge", "Color", "Bronze at"],
        rows: g.edges
          .filter((e) => t.colors[e.id])
          .map((e) => [
            e.id,
            t.colors[e.id],
            t.bronze[e.id]?.join(", ") || "—",
          ]),
      },
    },
  );
}
function deterministic(g: Graph, t: Trace): string[] {
  const kind = graphKind(g);
  const tight = g.edges
    .filter((e) => t.x[e.id] >= e.demand - EPS)
    .map((e) => e.id);
  let fractional = g.edges
    .filter((e) => t.x[e.id] > EPS && t.x[e.id] < e.demand - EPS)
    .map((e) => e.id);
  const red: string[] = [];
  if (!kind.tree) {
    for (const comp of components(g, fractional)) {
      const cycle = cycleEdges(g.edges.filter((e) => comp.includes(e.id)));
      if (!cycle.length) continue;
      let e = cycle.find((e) => t.x[e.id] <= e.demand / 2 + EPS);
      if (e) {
        red.push(e.id);
        t.colors[e.id] = "red";
      } else {
        e = [...cycle].sort(
          (a, b) => a.demand - t.x[a.id] - (b.demand - t.x[b.id]),
        )[0];
        tight.push(e.id);
        t.x[e.id] = e.demand;
        t.colors[e.id] = "copper";
      }
      fractional = fractional.filter((id) => id !== e!.id);
      t.add(
        "Cycle removal",
        "Break an odd fractional cycle",
        red.includes(e.id)
          ? `Set ${e.id} aside in S because xₑ ≤ dₑ/2. Its integral profit is at least twice its fractional contribution.`
          : `Add ${e.id} to the tight-edge candidate using Lemma 4.2.`,
        { active: [e.id] },
      );
    }
    t.add(
      "Decompose",
      "Separate the candidate matchings",
      "Keep tight edges as one feasible candidate. Apply tree augmentation to the remaining fractional forest; compare the resulting two color classes and any red-edge candidate.",
      { selected: tight },
    );
  }
  augment(g, t, kind.tree ? g.edges.map((e) => e.id) : fractional, false);
  // In the non-tree case §4.1 colors only the original fractional forest.
  const forestIds = kind.tree ? g.edges.map((e) => e.id) : fractional;
  const colors = Object.fromEntries(
    Object.entries(t.colors).filter(([id]) => forestIds.includes(id)),
  ) as Record<string, Color>;
  const c = conflictGraph(g, colors, t.bronze),
    parts = bipartition(c);
  const candidates = [
    c.vertices.filter((id) => parts[id] === 0),
    c.vertices.filter((id) => parts[id] === 1),
  ];
  if (!kind.tree) candidates.push(tight, red);
  t.add(
    "Partition",
    "Build two feasible color classes",
    "Give each bronze edge a different class from every edge conflicting with it at an endpoint. Within each class, all node capacities are respected.",
    {
      conflict: c,
      partitions: parts,
      selected: candidates[0],
      table: {
        headers: ["Candidate", "Edges", "Profit"],
        rows: candidates.map((ids, i) => [
          `M${i + 1}`,
          ids.join(", ") || "∅",
          fmt(profit(g, ids)),
        ]),
      },
    },
  );
  const best = candidates.reduce(
    (a, b) => (profit(g, a) >= profit(g, b) ? a : b),
    [] as string[],
  );
  t.add(
    "Result",
    "Choose the most profitable matching",
    "Compare the feasible candidates and keep the one with largest total edge profit.",
    { selected: best, value: profit(g, best), conflict: c, partitions: parts },
  );
  return best;
}
function randomized(
  g: Graph,
  t: Trace,
  c: Conflict,
  p: number,
  seed: number,
): string[] {
  const random = rng(seed),
    labels: Record<string, number> = {},
    bronze = c.vertices.filter((id) => t.colors[id] === "bronze"),
    bset = new Set(bronze);
  for (const root of bronze)
    if (labels[root] === undefined) {
      const q = [root],
        parent: Record<string, string> = {};
      for (let i = 0; i < q.length; i++) {
        const v = q[i],
          par = parent[v],
          chance = par === undefined ? p : labels[par] === 1 ? 0 : p / (1 - p),
          draw = random();
        labels[v] = draw < chance ? 1 : 0;
        t.add(
          "Label",
          "Label the bronze forest",
          `${v}${par ? ` follows parent ${par} (label ${labels[par]})` : " is a root"}. Label 1 means discard, not select. A parent labelled 1 forces its child to 0.`,
          {
            conflict: c,
            labels,
            active: [v],
            formula: `Pr(label 1) = ${fmt(chance)}; draw = ${fmt(draw)} → ${labels[v]}`,
          },
        );
        for (const u of neighbors(c, v, bset))
          if (u !== par && labels[u] === undefined && !q.includes(u)) {
            q.push(u);
            parent[u] = v;
          }
      }
    }
  const survive = new Set(bronze.filter((v) => labels[v] === 0)),
    selected: string[] = [],
    parts: Record<string, number> = {};
  t.add(
    "Discard",
    "Remove bronze vertices labelled 1",
    "The zero-labelled vertices form a collection of trees. Each surviving tree can be split into two independent color classes.",
    {
      conflict: c,
      labels,
      discarded: [...t.discarded, ...bronze.filter((v) => labels[v] === 1)],
    },
  );
  const seen = new Set<string>();
  for (const root of survive)
    if (!seen.has(root)) {
      seen.add(root);
      const q = [root];
      parts[root] = 0;
      for (let i = 0; i < q.length; i++)
        for (const v of neighbors(c, q[i], survive))
          if (!seen.has(v)) {
            seen.add(v);
            q.push(v);
            parts[v] = 1 - parts[q[i]];
          }
      const coin = random() < 0.5 ? 0 : 1;
      selected.push(...q.filter((v) => parts[v] === coin));
      t.add(
        "Sample",
        "Flip a fair coin for this tree",
        `Choose class ${coin + 1} of the surviving tree rooted at ${root}. Each bronze vertex is selected with probability (1 − p)/2.`,
        {
          conflict: c,
          labels,
          partitions: parts,
          active: q,
          selected: [...selected],
          formula: `Pr(bronze selected) = (1 − ${fmt(p)})/2 = ${fmt((1 - p) / 2)}`,
        },
      );
    }
  for (const v of c.vertices.filter((id) => t.colors[id] === "copper")) {
    const blocked = neighbors(c, v).filter((id) => selected.includes(id));
    if (!blocked.length) selected.push(v);
    t.add(
      "Copper",
      "Greedily add an available copper vertex",
      blocked.length
        ? `${v} is blocked by selected ${blocked.join(", ")}.`
        : `${v} has no selected bronze neighbour, so it can safely join the stable set.`,
      {
        conflict: c,
        labels,
        partitions: parts,
        selected: [...selected],
        active: [v],
      },
    );
  }
  return compareRed(g, t, selected, c, false);
}
function compareRed(
  g: Graph,
  t: Trace,
  selected: string[],
  c: Conflict,
  unit: boolean,
) {
  const red = g.edges.filter((e) => t.colors[e.id] === "red").map((e) => e.id);
  const best =
    profit(g, red, unit) > profit(g, selected, unit) ? red : selected;
  t.add(
    "Result",
    red.length
      ? "Compare red and nonred matchings"
      : "Map the stable set back to the graph",
    red.length
      ? "Red edges are themselves a feasible matching. Keep the more profitable of the red set and the selected nonred stable set."
      : "Every selected conflict-graph vertex corresponds to an original edge. The resulting demand matching respects every node capacity.",
    {
      conflict: c,
      selected: best,
      value: profit(g, best, unit),
      table: {
        headers: ["Candidate", unit ? "Cardinality" : "Profit"],
        rows: [
          ["Nonred", fmt(profit(g, selected, unit))],
          ["Red", fmt(profit(g, red, unit))],
        ],
      },
    },
  );
  return best;
}
function cardinality(g: Graph, t: Trace, c: Conflict): string[] {
  const alive = new Set(c.vertices),
    selected: string[] = [];
  let count = 0;
  const neigh = (v: string) => neighbors(c, v, alive),
    bn = (v: string) => neigh(v).filter((u) => t.colors[u] === "bronze"),
    cn = (v: string) => neigh(v).filter((u) => t.colors[u] === "copper");
  while (alive.size) {
    if (++count > c.vertices.length + 1)
      throw Error("Cardinality recursion did not converge.");
    let S: string[] = [],
      title = "",
      desc = "";
    const isolated = [...alive].find((v) => !neigh(v).length);
    const leafCopper = [...alive].find(
      (v) => t.colors[v] === "copper" && neigh(v).length === 1,
    );
    if (isolated) {
      S = [isolated];
      title = "Select an isolated vertex";
      desc =
        "This vertex has no remaining conflicts, so include it immediately.";
    } else if (leafCopper) {
      S = [leafCopper];
      title = "Select a degree-one copper vertex";
      desc = "Include this copper vertex and remove its only bronze neighbour.";
    } else {
      const branching = [...alive].find(
        (v) => t.colors[v] === "bronze" && cn(v).length >= 2,
      );
      if (branching) {
        const B = new Set([branching]),
          C = new Set<string>(),
          q = [branching];
        for (let i = 0; i < q.length; i++) {
          const fresh = cn(q[i]).filter((v) => !C.has(v));
          fresh.forEach((v) => C.add(v));
          for (const v of fresh)
            for (const b of bn(v))
              if (!B.has(b)) {
                B.add(b);
                q.push(b);
              }
          t.add(
            "BFS",
            "Expand through nontree arcs",
            `Grow the alternating bronze/copper search from ${branching}. Copper vertices never conflict with each other.`,
            {
              conflict: c,
              active: [...B, ...C],
              selected: [...selected],
              discarded: [
                ...t.discarded,
                ...c.vertices.filter(
                  (v) => !alive.has(v) && !selected.includes(v),
                ),
              ],
              table: {
                headers: ["Bronze reached", "Copper reached"],
                rows: [[[...B].join(", "), [...C].join(", ")]],
              },
            },
          );
        }
        S = [...C];
        title = "Select the copper BFS layers";
        desc = "The copper set S is independent and |Γ(S)| ≤ 1 + |S| ≤ 3|S|/2.";
      } else {
        const zeroBronze = [...alive].find(
          (v) => t.colors[v] === "bronze" && bn(v).length === 0,
        );
        if (zeroBronze) {
          S = [zeroBronze];
          title = "Select a singleton bronze tree";
          desc = "This bronze vertex has at most one copper neighbour.";
        } else {
          const leaves = [...alive].filter(
            (v) => t.colors[v] === "bronze" && bn(v).length === 1,
          );
          let handled = false;
          for (const v of leaves) {
            const u = bn(v)[0],
              x = cn(v)[0],
              y = cn(u)[0];
            if (!x && !y) {
              S = [v];
              title = "Case (i): neither has a copper neighbour";
              desc = `Select leaf ${v}; remove it and its parent ${u}.`;
              handled = true;
              break;
            }
            if (y) {
              S = [v, y];
              title = x
                ? "Case (iii): both have copper neighbours"
                : "Case (ii): only the parent has a copper neighbour";
              desc = `Select ${v} and ${y}; remove their neighbours. At least two of every five removed vertices are retained.`;
              handled = true;
              break;
            }
          }
          if (!handled) {
            const depth: Record<string, number> = {},
              parent: Record<string, string> = {};
            for (const r of alive)
              if (t.colors[r] === "bronze" && depth[r] === undefined) {
                depth[r] = 0;
                const q = [r];
                for (let i = 0; i < q.length; i++)
                  for (const v of bn(q[i]))
                    if (depth[v] === undefined) {
                      depth[v] = depth[q[i]] + 1;
                      parent[v] = q[i];
                      q.push(v);
                    }
              }
            const v = [...leaves].sort((a, b) => depth[b] - depth[a])[0],
              u = bn(v)[0],
              children = bn(u).filter((w) => parent[w] === u);
            if (children.length >= 2) {
              S = children;
              title = "Case (iv): select the sibling leaves";
              desc =
                "Several deepest leaves share a parent. Their only other neighbours are distinct copper vertices, satisfying the removal bound.";
            } else {
              const x = cn(v)[0],
                w = bn(u).find((z) => z !== v),
                y = w ? cn(w)[0] : undefined;
              S = [u, x, ...(y ? [y] : [])];
              title = "Case (iv): deepest-leaf configuration";
              desc = `Select parent ${u}, copper neighbour ${x}${y ? `, and ${y}` : ""}; remove their neighbours.`;
            }
          }
        }
      }
    }
    S = [...new Set(S)];
    let extension = false;
    if (S.some((v) => neigh(v).some((u) => S.includes(u)))) {
      // Figure 7(iii) names distinct copper neighbours. On a nonbipartite
      // input they may coincide, producing a triangle, so {v,y} is not stable.
      // Keep this extra case explicit in the teaching trace rather than silently
      // returning an infeasible set or claiming the paper's 2/5 removal bound.
      const copper = [...alive].find(
        (v) =>
          t.colors[v] === "copper" &&
          bn(v).length === 2 &&
          neigh(bn(v)[0]).includes(bn(v)[1]),
      );
      if (!copper) throw Error("Unexpected overlapping greedy configuration.");
      S = [copper];
      extension = true;
      title = "Overlapping neighbours: resolve a triangle";
      desc =
        "In this nonbipartite graph, the two copper neighbours in Figure 7(iii) coincide. The named pair would not be independent. This explicit extension selects the copper vertex and removes its two neighbours; the paper’s 2/5 removal bound is not asserted for this run.";
    }
    const gamma = [...new Set(S.flatMap(neigh))].filter((v) => !S.includes(v));
    if (!extension && gamma.length > 1.5 * S.length + EPS)
      throw Error("The greedy structural invariant was violated.");
    t.add("Greedy", title, desc, {
      conflict: c,
      active: [...S, ...gamma],
      selected: [...selected, ...S],
      discarded: [
        ...t.discarded,
        ...c.vertices.filter((v) => !alive.has(v) && !selected.includes(v)),
      ],
      formula: extension
        ? `Triangle extension: select 1, remove 2 neighbours`
        : `|S| = ${S.length}; |Γ(S)| = ${gamma.length} ≤ 1.5 × ${S.length}`,
      table: {
        headers: ["Select S", "Remove Γ(S)"],
        rows: [[S.join(", "), gamma.join(", ") || "∅"]],
      },
    });
    selected.push(...S);
    [...S, ...gamma].forEach((v) => alive.delete(v));
    t.add(
      "Remove",
      "Recurse on the remaining conflict graph",
      "Keep the selected vertices and delete them together with their neighbours. The remaining graph retains the bronze-forest/copper structure.",
      {
        conflict: c,
        selected: [...selected],
        discarded: [
          ...t.discarded,
          ...c.vertices.filter((v) => !alive.has(v) && !selected.includes(v)),
        ],
      },
    );
  }
  return compareRed(g, t, selected, c, true);
}

type Item = { id: string; demand: number; gain: number };
export function knapsack(
  items: Item[],
  capacity: number,
  eta: number,
  onRow?: (
    item: Item,
    scale: number,
    rows: { q: number; weight: number; ids: string[] }[],
  ) => void,
): string[] {
  const valid = items.filter((i) => i.demand <= capacity && i.gain > EPS);
  if (!valid.length) return [];
  const scale =
    ((eta / (1 + eta)) * Math.max(...valid.map((i) => i.gain))) / valid.length;
  let states = new Map<number, { weight: number; ids: string[] }>([
    [0, { weight: 0, ids: [] }],
  ]);
  for (const item of valid) {
    const q = Math.floor(item.gain / scale + 1e-9),
      next = new Map(states);
    for (const [v, s] of states) {
      const w = s.weight + item.demand;
      if (
        w <= capacity + EPS &&
        (!next.has(v + q) || w < next.get(v + q)!.weight)
      )
        next.set(v + q, { weight: w, ids: [...s.ids, item.id] });
    }
    // Dominated scaled-profit states can never improve a later solution.
    let minWeight = Infinity;
    states = new Map();
    for (const [v, s] of [...next].sort((a, b) => b[0] - a[0]))
      if (s.weight < minWeight) {
        states.set(v, s);
        minWeight = s.weight;
      }
    onRow?.(
      item,
      scale,
      [...states].map(([q, s]) => ({ q, ...s })),
    );
  }
  return states.get(Math.max(...states.keys()))!.ids;
}
function fptas(g: Graph, t: Trace, epsilon: number, root: string): string[] {
  const parent: Record<string, string> = {},
    parentEdge: Record<string, Edge> = {},
    order = [root];
  for (let i = 0; i < order.length; i++)
    for (const e of g.edges.filter((e) => incident(e, order[i]))) {
      const v = other(e, order[i]);
      if (v !== parent[order[i]]) {
        parent[v] = order[i];
        parentEdge[v] = e;
        order.push(v);
      }
    }
  const eta = Math.log(1 + epsilon) / g.nodes.length;
  const A: Record<string, string[]> = {},
    B: Record<string, string[]> = {};
  t.add(
    "Root",
    "Orient the tree away from the root",
    `Root the tree at ${root} and visit children before their parents. Aᵢ leaves the parent edge out; Bᵢ reserves capacity for that edge.`,
    {
      focusNodes: [root],
      formula: `η = ln(1 + ε)/n = ${fmt(eta)}; ε = ${epsilon}`,
      table: {
        headers: ["Bottom-up order"],
        rows: [[...order].reverse().join(" → ")].map((v) => [v]),
      },
    },
  );
  for (const v of [...order].reverse()) {
    const node = g.nodes.find((n) => n.id === v)!,
      children = order.filter((u) => parent[u] === v);
    if (!children.length) {
      A[v] = [];
      B[v] = [];
      t.add(
        "Leaf",
        `Initialize leaf ${v}`,
        "A leaf has no child edges. Both subproblem profits start at zero; its parent decides whether to take the connecting edge.",
        { focusNodes: [v], formula: "α′ᵢ = β′ᵢ = 0" },
      );
      continue;
    }
    const items = children.map((u) => ({
      id: parentEdge[u].id,
      demand: parentEdge[u].demand,
      gain: profit(g, B[u]) + parentEdge[u].profit - profit(g, A[u]),
    }));
    t.add(
      "Candidates",
      `Build the local knapsack at ${v}`,
      "An item represents taking a child edge and switching that child from A to B. Include only positive-gain candidates. The sum of child A profits is the baseline.",
      {
        focusNodes: [v],
        active: items.filter((i) => i.gain > EPS).map((i) => i.id),
        formula: "gainⱼ = β′ⱼ + pₑⱼ − α′ⱼ",
        table: {
          headers: ["Child edge", "Demand", "α′ child", "β′ child", "Gain"],
          rows: children.map((u, j) => [
            parentEdge[u].id,
            parentEdge[u].demand,
            fmt(profit(g, A[u])),
            fmt(profit(g, B[u])),
            fmt(items[j].gain),
          ]),
        },
      },
    );
    for (const state of ["A", "B"] as const) {
      if (state === "B" && v === root) {
        B[v] = [];
        continue;
      }
      const capacity =
        node.capacity - (state === "B" ? parentEdge[v].demand : 0);
      t.add(
        "Knapsack",
        `Solve ${state} at ${v}`,
        state === "A"
          ? "Use the full node capacity because the parent edge is excluded."
          : "Subtract the parent edge demand before choosing child edges.",
        {
          focusNodes: [v],
          formula: `capacity = ${fmt(capacity)}; baseline = ${fmt(children.reduce((s, u) => s + profit(g, A[u]), 0))}`,
        },
      );
      const chosen = knapsack(items, capacity, eta, (item, scale, frontier) => {
        const sorted = [...frontier].sort((a, b) => a.q - b.q);
        const sample =
          sorted.length <= 12
            ? sorted
            : sorted.filter(
                (_, i) =>
                  i === 0 ||
                  i === sorted.length - 1 ||
                  i % Math.ceil(sorted.length / 10) === 0,
              );
        t.add(
          "Scale & DP",
          `Consider ${item.id} in ${state}(${v})`,
          "Round gains down to scaled integers. For each attainable scaled profit, retain the least demand. Dominated states are removed; the table samples the frontier if it is long.",
          {
            focusNodes: [v],
            active: [item.id],
            formula: `K = ${scale.toPrecision(4)}; qₑ = floor(gainₑ/K) = ${Math.floor(item.gain / scale + 1e-9)}; ${frontier.length} states`,
            table: {
              headers: ["Scaled profit", "Min. demand", "Child edges"],
              rows: sample.map((s) => [s.q, s.weight, s.ids.join(", ") || "∅"]),
            },
          },
        );
      });
      const ids = children.flatMap((u) =>
        chosen.includes(parentEdge[u].id) ? [...B[u], parentEdge[u].id] : A[u],
      );
      if (state === "A") A[v] = ids;
      else B[v] = ids;
      t.add(
        "Combine",
        `Store ${state}(${v})`,
        "Combine the chosen child B solutions with their connecting edges, and use A for every unchosen child. Store the actual feasible edge set for reconstruction.",
        {
          focusNodes: [v],
          selected: ids,
          active: chosen,
          value: profit(g, ids),
          formula: `${state === "A" ? "α′" : "β′"}(${v}) = ${fmt(profit(g, ids))}`,
        },
      );
    }
  }
  const result = A[root];
  t.add(
    "Result",
    "Reconstruct the root solution",
    "The root A solution is the demand matching. The local approximation budget accumulates across the tree within the requested global factor.",
    {
      selected: result,
      value: profit(g, result),
      formula: `OPT ≤ (1 + ε) · result = ${fmt(1 + epsilon)} × ${fmt(profit(g, result))}`,
      table: {
        headers: ["Node", "α′ (A)", "β′ (B)"],
        rows: order.map((v) => [
          v,
          fmt(profit(g, A[v])),
          v === root ? "—" : fmt(profit(g, B[v])),
        ]),
      },
    },
  );
  return result;
}
export function runAlgorithm(
  input: Graph,
  mode: Mode,
  p = 0.276,
  epsilon = 0.1,
  seed = 42,
  root?: string,
): Run {
  const t = new Trace();
  try {
    if (!input.nodes.length) throw Error("Add a node to begin.");
    if (input.nodes.some((n) => !Number.isFinite(n.capacity) || n.capacity < 1))
      throw Error("Node capacities must be positive.");
    if (
      input.edges.some(
        (e) =>
          !Number.isFinite(e.demand) ||
          e.demand <= 0 ||
          !Number.isFinite(e.profit) ||
          e.profit <= 0,
      )
    )
      throw Error("Edge demands and profits must be positive.");
    if (mode === "fptas" && !graphKind(input).tree)
      throw Error(
        "Section 6 applies to a connected simple tree. Generate a tree or remove cycles and connect the components.",
      );
    if (mode === "random" && !(p >= 0 && p <= 0.5))
      throw Error("The labelling probability p must lie between 0 and 0.5.");
    if (mode === "fptas" && !(epsilon >= 0.05 && epsilon <= 1))
      throw Error("Choose ε between 0.05 and 1.");
    const unit = mode === "cardinality";
    const invalid = input.edges.filter((e) =>
      input.nodes.some((n) => incident(e, n.id) && n.capacity < e.demand),
    );
    // A tree FPTAS keeps infeasible parent edges as structural links; B is never chosen for them.
    const g: Graph = {
      nodes: input.nodes,
      edges: (mode === "fptas"
        ? input.edges
        : input.edges.filter((e) => !invalid.includes(e))
      ).map((e) => ({ ...e, profit: unit ? 1 : e.profit })),
    };
    if (mode === "fptas" && invalid.length)
      throw Error(
        `Edge ${invalid[0].id} exceeds an endpoint capacity. Reduce its demand before running the tree FPTAS.`,
      );
    if (invalid.length) {
      t.discarded = invalid.map((e) => e.id);
      t.add(
        "Preprocess",
        "Discard individually infeasible edges",
        `${invalid.map((e) => e.id).join(", ")} exceed an endpoint capacity and cannot be in any demand matching.`,
      );
    }
    if (mode === "fptas") {
      const r =
        root && g.nodes.some((n) => n.id === root) ? root : g.nodes[0].id;
      const result = fptas(g, t, epsilon, r);
      if (!feasible(g, result)) throw Error("FPTAS feasibility check failed.");
      return {
        steps: t.steps,
        lp: 0,
        result,
        guarantee: `(1 + ε) = ${fmt(1 + epsilon)} approximation`,
      };
    }
    t.x = solveLP(g);
    const lp = g.edges.reduce(
      (s, e) => s + (t.x[e.id] * e.profit) / e.demand,
      0,
    );
    t.discarded = [
      ...new Set([
        ...t.discarded,
        ...g.edges.filter((e) => t.x[e.id] < EPS).map((e) => e.id),
      ]),
    ];
    t.add(
      "LP relaxation",
      "Start from a basic optimal fractional solution",
      unit
        ? "For Section 5, set every profit to 1 and solve the LP again. xₑ measures allocated demand, not a 0–1 selection fraction."
        : "Solve max Σ(pₑ/dₑ)xₑ subject to Σxₑ ≤ bᵥ and 0 ≤ xₑ ≤ dₑ. Tight means xₑ = dₑ; fractional means 0 < xₑ < dₑ.",
      {
        formula: `LP value = ${fmt(lp)}; selection fraction = xₑ/dₑ`,
        table: {
          headers: ["Edge", "xₑ", "Demand", "xₑ/dₑ", "Contribution"],
          rows: g.edges.map((e) => [
            e.id,
            fmt(t.x[e.id]),
            e.demand,
            fmt(t.x[e.id] / e.demand),
            fmt((t.x[e.id] * e.profit) / e.demand),
          ]),
        },
      },
    );
    let result: string[] = [],
      guarantee = "";
    const kind = graphKind(g);
    if (mode === "augment") {
      result = deterministic(g, t);
      guarantee = kind.tree
        ? "2-approximation"
        : kind.bipartite
          ? "3-approximation"
          : "3.5-approximation";
    } else {
      g.edges
        .filter((e) => t.x[e.id] >= e.demand - EPS)
        .forEach((e) => (t.colors[e.id] = "copper"));
      augment(
        g,
        t,
        g.edges.map((e) => e.id),
        true,
      );
      const c = conflictGraph(g, t.colors, t.bronze);
      t.add(
        "Conflict graph",
        "Turn edges into conflict vertices",
        "Each retained nonred edge becomes a vertex in G′. Connect two vertices only if their original edges share an endpoint at which at least one is bronze. A stable set here is a feasible demand matching.",
        {
          conflict: c,
          formula: `${c.vertices.length} vertices · ${c.arcs.length} conflicts`,
        },
      );
      if (mode === "random") {
        result = randomized(g, t, c, p, seed);
        guarantee =
          Math.abs(p - 0.2763932) < 0.0005
            ? kind.bipartite
              ? "≈2.764 in expectation"
              : "General graph: compare red and sampled nonred sets"
            : "Custom p; inspect the sampled feasible result";
      } else if (mode === "cardinality") {
        result = cardinality(g, t, c);
        guarantee = t.steps.some(
          (s) => s.title === "Overlapping neighbours: resolve a triangle",
        )
          ? "Feasible extension · paper bound not asserted"
          : kind.bipartite
            ? "2.5-approximation (cardinality)"
            : "Paper’s general-graph greedy procedure";
      } else {
        guarantee = "Structural transformation; no matching selected";
        t.add(
          "Result",
          "Bronze, copper, and red coloring complete",
          "This is the preprocessing used by Sections 4.3 and 5. Copper edges at each endpoint are collectively feasible, bronze vertices form a forest in G′, and red edges form a matching.",
          { conflict: c },
        );
      }
    }
    if (mode !== "color" && !feasible(g, result))
      throw Error("The result failed the capacity check.");
    return { steps: t.steps, lp, result, guarantee };
  } catch (e) {
    return {
      steps: t.steps,
      lp: 0,
      result: [],
      guarantee: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
