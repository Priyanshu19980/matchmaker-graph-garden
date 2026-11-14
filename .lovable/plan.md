# Multiplayer Game Server Matchmaker

## Build
- Replace the starter screen with a responsive, dark esports-style matchmaking simulator.
- Add pure TypeScript modules for player graph construction, greedy pairing/group formation, team balancing, server latency paths/capacity assignment, seeded sample data, and random baselines.
- Build a dashboard with player-count and mode controls, seed/random actions, a step-through matching mode, manual player entry, and JSON export.
- Visualize the compatibility graph with region-coded nodes, weighted edges, selected-match highlights, and step-by-step greedy progress. Show match cards, server utilization, unmatched players, run metrics, and a Greedy-versus-Random comparison chart.
- Add a How It Works view with the algorithm steps, pseudocode, complexity, and greedy trade-offs.

## Validation
- Add focused tests for graph eligibility/weights, greedy matching constraints, 2v2 team balance, and server capacity/latency assignment.
- Run those tests and verify the home screen and central matchmaking interactions in the preview.

## Technical details
- Keep algorithm logic frontend-only, deterministic where seeded, and separate from presentation code.
- Use the existing React, Tailwind, Lucide, and Recharts dependencies; implement the graph as an SVG visualization without adding a graph package.
- Use SVG for the compatibility graph, CSS design tokens for the gaming palette, and route-level metadata for the home page.
