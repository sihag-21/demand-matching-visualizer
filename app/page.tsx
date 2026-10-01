"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import {
  Graph,
  Mode,
  Kind,
  Step,
  Edge,
  example,
  oddExample,
  generateGraph,
  graphKind,
  incident,
  fmt,
  profit,
  EPS,
} from "@/lib/model";
import { runAlgorithm } from "@/lib/algorithms";

const modes: {
  id: Mode;
  section: string;
  name: string;
  description: string;
}[] = [
  {
    id: "augment",
    section: "4.1",
    name: "Augmenting paths",
    description:
      "Push fractional demand along alternating paths, then partition into feasible matchings.",
  },
  {
    id: "color",
    section: "4.2",
    name: "Extended coloring",
    description:
      "Handle general graphs, balloons, and odd cycles with bronze, copper, and red edges.",
  },
  {
    id: "random",
    section: "4.3",
    name: "Randomized rounding",
    description:
      "Label the bronze forest, sample a color class, and add available copper vertices.",
  },
  {
    id: "cardinality",
    section: "5",
    name: "Maximum cardinality",
    description:
      "Use unit profits and follow the greedy stable-set cases, one removal at a time.",
  },
  {
    id: "fptas",
    section: "6",
    name: "Tree FPTAS",
    description:
      "Combine subtree solutions using scaled-profit knapsacks and a global error budget.",
  },
];
const palette = {
  bronze: "#b48338",
  copper: "#bd6550",
  red: "#d94f63",
  plain: "#82969e",
  active: "#176e64",
  selected: "#13856e",
};
const blank: Step = {
  phase: "Ready",
  title: "Your graph, ready to explore",
  description:
    "Edit the graph, choose a procedure, and start a run. Each step explains exactly what changes.",
  x: {},
  colors: {},
  bronze: {},
  active: [],
  selected: [],
  discarded: [],
  focusNodes: [],
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    next: (
      <>
        <path d="m7 5 9 7-9 7M19 5v14" />
      </>
    ),
    back: (
      <>
        <path d="m17 5-9 7 9 7M5 5v14" />
      </>
    ),
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 2 8M3 3v7h7" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    link: (
      <>
        <circle cx="5" cy="17" r="3" />
        <circle cx="19" cy="7" r="3" />
        <path d="m7 15 10-6" />
      </>
    ),
    shuffle: (
      <>
        <path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c5 0 7-12 12-12h3M17 2l4 4-4 4" />
      </>
    ),
    pointer: <path d="m5 3 4 18 4-7 7-3Z" />,
    check: <path d="m5 12 5 5L20 6" />,
    graph: (
      <>
        <path d="m5 18 7-12 7 12Z" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="19" cy="18" r="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.graph}
    </svg>
  );
}

export default function Page() {
  const [graph, setGraph] = useState<Graph>(example),
    [mode, setMode] = useState<Mode>("augment"),
    [tool, setTool] = useState<"select" | "edge" | "node">("select");
  const [selection, setSelection] = useState<{
      type: "node" | "edge";
      id: string;
    } | null>(null),
    [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [n, setN] = useState(6),
    [m, setM] = useState(5),
    [kind, setKind] = useState<Kind>("tree"),
    [seed, setSeed] = useState(42),
    [p, setP] = useState(0.276),
    [epsilon, setEpsilon] = useState(0.1),
    [root, setRoot] = useState("A");
  const [run, setRun] = useState<ReturnType<typeof runAlgorithm> | null>(null),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [notice, setNotice] = useState("");
  const [showConflict, setShowConflict] = useState(false),
    [showGuide, setShowGuide] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const info = modes.find((a) => a.id === mode)!,
    step = run?.steps[index] || blank,
    structural = graphKind(graph),
    selectedNode =
      selection?.type === "node"
        ? graph.nodes.find((v) => v.id === selection.id)
        : undefined,
    selectedEdge =
      selection?.type === "edge"
        ? graph.edges.find((e) => e.id === selection.id)
        : undefined;
  const finished = !!run && index === run.steps.length - 1 && !run.error;
  const selectionState =
    step.selected.length > 0 || (finished && mode !== "color");
  const value = selectionState
    ? profit(graph, step.selected, mode === "cardinality")
    : graph.edges.reduce(
        (s, e) =>
          s +
          ((step.x[e.id] || 0) * (mode === "cardinality" ? 1 : e.profit)) /
            e.demand,
        0,
      );
  function reset() {
    setRun(null);
    setIndex(0);
    setPlaying(false);
    setNotice("");
  }
  function replace(g: Graph) {
    reset();
    setGraph(g);
    setSelection(null);
    setEdgeStart(null);
    if (!g.nodes.some((v) => v.id === root)) setRoot(g.nodes[0]?.id || "A");
  }
  function start() {
    const r = runAlgorithm(graph, mode, p, epsilon, seed, root);
    setRun(r);
    setIndex(0);
    setPlaying(false);
    setNotice(r.error || "");
    setShowConflict(false);
  }
  function generate() {
    try {
      replace(generateGraph(n, m, kind, seed));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    if (!playing || !run) return;
    const id = setInterval(
      () =>
        setIndex((i) => {
          if (i >= run.steps.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1500 / speed,
    );
    return () => clearInterval(id);
  }, [playing, run, speed]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName))
        return;
      if (e.key === "ArrowRight" && run) {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, run.steps.length - 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "Escape") {
        setTool("select");
        setEdgeStart(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run]);
  const currentState = useRef({ graph, mode, index, run, step });
  currentState.current = { graph, mode, index, run, step };
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    const register = (tool: unknown) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: life.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "read_demand_matching_state",
      description:
        "Read the current graph, procedure and visible algorithm step.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => {
        const c = currentState.current;
        return {
          graph: c.graph,
          mode: c.mode,
          step: c.index,
          totalSteps: c.run?.steps.length || 0,
          phase: c.step.phase,
        };
      },
    });
    register({
      name: "navigate_algorithm_step",
      description: "Navigate to a zero-based step in the existing run.",
      inputSchema: {
        type: "object",
        properties: { index: { type: "integer", minimum: 0 } },
        required: ["index"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const target = (input as { index: number })?.index,
          c = currentState.current;
        if (
          !Number.isInteger(target) ||
          !c.run ||
          target < 0 ||
          target >= c.run.steps.length
        )
          throw Error("Step outside the current run.");
        flushSync(() => {
          setPlaying(false);
          setIndex(target);
        });
        return { index: target, phase: c.run.steps[target].phase };
      },
    });
    return () => life.abort();
  }, []);
  useEffect(() => {
    if (step.phase === "Conflict graph") setShowConflict(true);
    if (step.phase === "LP relaxation" || step.phase === "Root")
      setShowConflict(false);
  }, [step.phase]);
  const parents = useMemo(() => {
    const map: Record<string, string> = {};
    if (!structural.tree) return map;
    const q = [root];
    for (let i = 0; i < q.length; i++)
      for (const e of graph.edges.filter((e) => incident(e, q[i]))) {
        const v = e.u === q[i] ? e.v : e.u;
        if (v !== map[q[i]]) {
          map[v] = q[i];
          q.push(v);
        }
      }
    return map;
  }, [graph, root, structural.tree]);

  function point(
    e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>,
  ) {
    const el = svgRef.current!,
      pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const out = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return {
      x: Math.max(45, Math.min(715, out.x)),
      y: Math.max(55, Math.min(455, out.y)),
    };
  }
  function addNode(x: number, y: number) {
    if (graph.nodes.length >= 24) {
      setNotice("The visual workspace supports up to 24 nodes.");
      return;
    }
    let id = "A";
    for (let i = 0; i < 100; i++) {
      const s = i < 26 ? String.fromCharCode(65 + i) : `N${i}`;
      if (!graph.nodes.some((v) => v.id === s)) {
        id = s;
        break;
      }
    }
    replace({
      ...graph,
      nodes: [
        ...graph.nodes,
        { id, capacity: 5 + Math.floor(Math.random() * 10), x, y },
      ],
    });
    setSelection({ type: "node", id });
  }
  function chooseNode(id: string) {
    if (tool === "edge") {
      if (!edgeStart) {
        setEdgeStart(id);
        setSelection({ type: "node", id });
      } else if (id === edgeStart) {
        setEdgeStart(null);
      } else if (
        graph.edges.some((e) => incident(e, id) && incident(e, edgeStart))
      ) {
        setNotice(
          "These nodes already have an edge. Parallel edges are not used in this simple-graph workspace.",
        );
        setEdgeStart(null);
      } else {
        const a = graph.nodes.find((v) => v.id === edgeStart)!,
          b = graph.nodes.find((v) => v.id === id)!;
        let j = 1;
        while (graph.edges.some((e) => e.id === `e${j}`)) j++;
        const e: Edge = {
          id: `e${j}`,
          u: edgeStart,
          v: id,
          demand:
            1 + Math.floor(Math.random() * Math.min(a.capacity, b.capacity)),
          profit: 2 + Math.floor(Math.random() * 15),
        };
        reset();
        setGraph({ ...graph, edges: [...graph.edges, e] });
        setSelection({ type: "edge", id: e.id });
        setEdgeStart(null);
      }
    } else setSelection({ type: "node", id });
  }
  function edit(value: number, field: "capacity" | "demand" | "profit") {
    if (!Number.isFinite(value) || value < 1 || value > 10000) return;
    reset();
    if (selectedNode)
      setGraph({
        ...graph,
        nodes: graph.nodes.map((v) =>
          v.id === selectedNode.id ? { ...v, capacity: Math.round(value) } : v,
        ),
      });
    if (selectedEdge)
      setGraph({
        ...graph,
        edges: graph.edges.map((e) =>
          e.id === selectedEdge.id ? { ...e, [field]: Math.round(value) } : e,
        ),
      });
  }
  const nodeLoads = Object.fromEntries(
    graph.nodes.map((v) => [
      v.id,
      graph.edges
        .filter((e) => incident(e, v.id))
        .reduce(
          (s, e) =>
            s +
            (selectionState
              ? step.selected.includes(e.id)
                ? e.demand
                : 0
              : step.x[e.id] || 0),
          0,
        ),
    ]),
  );
  const conflict = step.conflict,
    positions = useMemo(
      () =>
        Object.fromEntries(
          (conflict?.vertices || []).map((id, i, a) => [
            id,
            {
              x:
                380 +
                Math.min(285, 70 + a.length * 13) *
                  Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / a.length),
              y:
                255 +
                Math.min(185, 60 + a.length * 10) *
                  Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / a.length),
            },
          ]),
        ),
      [conflict],
    );
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="graph" size={25} />
          </span>
          <span>
            Demand Matching <b>Lab</b>
          </span>
          <span className="brand-divider" />
          <span className="overline">ALGORITHM EXPLORER</span>
        </div>
        <button className="quiet" onClick={() => setShowGuide(!showGuide)}>
          How to use <span className="help-mark">?</span>
        </button>
      </header>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            SHEPHERD & VETTA · THE DEMAND-MATCHING PROBLEM
          </div>
          <h1>See the algorithm unfold.</h1>
          <p>Build a graph. Change the constraints. Follow every decision.</p>
        </div>
        <div className="paper-note">
          Mathematics of Operations Research
          <br />
          <strong>Sections 4–6 · 2007</strong>
        </div>
      </div>
      {showGuide && (
        <section className="guide">
          <button
            className="close"
            onClick={() => setShowGuide(false)}
            aria-label="Close guide"
          >
            ×
          </button>
          <h2>A small guide to the workspace</h2>
          <p>
            Select a node to edit its capacity. Select an edge to edit demand
            and profit. Choose <b>Connect</b>, then two nodes, to add an edge;{" "}
            <b>Add node</b> lets you click the canvas. Drag nodes to arrange
            them. All new values are randomly assigned and editable.
          </p>
          <p>
            Run a procedure and use the timeline, arrow buttons, or left/right
            keyboard arrows. <b>xₑ is allocated demand</b>; xₑ/dₑ is the
            fractional selection. Augmentation may temporarily overload
            endpoints. Only the resulting matchings must be feasible. Section 5
            uses unit profits; Section 6 requires a connected tree. Randomized
            guarantees are expectations across runs.
          </p>
          <p>
            Inputs and runs stay in this page’s memory; reload resets the
            workspace. The original paper remains on your computer.
          </p>
        </section>
      )}
      <nav className="procedure-tabs" aria-label="Algorithm sections">
        {modes.map((a) => (
          <button
            key={a.id}
            className={mode === a.id ? "current" : ""}
            onClick={() => {
              setMode(a.id);
              reset();
              setShowConflict(false);
            }}
          >
            <span className="section-number">§ {a.section}</span>
            <span>{a.name}</span>
            {mode === a.id && <span className="tab-dot" />}
          </button>
        ))}
      </nav>
      <div className="workspace">
        <aside className="settings panel">
          <div className="panel-title">
            <h2>Graph setup</h2>
            <span className="tiny-tag">EDITABLE</span>
          </div>
          <div className="setup-content">
            <div className="field">
              <label htmlFor="kind">Graph type</label>
              <select
                id="kind"
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as Kind;
                  setKind(k);
                  if (k === "tree") setM(n - 1);
                }}
              >
                <option value="tree">Tree</option>
                <option value="bipartite">Bipartite graph</option>
                <option value="general">General graph</option>
              </select>
            </div>
            <div className="field-pair">
              <div className="field">
                <label htmlFor="nodes">
                  Nodes <i>n</i>
                </label>
                <input
                  id="nodes"
                  type="number"
                  min="1"
                  max="24"
                  value={n}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setN(v);
                    if (kind === "tree") setM(v - 1);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="edges">
                  Edges <i>m</i>
                </label>
                <input
                  id="edges"
                  type="number"
                  min="0"
                  max="276"
                  value={m}
                  disabled={kind === "tree"}
                  onChange={(e) => setM(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="seed">
                Random seed <span>reproducible runs</span>
              </label>
              <input
                id="seed"
                type="number"
                min="0"
                value={seed}
                onChange={(e) => {
                  setSeed(Number(e.target.value));
                  reset();
                }}
              />
            </div>
            <button className="secondary full" onClick={generate}>
              <Icon name="shuffle" />
              Generate graph
            </button>
            <div className="presets">
              <span>Examples</span>
              <button onClick={() => replace(example)}>Branching tree</button>
              <button onClick={() => replace(oddExample)}>Odd cycle</button>
              <button
                onClick={() => { const g = generateGraph(12, 20, "general", 4); replace({ ...g, edges: g.edges.map(e => ({ ...e, profit: 1 })) }); }}
              >
                Balloon
              </button>
              <button
                onClick={() => replace(generateGraph(12, 20, "general", 3))}
              >
                Greedy BFS
              </button>
            </div>
          </div>
          <div className="inspector">
            <div className="panel-title">
              <h2>
                {selectedNode
                  ? `Node ${selectedNode.id}`
                  : selectedEdge
                    ? `Edge ${selectedEdge.id}`
                    : "Selection"}
              </h2>
              {selection && (
                <button
                  className="icon-button"
                  aria-label="Clear selection"
                  onClick={() => setSelection(null)}
                >
                  ×
                </button>
              )}
            </div>
            {selectedNode ? (
              <>
                <div className="field">
                  <label htmlFor="capacity">Capacity bᵥ</label>
                  <input
                    id="capacity"
                    type="number"
                    min="1"
                    max="10000"
                    value={selectedNode.capacity}
                    onChange={(e) => edit(Number(e.target.value), "capacity")}
                  />
                </div>
                <p className="muted small">
                  Maximum total demand this node can accept.
                </p>
              </>
            ) : selectedEdge ? (
              <>
                <p className="edge-pair">
                  {selectedEdge.u} <span>↔</span> {selectedEdge.v}
                </p>
                <div className="field-pair">
                  <div className="field">
                    <label htmlFor="demand">Demand dₑ</label>
                    <input
                      id="demand"
                      type="number"
                      min="1"
                      max="10000"
                      value={selectedEdge.demand}
                      onChange={(e) => edit(Number(e.target.value), "demand")}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="profit">Profit pₑ</label>
                    <input
                      id="profit"
                      disabled={mode === "cardinality"}
                      type="number"
                      min="1"
                      max="10000"
                      value={mode === "cardinality" ? 1 : selectedEdge.profit}
                      onChange={(e) => edit(Number(e.target.value), "profit")}
                    />
                  </div>
                </div>
                <p className="muted small">
                  {mode === "cardinality"
                    ? "This procedure uses profit 1 for every edge."
                    : `Marginal profit pₑ/dₑ = ${fmt(selectedEdge.profit / selectedEdge.demand)}`}
                </p>
                {step.x[selectedEdge.id] !== undefined && (
                  <p className="small">
                    Current xₑ = {fmt(step.x[selectedEdge.id])} · bronze at{" "}
                    {step.bronze[selectedEdge.id]?.join(", ") ||
                      "neither endpoint"}
                  </p>
                )}
              </>
            ) : (
              <div className="selection-empty">
                <Icon name="pointer" size={24} />
                <p>
                  Click a node or edge
                  <br />
                  to inspect and edit it.
                </p>
              </div>
            )}
            {selection && (
              <button
                className="delete"
                onClick={() => {
                  if (selectedNode)
                    replace({
                      nodes: graph.nodes.filter(
                        (v) => v.id !== selectedNode.id,
                      ),
                      edges: graph.edges.filter(
                        (e) => !incident(e, selectedNode.id),
                      ),
                    });
                  else if (selectedEdge)
                    replace({
                      ...graph,
                      edges: graph.edges.filter(
                        (e) => e.id !== selectedEdge.id,
                      ),
                    });
                }}
              >
                Delete {selection.type}
              </button>
            )}
          </div>
          <div className="parameters">
            <h2>Procedure settings</h2>
            {mode === "random" ? (
              <>
                <div className="field">
                  <label htmlFor="probability">Label probability p</label>
                  <input
                    id="probability"
                    type="number"
                    min="0"
                    max="0.5"
                    step="0.001"
                    value={p}
                    onChange={(e) => {
                      setP(Number(e.target.value));
                      reset();
                    }}
                  />
                </div>
                <p className="muted small">
                  Default 0.276. A child of a 0-labelled parent uses p/(1 − p).
                </p>
              </>
            ) : mode === "fptas" ? (
              <>
                <div className="field">
                  <label htmlFor="epsilon">Approximation ε</label>
                  <input
                    id="epsilon"
                    type="number"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={epsilon}
                    onChange={(e) => {
                      setEpsilon(Number(e.target.value));
                      reset();
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="root">Root node</label>
                  <select
                    id="root"
                    value={root}
                    onChange={(e) => {
                      setRoot(e.target.value);
                      reset();
                    }}
                  >
                    {graph.nodes.map((v) => (
                      <option key={v.id}>{v.id}</option>
                    ))}
                  </select>
                </div>
                <p className="muted small">
                  Smaller ε gives a tighter bound and more knapsack states.
                </p>
              </>
            ) : (
              <p className="muted small">
                {mode === "cardinality"
                  ? "All edge profits are treated as 1. The goal is to keep as many feasible edges as possible."
                  : "The LP is solved automatically. Edit a capacity, demand, or profit to explore another run."}
              </p>
            )}
          </div>
        </aside>
        <section className="center-column">
          <div className="graph-panel panel">
            <div className="graph-header">
              <div>
                <h2>{showConflict ? "Conflict graph G′" : "Your graph G"}</h2>
                <span className="muted small">
                  {graph.nodes.length} nodes · {graph.edges.length} edges{" "}
                  <span className="dot-separator">/</span>{" "}
                  {structural.tree
                    ? "Tree"
                    : structural.bipartite
                      ? "Bipartite"
                      : "General graph"}
                </span>
              </div>
              <div className="view-toggle">
                <button
                  className={!showConflict ? "active" : ""}
                  onClick={() => setShowConflict(false)}
                >
                  Original
                </button>
                <button
                  className={showConflict ? "active" : ""}
                  onClick={() => setShowConflict(true)}
                >
                  Conflict G′
                </button>
              </div>
            </div>
            {!showConflict && (
              <div className="canvas-tools">
                {(
                  [
                    { id: "select", icon: "pointer", name: "Select" },
                    { id: "edge", icon: "link", name: "Connect" },
                    { id: "node", icon: "plus", name: "Add node" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    className={tool === t.id ? "active" : ""}
                    onClick={() => {
                      setTool(t.id);
                      setEdgeStart(null);
                    }}
                  >
                    <Icon name={t.icon} size={16} />
                    {t.name}
                  </button>
                ))}
                <span>
                  {edgeStart
                    ? `Connect ${edgeStart} to another node`
                    : tool === "node"
                      ? "Click an empty spot"
                      : tool === "edge"
                        ? "Click two nodes"
                        : "Drag nodes to rearrange"}
                </span>
              </div>
            )}
            <div className="canvas-wrap">
              <svg
                ref={svgRef}
                className={`graph-canvas tool-${tool}`}
                viewBox="0 0 760 510"
                role="group"
                aria-label={
                  showConflict
                    ? "Conflict graph visualization"
                    : "Editable demand matching graph"
                }
                onClick={(e) => {
                  if (
                    !showConflict &&
                    tool === "node" &&
                    (e.target as Element).tagName !== "text"
                  ) {
                    const pos = point(e);
                    addNode(pos.x, pos.y);
                  }
                }}
                onPointerMove={(e) => {
                  if (!drag.current || showConflict) return;
                  const pos = point(e);
                  if (
                    Math.abs(pos.x - drag.current.x) +
                      Math.abs(pos.y - drag.current.y) >
                    4
                  )
                    drag.current.moved = true;
                  if (drag.current.moved)
                    setGraph((g) => ({
                      ...g,
                      nodes: g.nodes.map((v) =>
                        v.id === drag.current!.id ? { ...v, ...pos } : v,
                      ),
                    }));
                }}
                onPointerUp={() => {
                  if (drag.current) {
                    const { id, moved } = drag.current;
                    drag.current = null;
                    if (!moved) chooseNode(id);
                  }
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <defs>
                  <marker
                    id="tree-arrow"
                    markerWidth="7"
                    markerHeight="7"
                    refX="15"
                    refY="3.5"
                    orient="auto-start-reverse"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="#78949e" />
                  </marker>
                  <pattern
                    id="grid"
                    width="22"
                    height="22"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="1" cy="1" r="0.8" fill="#d7e0e2" />
                  </pattern>
                </defs>
                <rect width="760" height="510" fill="url(#grid)" />
                {showConflict ? (
                  conflict ? (
                    <>
                      {conflict.arcs.map(([a, b]) => (
                        <line
                          key={`${a}-${b}`}
                          x1={positions[a].x}
                          y1={positions[a].y}
                          x2={positions[b].x}
                          y2={positions[b].y}
                          stroke="#b4c2c5"
                          strokeWidth="2"
                          strokeDasharray={
                            step.colors[a] === "copper" ||
                            step.colors[b] === "copper"
                              ? "5 5"
                              : undefined
                          }
                          opacity={
                            step.discarded.includes(a) ||
                            step.discarded.includes(b)
                              ? 0.25
                              : 1
                          }
                        />
                      ))}
                      {conflict.vertices.map((id) => {
                        const pos = positions[id],
                          chosen = step.selected.includes(id),
                          discarded =
                            step.discarded.includes(id) ||
                            step.labels?.[id] === 1;
                        return (
                          <g
                            key={id}
                            className="graph-node"
                            role="button"
                            tabIndex={0}
                            aria-label={`Inspect conflict vertex ${id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelection({ type: "edge", id });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                setSelection({ type: "edge", id });
                            }}
                            opacity={discarded ? 0.32 : 1}
                          >
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r="30"
                              fill={chosen ? palette.selected : "#fff"}
                              stroke={
                                step.active.includes(id)
                                  ? palette.active
                                  : palette[step.colors[id] || "plain"]
                              }
                              strokeWidth={step.active.includes(id) ? 5 : 3}
                            />
                            <text
                              x={pos.x}
                              y={pos.y + 5}
                              textAnchor="middle"
                              fill={chosen ? "#fff" : "#263c44"}
                              className="node-id"
                            >
                              {id}
                            </text>
                            <text
                              x={pos.x}
                              y={pos.y + 51}
                              textAnchor="middle"
                              className="capacity-label"
                            >
                              {step.labels?.[id] !== undefined
                                ? `label ${step.labels[id]} · `
                                : ""}
                              {step.colors[id]}
                              {step.partitions?.[id] !== undefined
                                ? ` · class ${step.partitions[id] + 1}`
                                : ""}
                            </text>
                            {chosen && (
                              <text
                                x={pos.x + 25}
                                y={pos.y - 23}
                                className="check-label"
                              >
                                ✓
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  ) : (
                    <g>
                      <text
                        x="380"
                        y="235"
                        textAnchor="middle"
                        className="empty-title"
                      >
                        The conflict graph appears after coloring.
                      </text>
                      <text
                        x="380"
                        y="265"
                        textAnchor="middle"
                        className="capacity-label"
                      >
                        Run a procedure and advance to the “Conflict graph”
                        step.
                      </text>
                    </g>
                  )
                ) : (
                  <>
                    {graph.edges.map((e) => {
                      const a = graph.nodes.find((v) => v.id === e.u)!,
                        b = graph.nodes.find((v) => v.id === e.v)!,
                        active = step.active.includes(e.id),
                        chosen = step.selected.includes(e.id),
                        discarded = step.discarded.includes(e.id),
                        sel = selectedEdge?.id === e.id;
                      const color = chosen
                        ? palette.selected
                        : active
                          ? palette.active
                          : step.colors[e.id]
                            ? palette[step.colors[e.id]]
                            : palette.plain;
                      const x = (a.x + b.x) / 2,
                        y = (a.y + b.y) / 2;
                      return (
                        <g
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Edge ${e.id}, ${e.u} to ${e.v}, demand ${e.demand}, profit ${e.profit}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelection({ type: "edge", id: e.id });
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter")
                              setSelection({ type: "edge", id: e.id });
                          }}
                          className="graph-edge"
                          opacity={discarded ? 0.22 : 1}
                        >
                          <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke="transparent"
                            strokeWidth="24"
                          />
                          {sel && (
                            <line
                              x1={a.x}
                              y1={a.y}
                              x2={b.x}
                              y2={b.y}
                              stroke="#93d6c8"
                              strokeWidth="11"
                            />
                          )}
                          <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={color}
                            markerEnd={
                              mode === "fptas" && parents[e.v] === e.u
                                ? "url(#tree-arrow)"
                                : undefined
                            }
                            markerStart={
                              mode === "fptas" && parents[e.u] === e.v
                                ? "url(#tree-arrow)"
                                : undefined
                            }
                            strokeWidth={active || chosen ? 4 : 2.5}
                            strokeDasharray={
                              run &&
                              step.x[e.id] > EPS &&
                              step.x[e.id] < e.demand - EPS
                                ? "7 5"
                                : undefined
                            }
                          />
                          <rect
                            x={x - 47}
                            y={y - 22}
                            width="94"
                            height={run ? 44 : 38}
                            rx="7"
                            fill="#fff"
                            stroke={sel ? palette.selected : "#dfe7e8"}
                          />
                          <text
                            x={x}
                            y={y - 6}
                            textAnchor="middle"
                            className="edge-name"
                          >
                            {e.id}{" "}
                            <tspan fill="#7b8d92">
                              · d {e.demand} · p{" "}
                              {mode === "cardinality" ? 1 : e.profit}
                            </tspan>
                          </text>
                          <text
                            x={x}
                            y={y + 11}
                            textAnchor="middle"
                            className="edge-value"
                            fill={color}
                          >
                            {finished && mode !== "color"
                              ? chosen
                                ? "✓ selected"
                                : "not selected"
                              : mode === "fptas" && run
                                ? chosen
                                  ? "in subsolution"
                                  : active
                                    ? "candidate"
                                    : ""
                                : run
                                  ? `x = ${fmt(step.x[e.id] || 0)} / ${e.demand}`
                                  : "click to edit"}
                          </text>
                        </g>
                      );
                    })}
                    {graph.nodes.map((v) => {
                      const selected =
                          selectedNode?.id === v.id || edgeStart === v.id,
                        over = nodeLoads[v.id] > v.capacity + EPS,
                        focus = step.focusNodes.includes(v.id);
                      return (
                        <g
                          key={v.id}
                          className="graph-node"
                          role="button"
                          tabIndex={0}
                          aria-label={`Node ${v.id}, capacity ${v.capacity}`}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              chooseNode(v.id);
                            }
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (tool === "node") {
                              chooseNode(v.id);
                              return;
                            }
                            drag.current = {
                              id: v.id,
                              x: v.x,
                              y: v.y,
                              moved: false,
                            };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                        >
                          {(selected || focus) && (
                            <circle
                              cx={v.x}
                              cy={v.y}
                              r="36"
                              fill="none"
                              stroke={focus ? "#57b8a6" : "#8db1ba"}
                              strokeWidth="2"
                              strokeDasharray={focus ? "4 4" : undefined}
                            />
                          )}
                          <circle
                            cx={v.x}
                            cy={v.y}
                            r="28"
                            fill={selected ? "#163c48" : "#fff"}
                            stroke={
                              over
                                ? "#d67a39"
                                : focus
                                  ? palette.active
                                  : "#43606b"
                            }
                            strokeWidth={selected ? 3 : 2}
                          />
                          <text
                            x={v.x}
                            y={v.y + 6}
                            textAnchor="middle"
                            className="node-id"
                            fill={selected ? "#fff" : "#23434f"}
                          >
                            {v.id}
                          </text>
                          <rect
                            x={v.x - 34}
                            y={v.y + 38}
                            width="68"
                            height="23"
                            rx="5"
                            fill={over ? "#fff0e0" : "#f4f8f8"}
                          />
                          <text
                            x={v.x}
                            y={v.y + 54}
                            textAnchor="middle"
                            className="capacity-label"
                            fill={over ? "#a45116" : "#526a72"}
                          >
                            {run
                              ? `${fmt(nodeLoads[v.id])} / ${v.capacity}`
                              : `b = ${v.capacity}`}
                          </text>
                        </g>
                      );
                    })}
                  </>
                )}
              </svg>
            </div>
            <div className="legend">
              <span>
                <i className="swatch bronze" />
                Bronze
              </span>
              <span>
                <i className="swatch copper" />
                Copper
              </span>
              <span>
                <i className="swatch red" />
                Red
              </span>
              <span>
                <i className="swatch selected" />
                Selected
              </span>
              <span className="legend-last">
                {showConflict
                  ? "Vertex = original edge"
                  : "Edge label: demand d · profit p"}
              </span>
            </div>
          </div>
          <div className="player panel">
            <div className="player-main">
              <button className="primary run-button" onClick={start}>
                <Icon name="play" size={17} />
                {run ? "Re-run procedure" : "Run procedure"}
              </button>
              <div className="transport">
                <button
                  className="icon-button"
                  aria-label="First step"
                  disabled={!run}
                  onClick={() => {
                    setIndex(0);
                    setPlaying(false);
                  }}
                >
                  <Icon name="reset" />
                </button>
                <button
                  className="icon-button"
                  aria-label="Previous step"
                  disabled={!run || index === 0}
                  onClick={() => {
                    setIndex((i) => i - 1);
                    setPlaying(false);
                  }}
                >
                  <Icon name="back" />
                </button>
                <button
                  className="play-button"
                  aria-label={playing ? "Pause" : "Play steps"}
                  disabled={!run || !!run.error}
                  onClick={() => {
                    if (finished) setIndex(0);
                    setPlaying(!playing);
                  }}
                >
                  <Icon name={playing ? "pause" : "play"} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next step"
                  disabled={!run || index >= run.steps.length - 1}
                  onClick={() => {
                    setIndex((i) =>
                      Math.min(i + 1, (run?.steps.length || 1) - 1),
                    );
                    setPlaying(false);
                  }}
                >
                  <Icon name="next" />
                </button>
              </div>
              <select
                className="speed"
                aria-label="Playback speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value=".5">0.5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
              <span className="step-counter">
                {run ? String(index + 1).padStart(2, "0") : "00"}{" "}
                <span>
                  / {run ? String(run.steps.length).padStart(2, "0") : "00"}
                </span>
              </span>
            </div>
            <input
              className="timeline"
              aria-label="Algorithm step"
              type="range"
              min="0"
              max={Math.max(1, (run?.steps.length || 1) - 1)}
              value={index}
              disabled={!run}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setPlaying(false);
              }}
            />
            <div className="player-footer">
              <span>{run ? step.phase : "Ready when you are"}</span>
              <span>Use ← → to step through</span>
            </div>
          </div>
          {notice && (
            <div className="notice" role="alert">
              {notice}
            </div>
          )}
          <div className="metrics">
            <div>
              <span>
                {mode === "fptas" ? "Approximation factor" : "LP upper bound"}
              </span>
              <strong>
                {mode === "fptas"
                  ? `${fmt(1 + epsilon)}×`
                  : run
                    ? fmt(run.lp)
                    : "—"}
              </strong>
            </div>
            <div>
              <span>
                {selectionState || mode === "fptas"
                  ? mode === "cardinality"
                    ? "Selected edges"
                    : "Selected profit"
                  : "Fractional objective"}
              </span>
              <strong>{run ? fmt(value) : "—"}</strong>
            </div>
            <div>
              <span>Selected edges</span>
              <strong>
                {run ? step.selected.length : "—"}
                <small> / {graph.edges.length}</small>
              </strong>
            </div>
            <div>
              <span>Capacity status</span>
              <strong
                className={
                  Object.values(nodeLoads).some(
                    (l, i) => l > graph.nodes[i].capacity + EPS,
                  )
                    ? "warning"
                    : "ok"
                }
              >
                {!run
                  ? "Ready"
                  : Object.values(nodeLoads).some(
                        (l, i) => l > graph.nodes[i].capacity + EPS,
                      )
                    ? "Overloaded"
                    : "Feasible"}
              </strong>
            </div>
          </div>
        </section>
        <aside className="explanation panel">
          <div className="panel-title">
            <h2>Step by step</h2>
            <span className="tiny-tag">§ {info.section}</span>
          </div>
          <div className="step-content">
            <div className="step-kicker">
              <span className="step-number">
                {run ? String(index + 1).padStart(2, "0") : "01"}
              </span>
              <span>{step.phase}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            {step.formula && <div className="formula">{step.formula}</div>}
            {step.table && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {step.table.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {step.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!run && (
              <div className="concept">
                <span className="eyebrow">WHAT YOU’LL SEE</span>
                <p>{info.description}</p>
                <div className="mini-flow">
                  <span>Fractional</span>
                  <span>→</span>
                  <span>{mode === "fptas" ? "Subproblems" : "Transform"}</span>
                  <span>→</span>
                  <span>Feasible</span>
                </div>
              </div>
            )}
            {run && (
              <div className="guarantee">
                <Icon name={finished ? "check" : "graph"} size={17} />
                <span>{run.guarantee}</span>
              </div>
            )}
          </div>
          <div className="trace-list">
            <div className="trace-title">
              PROCEDURE TRACE <span>{run?.steps.length || 0} steps</span>
            </div>
            {run ? (
              run.steps.map((s, i) => (
                <button
                  key={i}
                  className={index === i ? "active" : ""}
                  onClick={() => {
                    setIndex(i);
                    setPlaying(false);
                  }}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    {s.title}
                    <small>{s.phase}</small>
                  </div>
                  {i < index && <span className="trace-check">✓</span>}
                </button>
              ))
            ) : (
              <p className="muted small">
                Your run’s full history will appear here. Jump to any step to
                revisit a decision.
              </p>
            )}
          </div>
        </aside>
      </div>
      <section className="capacity-section panel">
        <div className="panel-title">
          <div>
            <h2>Node capacities</h2>
            <p className="muted small">
              {run
                ? "Current load at each node. Orange marks temporary overload during transformation."
                : "Each selected edge consumes its demand at both endpoints."}
            </p>
          </div>
          <span className="tiny-tag">LOAD / CAPACITY</span>
        </div>
        <div className="capacity-grid">
          {graph.nodes.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelection({ type: "node", id: v.id })}
              className="capacity-item"
            >
              <span>
                <b>{v.id}</b>
                <span>
                  {fmt(nodeLoads[v.id])} / {v.capacity}
                </span>
              </span>
              <div className="meter">
                <i
                  style={{
                    width: `${Math.min(100, (nodeLoads[v.id] / v.capacity) * 100)}%`,
                    background:
                      nodeLoads[v.id] > v.capacity + EPS
                        ? "#d18446"
                        : undefined,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </section>
      <footer>
        <span>
          <Icon name="graph" size={16} /> Demand Matching Lab
        </span>
        <span>
          Based on Shepherd & Vetta (2007) · Educational visualization
        </span>
        <button className="quiet" onClick={() => setShowGuide(!showGuide)}>
          Notation & help
        </button>
      </footer>
    </main>
  );
}
