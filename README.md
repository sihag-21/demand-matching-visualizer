# Demand Matching Lab

A Next.js + React + TypeScript teaching app for Sections 4–6 of **F. Bruce Shepherd and Adrian Vetta, “The Demand-Matching Problem,” Mathematics of Operations Research 32(3), 563–578 (2007)**. The supplied PDF was used as reference material; it is not redistributed by the app.

## Run locally

Requires Node.js 20.9 or newer (Node 22+ recommended).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. The development launcher uses polling to avoid file-watcher limits. For a production build:

```sh
npm run build
npm start
```

`npm start` serves the exported `out/` directory. This is a real Next.js App Router app with `output: 'export'`; all graph computation runs in the browser. No API key or backend is required. Static exports follow the [official Next.js guide](https://nextjs.org/docs/app/guides/static-exports).

## Use

- Select a node to edit its capacity, or select an edge to edit demand and profit.
- Choose **Connect**, then select two nodes. **Add node** lets you click the canvas. Drag nodes to arrange them. Enter/Space also selects a focused node.
- Generate a seeded tree, bipartite graph, or general simple graph with n nodes and m edges. A tree necessarily has m = n − 1.
- Run any procedure. Play, pause, change speed, step backward/forward, scrub the timeline, or jump in the trace. Left/right arrow keys also advance steps when an input is not focused.
- Toggle between the original graph and conflict graph. The conflict graph becomes available after coloring; nodes in that graph represent original edges.
- Node load bars show temporary overload in orange during augmentation and verify the final feasible matching.
- State is in memory only. Reloading resets the graph. The generator supports 1–24 nodes; capacities, demands and profits are positive integers up to 10,000. ε ranges from 0.05 to 1 to keep the teaching interface responsive.

## Procedures and notation

`x_e` is allocated **demand**, in `[0,d_e]`; the fractional selection is `x_e/d_e`. A retained integral edge consumes its entire demand at both endpoints. The fractional objective is `Σ (p_e/d_e) x_e`.

- **§4.1:** A primal simplex with Bland's rule computes a basic optimal LP solution. Alternating leaf-to-leaf augmentation chooses a nondecreasing objective direction and continues until an edge is zero or tight. Tree support is partitioned into two feasible classes. Bipartite and general inputs use the paper's separate tight-edge and odd-cycle candidates.
- **§4.2:** Extended bronze/copper/red coloring includes tight edges, leaf-to-itself balloons (±2δ on the stem), and pure odd-cycle removal. Endpoint-specific bronze incidences are recorded explicitly.
- **§4.3:** Default `p = 0.276`; the paper's ideal value is `(5 − √5)/10 ≈ 0.276393`. Root labels, conditional child labels, deletion, fair component coin flips, and greedy copper inclusion have individual trace steps. For general graphs, compare the sampled nonred set against the red set. A single random run is not an expected guarantee.
- **§5:** Re-solve the LP with all profits equal to 1. Show isolated vertices, copper leaves, alternating BFS layers, and Figure 7 cases (i)–(iv). The original editable profits are retained for the other modes.
- **§6:** On a connected simple tree, orient from the chosen root, visit children first, construct positive gains `β′_j + p_e − α′_j`, and solve the two capacity subproblems. The knapsack solver scales profits and maintains minimum-demand states, removing dominated states. It uses local `η = ln(1+ε)/n`, scaling `K = [η/(1+η)]·max(gain)/number_of_items`, and returns actual feasible edge sets. This delivers the requested global `(1+ε)` factor. The table samples long DP frontiers but the computation uses the complete nondominated frontier.

Individually infeasible edges are discarded in LP modes. Tree FPTAS mode asks you to lower such an edge's demand so the tree structure and parent-edge meaning stay explicit.

## Important general-graph qualification

The literal selection in Figure 7(iii) assumes its named vertices are distinct. In nonbipartite inputs, the two copper neighbours can coincide: the conflict graph then contains a triangle and the named pair is not independent. The app includes an **explicitly labelled triangle extension**, selecting the copper vertex and removing its two bronze neighbours. It does **not** claim the paper's 2/5 removal bound or a 3-approximation for a run using this extension. For example, generate a general graph with `n=12, m=20, seed=150` and run §5.

The UI reports the approximately 2.764 expected guarantee for bipartite randomized runs near the default probability. It intentionally does not assert the paper's stronger 3.264 general-graph expectation on arbitrary generated nonbipartite conflict structures. All returned integral solutions are checked for feasibility. These qualifications are visible rather than silently substituting an exact optimizer for the described algorithms.

## Reproducible teaching examples

The opening branching tree has adjacent fractional edges and shows endpoint overload. The odd-cycle preset shows red-edge removal. Other examples can be generated with `n=12`, `m=20`, graph type **General**:

| Seed | Procedure | Process                            |
| ---- | --------- | ---------------------------------- |
| 4    | §5 preprocessing | Leaf-to-itself balloon             |
| 139  | §5 preprocessing | Minimum-gap copper promotion       |
| 3    | §5        | Alternating BFS copper selection   |
| 42   | §5        | Figure 7(i)                        |
| 264  | §5        | Figure 7(ii)                       |
| 91   | §5        | Deepest sibling leaves             |
| 579  | §5        | Figure 7(iv) chain                 |
| 150  | §5        | Coincident-neighbour qualification |

## Verification and code

```sh
npm test
npm run typecheck
npm run build
```

Tests compare deterministic and FPTAS outputs to exhaustive optimal solutions on small graphs, check capacities and copper-incidence invariants, exercise odd cycles and balloons, and cover the explicit triangle extension. Randomized tests check feasible sampled outputs; they do not misrepresent sampling as a proof of expectation.

- `lib/model.ts`: graph model, examples and seeded generator.
- `lib/algorithms.ts`: LP solver, algorithms, immutable teaching traces.
- `app/page.tsx`: editor, SVG views, timeline, parameter controls.
- `app/globals.css`: responsive layout and visual states.
- `tests/algorithms.test.ts`: numerical and structural regression checks.

Optional WebMCP tools expose read-only page state and validated navigation within an existing run. They are feature-detected and have no effect in unsupported browsers.
