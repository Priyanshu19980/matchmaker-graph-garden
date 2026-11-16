import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cpu,
  Gamepad2,
  Gauge,
  GitBranch,
  Network,
  Plus,
  Radio,
  RotateCcw,
  Server,
  Shuffle,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildCompatibilityGraph,
  createDefaultServers,
  createRandomPlayers,
  createSeedPlayers,
  greedyMatchPlayers,
  type GameMode,
  type Match,
  type Player,
  type PlayerEdge,
  type Region,
} from "@/lib/matchmaking";
import { runMatchmaking } from "@/lib/run-matchmaking";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Matchmaker Graph Garden | Multiplayer Matchmaking Lab" },
      {
        name: "description",
        content:
          "Explore greedy graph matching, balanced teams, and latency-aware game server assignments in an interactive multiplayer matchmaking simulator.",
      },
      { property: "og:title", content: "Matchmaker Graph Garden | Multiplayer Matchmaking Lab" },
      {
        property: "og:description",
        content: "An interactive laboratory for graph-based multiplayer matchmaking algorithms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MatchmakerDashboard,
});

type ViewMode = "dashboard" | "guide";
type FilterMode = "all" | GameMode;

const regionStyles: Record<Region, { className: string; color: string }> = {
  Asia: { className: "text-region-asia", color: "var(--region-asia)" },
  EU: { className: "text-region-eu", color: "var(--region-eu)" },
  NA: { className: "text-region-na", color: "var(--region-na)" },
};

function MatchmakerDashboard() {
  const [players, setPlayers] = useState<Player[]>(createSeedPlayers);
  const [playerCount, setPlayerCount] = useState(24);
  const [mode, setMode] = useState<FilterMode>("all");
  const [view, setView] = useState<ViewMode>("dashboard");
  const [stepMode, setStepMode] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftRating, setDraftRating] = useState("1500");
  const [draftRegion, setDraftRegion] = useState<Region>("Asia");
  const [draftPing, setDraftPing] = useState("32");
  const [draftWait, setDraftWait] = useState("20");
  const [draftMode, setDraftMode] = useState<GameMode>("1v1");
  const [formError, setFormError] = useState("");

  const visiblePlayers = useMemo(
    () => (mode === "all" ? players : players.filter((player) => player.gameMode === mode)),
    [players, mode],
  );
  const edges = useMemo(() => buildCompatibilityGraph(visiblePlayers), [visiblePlayers]);
  const run = useMemo(() => runMatchmaking(visiblePlayers), [visiblePlayers]);
  const sortedEdges = useMemo(
    () => [...edges].sort((left, right) => left.weight - right.weight || left.id.localeCompare(right.id)),
    [edges],
  );
  const liveSelection = useMemo(() => {
    const accepted = new Set<string>();
    const usedPlayers = new Set<string>();
    const limit = stepIndex ?? sortedEdges.length;
    for (const edge of sortedEdges.slice(0, limit)) {
      if (usedPlayers.has(edge.source) || usedPlayers.has(edge.target)) continue;
      usedPlayers.add(edge.source);
      usedPlayers.add(edge.target);
      accepted.add(edge.id);
    }
    return accepted;
  }, [sortedEdges, stepIndex]);

  const greedyFairness = average(run.matches.map((match) => match.fairnessScore));
  const averageLatency = average(
    run.matches.flatMap((match) => (match.latencyMs === null ? [] : [match.latencyMs])),
  );
  const matchedPlayers = run.matches.reduce((total, match) => total + match.players.length, 0);
  const stepComplete = stepIndex === null || stepIndex >= sortedEdges.length;
  const stepCandidate = stepIndex === null ? undefined : sortedEdges[stepIndex];

  function refreshPlayers(nextPlayers: Player[]) {
    setPlayers(nextPlayers);
    setStepIndex(null);
  }

  function handleGenerate() {
    refreshPlayers(createRandomPlayers(playerCount, mode === "2v2" ? "2v2" : "1v1"));
  }

  function handleLoadSeed() {
    refreshPlayers(createSeedPlayers());
    setPlayerCount(24);
    setMode("all");
  }

  function handleRun() {
    if (stepMode) setStepIndex(0);
    else setStepIndex(null);
  }

  function handleStep() {
    setStepIndex((current) => Math.min((current ?? 0) + 1, sortedEdges.length));
  }

  function handleAddPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim().toUpperCase();
    const rating = Number(draftRating);
    const ping = Number(draftPing);
    const wait = Number(draftWait);
    if (!name || name.length > 18) {
      setFormError("Enter a name with 1–18 characters.");
      return;
    }
    if (players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      setFormError("That player name is already in the queue.");
      return;
    }
    if (!Number.isInteger(rating) || rating < 500 || rating > 2500) {
      setFormError("Rating must be between 500 and 2,500.");
      return;
    }
    if (!Number.isFinite(ping) || ping < 1 || ping > 500 || !Number.isFinite(wait) || wait < 0) {
      setFormError("Enter a valid ping and waiting time.");
      return;
    }

    const newPlayer: Player = {
      id: `manual-${Date.now()}`,
      name,
      skillRating: rating,
      region: draftRegion,
      pingMs: ping,
      waitTime: wait,
      gameMode: draftMode,
    };
    refreshPlayers([...players, newPlayer]);
    setMode("all");
    setDraftName("");
    setFormError("");
  }

  function handleExport() {
    const payload = {
      generatedAt: new Date().toISOString(),
      mode,
      players: visiblePlayers,
      compatibilityEdges: edges,
      greedy: run,
      randomBaseline: { fairnessScore: run.randomFairness, durationMs: run.randomDurationMs },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "matchmaker-results.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card/80">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center border border-primary/35 bg-primary/10 text-primary">
              <Gamepad2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm font-bold tracking-wide">MATCHMAKER</p>
                <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  LAB 01
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Multiplayer matchmaking simulator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav aria-label="Main navigation" className="flex items-center border border-border p-1">
              <Button
                variant={view === "dashboard" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("dashboard")}
                aria-current={view === "dashboard" ? "page" : undefined}
              >
                <Activity /> Dashboard
              </Button>
              <Button
                variant={view === "guide" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("guide")}
                aria-current={view === "guide" ? "page" : undefined}
              >
                <CircleHelp /> How it works
              </Button>
            </nav>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <ArrowDownToLine /> <span className="hidden sm:inline">Export JSON</span>
            </Button>
          </div>
        </div>
      </header>

      {view === "guide" ? (
        <HowItWorks onBack={() => setView("dashboard")} />
      ) : (
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <section className="mb-6 flex flex-col justify-between gap-4 border-b border-border pb-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase text-primary">
                <span className="size-1.5 bg-primary" /> Matchmaking operations
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">Matchmaking control room</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Build the player graph. Let the lowest-cost connections find their match.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping bg-primary/50" />
                <span className="relative inline-flex size-2 bg-primary" />
              </span>
              ALGORITHM READY
              <span className="ml-2 border-l border-border pl-3 font-mono">FRONTEND SIMULATION</span>
            </div>
          </section>

          <section aria-label="Matchmaking controls" className="mb-6 grid gap-4 xl:grid-cols-[1.1fr_1.4fr_1fr]">
            <div className="control-panel">
              <div className="panel-kicker"><Users /> Queue generator</div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Player count</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{playerCount} players · 10–100</p>
                </div>
                <span className="font-mono text-2xl font-bold text-primary">{playerCount}</span>
              </div>
              <Slider
                aria-label="Player count"
                min={10}
                max={100}
                step={5}
                value={[playerCount]}
                onValueChange={(values) => setPlayerCount(values[0] ?? 10)}
                className="mb-4"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleGenerate}>
                  <Shuffle /> Generate random players
                </Button>
                <Button size="sm" variant="outline" onClick={handleLoadSeed}>
                  <RotateCcw /> Seed example
                </Button>
              </div>
            </div>

            <div className="control-panel">
              <div className="panel-kicker"><GitBranch /> Match configuration</div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <fieldset>
                  <legend className="mb-2 text-xs text-muted-foreground">Game mode</legend>
                  <div className="flex border border-border p-1" role="group" aria-label="Game mode">
                    {(["all", "1v1", "2v2"] as FilterMode[]).map((item) => (
                      <Button
                        key={item}
                        type="button"
                        size="sm"
                        variant={mode === item ? "secondary" : "ghost"}
                        onClick={() => {
                          setMode(item);
                          setStepIndex(null);
                        }}
                        aria-pressed={mode === item}
                      >
                        {item === "all" ? "All modes" : item}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <div className="flex items-center gap-3 pb-1">
                  <div>
                    <p className="text-sm font-medium">Step-by-step</p>
                    <p className="text-xs text-muted-foreground">Inspect each edge decision</p>
                  </div>
                  <Switch
                    id="step-mode"
                    checked={stepMode}
                    onCheckedChange={(checked) => {
                      setStepMode(checked);
                      setStepIndex(null);
                    }}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button onClick={handleRun}>
                  <Zap /> Run matchmaking
                </Button>
                {stepIndex !== null && (
                  <Button variant="outline" onClick={handleStep} disabled={stepComplete}>
                    {stepComplete ? <Check /> : <ChevronRight />}
                    {stepComplete ? "Matching complete" : "Next edge"}
                  </Button>
                )}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {matchedPlayers}/{visiblePlayers.length} PLAYERS MATCHED
                </span>
              </div>
            </div>

            <form className="control-panel" onSubmit={handleAddPlayer}>
              <div className="panel-kicker"><Plus /> Add a player</div>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Player name" placeholder="Name" maxLength={18} value={draftName} onChange={(event) => setDraftName(event.target.value)} required />
                <Input aria-label="Skill rating" type="number" min={500} max={2500} value={draftRating} onChange={(event) => setDraftRating(event.target.value)} required />
                <select aria-label="Region" value={draftRegion} onChange={(event) => setDraftRegion(event.target.value as Region)} className="h-9 border border-input bg-background px-3 text-sm text-foreground">
                  <option value="Asia">Asia</option><option value="EU">EU</option><option value="NA">North America</option>
                </select>
                <select aria-label="Player game mode" value={draftMode} onChange={(event) => setDraftMode(event.target.value as GameMode)} className="h-9 border border-input bg-background px-3 text-sm text-foreground">
                  <option value="1v1">1v1</option><option value="2v2">2v2</option>
                </select>
                <Input aria-label="Ping in milliseconds" type="number" min={1} max={500} value={draftPing} onChange={(event) => setDraftPing(event.target.value)} required />
                <Input aria-label="Wait time in seconds" type="number" min={0} value={draftWait} onChange={(event) => setDraftWait(event.target.value)} required />
              </div>
              {formError && <p role="alert" className="mt-2 text-xs text-destructive">{formError}</p>}
              <Button className="mt-3" size="sm" type="submit"><Plus /> Add to queue &amp; rematch</Button>
            </form>
          </section>

          <section aria-label="Matchmaking summary" className="mb-6 grid grid-cols-2 border border-border bg-card sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Queued players" value={String(visiblePlayers.length)} detail={`${matchedPlayers} placed`} icon={<Users />} />
            <Metric label="Compatible edges" value={String(edges.length)} detail="same mode + region" icon={<Network />} />
            <Metric label="Matches formed" value={String(run.matches.length)} detail={mode === "2v2" ? "four players each" : "one-versus-one"} icon={<GitBranch />} />
            <Metric label="Avg. fairness" value={`${greedyFairness}%`} detail="rating balance" icon={<Gauge />} />
            <Metric label="Avg. latency" value={averageLatency ? `${averageLatency} ms` : "—"} detail="assigned servers" icon={<Radio />} />
            <Metric label="Run time" value={`${run.durationMs.toFixed(2)} ms`} detail="graph → assignment" icon={<Cpu />} />
          </section>

          {stepIndex !== null && (
            <div role="status" className="mb-5 flex flex-wrap items-center gap-3 border border-primary/35 bg-primary/5 px-4 py-3 text-sm">
              <span className="font-mono text-primary">EDGE {Math.min(stepIndex, sortedEdges.length)} / {sortedEdges.length}</span>
              {stepCandidate && !stepComplete ? (
                <span className="text-muted-foreground">
                  Considering <b className="text-foreground">{playerById(visiblePlayers, stepCandidate.source)?.name}</b>
                  <ArrowRight className="mx-1 inline size-3" />
                  <b className="text-foreground">{playerById(visiblePlayers, stepCandidate.target)?.name}</b>
                  <span className="ml-2 font-mono">weight {stepCandidate.weight.toFixed(1)}</span>
                </span>
              ) : <span className="text-muted-foreground">All candidate edges have been evaluated.</span>}
              <span className="ml-auto text-xs text-muted-foreground">Green edges are selected; muted edges were skipped.</span>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(330px,0.85fr)]">
            <section className="section-frame min-w-0" aria-labelledby="graph-heading">
              <div className="section-heading">
                <div>
                  <div className="panel-kicker"><Network /> Compatibility graph</div>
                  <h2 id="graph-heading" className="mt-1 text-lg font-semibold">Player connection map</h2>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{visiblePlayers.length} NODES / {edges.length} EDGES</span>
              </div>
              <GraphVisualization players={visiblePlayers} edges={edges} selected={liveSelection} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                  {(["Asia", "EU", "NA"] as Region[]).map((region) => (
                    <span key={region} className="inline-flex items-center gap-1.5"><span className={`size-2 ${regionStyles[region].className.replace("text-", "bg-")}`} />{region === "NA" ? "North America" : region}</span>
                  ))}
                </div>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="h-0.5 w-4 bg-success" /> Greedy selection</span>
              </div>
            </section>

            <section className="section-frame" aria-labelledby="server-heading">
              <div className="section-heading">
                <div>
                  <div className="panel-kicker"><Server /> Server fleet</div>
                  <h2 id="server-heading" className="mt-1 text-lg font-semibold">Capacity &amp; latency</h2>
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-success"><span className="size-1.5 bg-success" /> ONLINE</span>
              </div>
              <ServerPanel servers={run.servers} matches={run.matches} />
            </section>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)]">
            <section className="section-frame" aria-labelledby="matches-heading">
              <div className="section-heading">
                <div>
                  <div className="panel-kicker"><Zap /> Greedy result</div>
                  <h2 id="matches-heading" className="mt-1 text-lg font-semibold">Formed matches</h2>
                </div>
                <span className="border border-border px-2 py-1 font-mono text-xs">{run.matches.length} MATCHES</span>
              </div>
              {run.matches.length ? (
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {run.matches.slice(0, 12).map((match, index) => <MatchCard key={match.id} match={match} index={index} />)}
                  {run.matches.length > 12 && <p className="text-xs text-muted-foreground md:col-span-2">+ {run.matches.length - 12} more matches included in the JSON export</p>}
                </div>
              ) : <EmptyState title="No compatible matches" detail="Try another mode or generate a new player queue." />}
            </section>

            <section className="section-frame" aria-labelledby="queue-heading">
              <div className="section-heading">
                <div>
                  <div className="panel-kicker"><Users /> Still waiting</div>
                  <h2 id="queue-heading" className="mt-1 text-lg font-semibold">Unmatched queue</h2>
                </div>
                <span className="border border-border px-2 py-1 font-mono text-xs">{run.unmatched.length} PLAYERS</span>
              </div>
              {run.unmatched.length ? (
                <div className="max-h-[480px] overflow-auto px-4">
                  {run.unmatched.map((player) => (
                    <div key={player.id} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`size-2 shrink-0 ${regionStyles[player.region].className.replace("text-", "bg-")}`} />
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{player.name}</p><p className="text-[11px] text-muted-foreground">{player.region} · {player.gameMode} · {player.skillRating} SR</p></div>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-warning">{player.waitTime}s wait</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="Queue is clear" detail="Every eligible player found a match." />}
            </section>
          </div>

          <AnalysisPanel run={run} fairness={greedyFairness} />
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-border py-4 font-mono text-[10px] text-muted-foreground">
            <span>ADA PROJECT / GREEDY GRAPH MATCHING</span><span>LOCAL SIMULATION · NO SERVER DATA SENT</span>
          </footer>
        </div>
      )}
    </main>
  );
}

function GraphVisualization({ players, edges, selected }: { players: Player[]; edges: PlayerEdge[]; selected: Set<string> }) {
  const positions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    const lanes: { region: Region; x: number; mode: GameMode }[] = [
      { region: "Asia", x: 180, mode: "1v1" }, { region: "Asia", x: 300, mode: "2v2" },
      { region: "EU", x: 500, mode: "1v1" }, { region: "EU", x: 620, mode: "2v2" },
      { region: "NA", x: 800, mode: "1v1" }, { region: "NA", x: 920, mode: "2v2" },
    ];
    for (const lane of lanes) {
      const lanePlayers = players.filter((player) => player.region === lane.region && player.gameMode === lane.mode);
      lanePlayers.forEach((player, index) => {
        const span = Math.min(320, Math.max(50, (lanePlayers.length - 1) * 34));
        const baseY = 230 - span / 2 + index * (span / Math.max(1, lanePlayers.length - 1));
        const jitter = ((index * 37 + player.skillRating) % 23) - 11;
        result.set(player.id, { x: lane.x + jitter, y: baseY });
      });
    }
    return result;
  }, [players]);
  const displayEdges = edges.length > 260 ? [...edges].sort((a, b) => a.weight - b.weight).slice(0, 260) : edges;
  const playerNames = new Map(players.map((player) => [player.id, player.name]));

  return (
    <div className="graph-canvas relative overflow-hidden">
      <svg viewBox="0 0 1000 440" className="block h-[360px] w-full sm:h-[420px]" role="img" aria-label="Player compatibility graph grouped by region and game mode">
        <defs>
          <pattern id="graph-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="var(--graph-grid)" strokeWidth="1" /></pattern>
        </defs>
        <rect width="1000" height="440" fill="url(#graph-grid)" />
        <text x="240" y="32" textAnchor="middle" className="graph-lane-label">ASIA</text>
        <text x="560" y="32" textAnchor="middle" className="graph-lane-label">EUROPE</text>
        <text x="860" y="32" textAnchor="middle" className="graph-lane-label">NORTH AMERICA</text>
        <line x1="400" y1="44" x2="400" y2="414" stroke="var(--graph-grid)" strokeDasharray="3 6" />
        <line x1="720" y1="44" x2="720" y2="414" stroke="var(--graph-grid)" strokeDasharray="3 6" />
        {displayEdges.map((edge) => {
          const from = positions.get(edge.source);
          const to = positions.get(edge.target);
          if (!from || !to) return null;
          const accepted = selected.has(edge.id);
          return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={accepted ? "var(--success)" : "var(--graph-edge)"} strokeWidth={accepted ? 2.3 : 1} opacity={accepted ? 0.88 : 0.38}><title>{playerNames.get(edge.source)} ↔ {playerNames.get(edge.target)} · weight {edge.weight.toFixed(1)}{accepted ? " · selected" : ""}</title></line>;
        })}
        {players.map((player) => {
          const point = positions.get(player.id);
          if (!point) return null;
          const fill = regionStyles[player.region].color;
          return <g key={player.id} transform={`translate(${point.x} ${point.y})`}><circle r="11" fill={fill} opacity="0.13" /><circle r="4.8" fill={fill} stroke="var(--graph-node-ring)" strokeWidth="1.4"><title>{player.name} · {player.skillRating} SR · {player.region} · {player.gameMode} · {player.pingMs} ms</title></circle></g>;
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 right-3 border border-border/80 bg-card/90 px-2 py-1 font-mono text-[9px] text-muted-foreground">EDGE WEIGHT = SKILL GAP + PING − WAIT PRIORITY</div>
    </div>
  );
}

function ServerPanel({ servers, matches }: { servers: ReturnType<typeof createDefaultServers>; matches: Match[] }) {
  return (
    <div className="divide-y divide-border px-4">
      {servers.map((server) => {
        const assigned = matches.filter((match) => match.serverId === server.id);
        const load = Math.min(100, (server.currentLoad / server.capacity) * 100);
        return (
          <div key={server.id} className="py-3.5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div><p className="text-sm font-medium">{server.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{server.region} · {assigned.length} matches · base {server.baseLatency} ms</p></div>
              <span className="shrink-0 font-mono text-xs">{server.currentLoad}<span className="text-muted-foreground">/{server.capacity}</span></span>
            </div>
            <div className="h-1.5 bg-muted"><div className={`h-full transition-all ${load >= 85 ? "bg-warning" : "bg-primary"}`} style={{ width: `${load}%` }} /></div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{Math.round(load)}% utilized</span><span>{server.capacity - server.currentLoad} slots open</span></div>
          </div>
        );
      })}
      {matches.some((match) => match.serverId === null) && <p className="py-3 text-xs text-warning">Some groups could not be assigned: all servers are at capacity.</p>}
    </div>
  );
}

function MatchCard({ match, index }: { match: Match; index: number }) {
  return (
    <article className="border border-border bg-background/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] text-primary">MATCH {String(index + 1).padStart(2, "0")}</span>
        <span className="font-mono text-[10px] text-success">{match.fairnessScore}% FAIR</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3">
        <div className="space-y-1">{match.teamA.map((player) => <PlayerChip key={player.id} player={player} />)}</div>
        <span className="font-mono text-[10px] text-muted-foreground">VS</span>
        <div className="space-y-1">{match.teamB.map((player) => <PlayerChip key={player.id} player={player} />)}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span>Δ rating <b className="font-mono text-foreground">{match.ratingDifference}</b></span>
        <span className="truncate">{match.serverId ? `Server ${match.serverId}` : "No server available"}</span>
        <span className="font-mono text-foreground">{match.latencyMs === null ? "—" : `${match.latencyMs} ms`}</span>
      </div>
    </article>
  );
}

function PlayerChip({ player }: { player: Player }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-xs"><span className={`size-1.5 shrink-0 ${regionStyles[player.region].className.replace("text-", "bg-")}`} /><span className="truncate font-semibold">{player.name}</span><span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{player.skillRating}</span></div>;
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="min-w-0 border-b border-r border-border p-3 sm:p-4 xl:border-b-0 last:border-r-0"><div className="mb-2 flex items-center justify-between gap-2"><span className="truncate text-[11px] text-muted-foreground">{label}</span><span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span></div><p className="truncate font-mono text-xl font-bold sm:text-2xl">{value}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p></div>;
}

function AnalysisPanel({ run, fairness }: { run: ReturnType<typeof runMatchmaking>; fairness: number }) {
  const fairnessData = run.benchmarks.map((point) => ({ players: point.count, Greedy: point.greedy, Random: point.random }));
  const runtimeData = run.benchmarks.map((point) => ({ players: point.count, Greedy: Number(point.greedyMs.toFixed(3)), Random: Number(point.randomMs.toFixed(3)) }));
  const chartTooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)", borderRadius: 0, fontSize: 11 };
  return (
    <section className="section-frame mt-6" aria-labelledby="analysis-heading">
      <div className="section-heading">
        <div><div className="panel-kicker"><Activity /> Performance analysis</div><h2 id="analysis-heading" className="mt-1 text-lg font-semibold">Greedy vs. randomized baseline</h2></div>
        <span className="font-mono text-[10px] text-muted-foreground">SAMPLE SIZE 10 → 100</span>
      </div>
      <div className="grid lg:grid-cols-2">
        <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold">Average match fairness</p><span className="font-mono text-[10px] text-muted-foreground">HIGHER IS BETTER · CURRENT {fairness}%</span></div>
          <div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={fairnessData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}><CartesianGrid stroke="var(--graph-grid)" vertical={false} /><XAxis dataKey="players" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "var(--muted)" }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="Greedy" fill="var(--chart-1)" maxBarSize={22} /><Bar dataKey="Random" fill="var(--chart-3)" maxBarSize={22} /></BarChart></ResponsiveContainer></div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold">Matching runtime</p><span className="font-mono text-[10px] text-muted-foreground">MILLISECONDS · LOWER IS BETTER</span></div>
          <div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={runtimeData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}><CartesianGrid stroke="var(--graph-grid)" vertical={false} /><XAxis dataKey="players" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "var(--muted)" }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="Greedy" fill="var(--chart-1)" maxBarSize={22} /><Bar dataKey="Random" fill="var(--chart-3)" maxBarSize={22} /></BarChart></ResponsiveContainer></div>
        </div>
      </div>
      <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-3">
        <Complexity label="Graph build" value="O(n²)" detail={`${run.edges.length} compatible links`} />
        <Complexity label="Sort + greedy" value="O(E log E) + O(E)" detail="lowest weight first" />
        <Complexity label="Server routing" value="O((V + E) log V)" detail={`${run.servers.length} regional servers`} />
      </div>
    </section>
  );
}

function Complexity({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border-l-2 border-primary/40 pl-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-bold">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div>;
}

function HowItWorks({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-[1160px] px-4 py-8 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" className="mb-6" onClick={onBack}><ChevronLeft /> Back to dashboard</Button>
      <div className="mb-8 border-b border-border pb-6"><div className="panel-kicker"><GitBranch /> Algorithm field guide</div><h1 className="mt-2 text-3xl font-bold">From player queue to server</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">A greedy graph heuristic turns compatibility into quick, readable match decisions.</p></div>
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-8">
          <GuideStep number="01" title="Build the compatibility graph" complexity="O(n²) time · O(E) space" icon={<Network />}>
            Every queued player becomes a node. Connect two nodes only when game mode and region match, and their rating gap is at most 250.
            <CodeBlock>{`for each pair (a, b):
  if a.mode == b.mode and a.region == b.region
     and |a.rating - b.rating| <= 250:
    weight = |Δrating| + 0.5|Δping|
             - 0.1(waitA + waitB)
    add edge(a, b, weight)`}</CodeBlock>
          </GuideStep>
          <GuideStep number="02" title="Greedily select edges" complexity="O(E log E) sort · O(E) scan" icon={<Zap />}>
            Visit the lowest-weight edge first. Accept it when both players are still free; skip it otherwise. That prioritizes close ratings, similar ping, and long waits.
            <CodeBlock>{`sort edges by ascending weight
for edge in edges:
  if both endpoints are unmatched:
    accept edge
    mark both players matched`}</CodeBlock>
          </GuideStep>
          <GuideStep number="03" title="Balance teams for 2v2" complexity="O(k log k) per four-player group" icon={<Users />}>
            Two accepted pairs from the same region form a four-player lobby. Sort by rating, then snake-draft the two highest against the next two to reduce the team-rating gap.
          </GuideStep>
          <GuideStep number="04" title="Route the match to a server" complexity="O((V + E) log V) per search" icon={<Server />}>
            Compute each candidate server's estimated latency, including a 45 ms cross-region penalty. Dijkstra orders reachable servers by latency; the first server with room for the whole match gets the group.
          </GuideStep>
        </div>
        <aside className="space-y-6">
          <div className="section-frame p-5"><div className="panel-kicker"><Cpu /> Complexity at a glance</div><div className="mt-4 space-y-3"><Complexity label="Graph construction" value="O(n²)" detail="Compare every player pair" /><Complexity label="Sort candidate edges" value="O(E log E)" detail="Order by edge weight" /><Complexity label="Greedy selection" value="O(E)" detail="Visit each edge once" /><Complexity label="Dijkstra routing" value="O((V + E) log V)" detail="Binary min-heap shortest path" /></div><p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">E = compatible edges · V = server graph vertices · n = players</p></div>
          <div className="border border-warning/35 bg-warning/5 p-5"><div className="flex items-center gap-2 text-sm font-semibold text-warning"><Sparkles className="size-4" /> Why greedy isn’t always optimal</div><p className="mt-3 text-sm leading-6 text-muted-foreground">A locally best edge can use a player who would have enabled two slightly worse edges. The result is fast and easy to explain, but it does not guarantee the globally largest or fairest set of matches.</p><p className="mt-3 text-xs text-muted-foreground">For example, choosing A–B first can block A–C and B–D, even when those two later matches would fill more of the lobby.</p></div>
          <div className="section-frame p-5"><div className="panel-kicker"><Activity /> What the weights mean</div><div className="mt-4 space-y-3 text-xs"><WeightRow label="Rating gap" value="Lower is better" tone="text-region-asia" /><WeightRow label="Ping difference" value="× 0.5" tone="text-region-eu" /><WeightRow label="Waiting time" value="− 0.1 × both waits" tone="text-success" /></div><p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">A lower edge weight gets considered earlier. Compatibility rules are hard constraints; the weight only ranks eligible pairs.</p></div>
        </aside>
      </div>
    </div>
  );
}

function GuideStep({ number, title, complexity, icon, children }: { number: string; title: string; complexity: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <article className="relative border-l border-border pl-6"><span className="absolute -left-3 top-0 flex size-6 items-center justify-center border border-primary/40 bg-background font-mono text-[10px] text-primary">{number}</span><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</h2><span className="font-mono text-[10px] text-muted-foreground">{complexity}</span></div><div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div></article>;
}

function CodeBlock({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto border border-border bg-card p-4 font-mono text-xs leading-6 text-primary"><code>{children}</code></pre>;
}

function WeightRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className={`font-mono ${tone}`}>{value}</span></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="px-5 py-10 text-center"><div className="mx-auto flex size-9 items-center justify-center border border-border text-muted-foreground"><Shuffle className="size-4" /></div><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0;
}

function playerById(players: Player[], id: string) {
  return players.find((player) => player.id === id);
}
