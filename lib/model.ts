export type Node = { id: string; capacity: number; x: number; y: number };
export type Edge = {
  id: string;
  u: string;
  v: string;
  demand: number;
  profit: number;
};
export type Graph = { nodes: Node[]; edges: Edge[] };
export type Mode = "augment" | "color" | "random" | "cardinality" | "fptas";
export type Kind = "tree" | "bipartite" | "general";
export type Color = "bronze" | "copper" | "red";
export type Conflict = { vertices: string[]; arcs: [string, string][] };
export type Step = {
  phase: string;
  title: string;
  description: string;
  formula?: string;
  x: Record<string, number>;
  colors: Record<string, Color>;
  bronze: Record<string, string[]>;
  active: string[];
  selected: string[];
  discarded: string[];
  focusNodes: string[];
  conflict?: Conflict;
  labels?: Record<string, number>;
  partitions?: Record<string, number>;
  table?: { headers: string[]; rows: (string | number)[][] };
  value?: number;
};
export type Run = {
  steps: Step[];
  lp: number;
  result: string[];
  guarantee: string;
  error?: string;
};
export const EPS = 1e-7;
export const fmt = (n: number) =>
  Number.isInteger(n)
    ? String(n)
    : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
export const incident = (e: Edge, v: string) => e.u === v || e.v === v;
export const other = (e: Edge, v: string) => (e.u === v ? e.v : e.u);
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function graphKind(g: Graph): { tree: boolean; bipartite: boolean } {
  const col: Record<string, number> = {};
  let components = 0,
    bipartite = true;
  for (const root of g.nodes)
    if (col[root.id] === undefined) {
      components++;
      col[root.id] = 0;
      const q = [root.id];
      for (let i = 0; i < q.length; i++)
        for (const e of g.edges.filter((e) => incident(e, q[i]))) {
          const v = other(e, q[i]);
          if (col[v] === undefined) {
            col[v] = 1 - col[q[i]];
            q.push(v);
          } else if (col[v] === col[q[i]]) bipartite = false;
        }
    }
  return {
    tree:
      g.nodes.length > 0 &&
      components === 1 &&
      g.edges.length === g.nodes.length - 1,
    bipartite,
  };
}
export function generateGraph(
  n: number,
  m: number,
  kind: Kind,
  seed: number,
): Graph {
  if (!Number.isInteger(n) || n < 1 || n > 24)
    throw Error("Choose 1–24 nodes.");
  const max =
    kind === "tree"
      ? n - 1
      : kind === "bipartite"
        ? Math.floor((n * n) / 4)
        : (n * (n - 1)) / 2;
  if (
    !Number.isInteger(m) ||
    m < 0 ||
    m > max ||
    (kind === "tree" && m !== n - 1)
  )
    throw Error(
      kind === "tree"
        ? "A tree needs exactly n − 1 edges."
        : `Choose 0–${max} edges for this graph type.`,
    );
  const r = rng(seed);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: String.fromCharCode(65 + i),
    capacity: ri(5, 14),
    x: 380 + 270 * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n),
    y: 255 + 185 * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n),
  }));
  const pairs: [number, number][] = [];
  if (kind === "tree")
    for (let i = 1; i < n; i++) pairs.push([ri(0, i - 1), i]);
  else {
    const possible: [number, number][] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (
          kind !== "bipartite" ||
          (i < Math.floor(n / 2) && j >= Math.floor(n / 2))
        )
          possible.push([i, j]);
    for (let i = possible.length - 1; i > 0; i--) {
      const j = ri(0, i);
      [possible[i], possible[j]] = [possible[j], possible[i]];
    }
    pairs.push(...possible.slice(0, m));
  }
  return {
    nodes,
    edges: pairs.map(([u, v], i) => ({
      id: `e${i + 1}`,
      u: nodes[u].id,
      v: nodes[v].id,
      demand: ri(2, Math.min(nodes[u].capacity, nodes[v].capacity)),
      profit: ri(2, 16),
    })),
  };
}
export const example: Graph = {
  nodes: [
    { id: "A", capacity: 6, x: 110, y: 125 },
    { id: "B", capacity: 7, x: 310, y: 125 },
    { id: "C", capacity: 6, x: 475, y: 250 },
    { id: "D", capacity: 5, x: 650, y: 250 },
    { id: "E", capacity: 7, x: 310, y: 375 },
    { id: "F", capacity: 6, x: 110, y: 375 },
  ],
  edges: [
    { id: "e1", u: "A", v: "B", demand: 4, profit: 10 },
    { id: "e2", u: "B", v: "C", demand: 5, profit: 5 },
    { id: "e3", u: "C", v: "E", demand: 5, profit: 6 },
    { id: "e4", u: "E", v: "F", demand: 4, profit: 10 },
    { id: "e5", u: "C", v: "D", demand: 4, profit: 1 },
  ],
};
export const oddExample: Graph = {
  nodes: [
    { id: "A", capacity: 5, x: 380, y: 90 },
    { id: "B", capacity: 5, x: 570, y: 350 },
    { id: "C", capacity: 5, x: 190, y: 350 },
  ],
  edges: [
    { id: "e1", u: "A", v: "B", demand: 5, profit: 5 },
    { id: "e2", u: "B", v: "C", demand: 5, profit: 5 },
    { id: "e3", u: "C", v: "A", demand: 5, profit: 5 },
  ],
};
export function profit(g: Graph, ids: string[], unit = false) {
  return g.edges
    .filter((e) => ids.includes(e.id))
    .reduce((s, e) => s + (unit ? 1 : e.profit), 0);
}
export function feasible(g: Graph, ids: string[]) {
  return g.nodes.every(
    (n) =>
      g.edges
        .filter((e) => ids.includes(e.id) && incident(e, n.id))
        .reduce((s, e) => s + e.demand, 0) <=
      n.capacity + EPS,
  );
}
