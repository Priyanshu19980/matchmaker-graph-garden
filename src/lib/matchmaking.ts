export type Region = "Asia" | "EU" | "NA";
export type GameMode = "1v1" | "2v2";

export interface Player {
  id: string;
  name: string;
  skillRating: number;
  region: Region;
  pingMs: number;
  waitTime: number;
  gameMode: GameMode;
}

export interface Server {
  id: string;
  name: string;
  region: Region;
  capacity: number;
  currentLoad: number;
  baseLatency: number;
}

export interface PlayerEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
}

export interface AdjacencyList {
  [playerId: string]: { playerId: string; weight: number; edgeId: string }[];
}

export interface Match {
  id: string;
  players: Player[];
  teamA: Player[];
  teamB: Player[];
  links: PlayerEdge[];
  ratingDifference: number;
  fairnessScore: number;
  serverId: string | null;
  latencyMs: number | null;
}

export interface GreedyResult {
  matches: Match[];
  unmatched: Player[];
  acceptedEdges: PlayerEdge[];
}

export interface MatchmakingRun extends GreedyResult {
  edges: PlayerEdge[];
  servers: Server[];
  durationMs: number;
  randomFairness: number;
  randomDurationMs: number;
}

export const REGIONS: Region[] = ["Asia", "EU", "NA"];

/** Builds an adjacency-list edge set in O(n²) time and O(E) space. */
export function buildCompatibilityGraph(players: Player[], ratingThreshold = 250): PlayerEdge[] {
  const edges: PlayerEdge[] = [];

  for (let i = 0; i < players.length; i += 1) {
    const playerA = players[i];
    if (!playerA) continue;

    for (let j = i + 1; j < players.length; j += 1) {
      const playerB = players[j];
      if (!playerB) continue;
      const ratingDifference = Math.abs(playerA.skillRating - playerB.skillRating);

      if (
        playerA.gameMode !== playerB.gameMode ||
        playerA.region !== playerB.region ||
        ratingDifference > ratingThreshold
      ) {
        continue;
      }

      edges.push({
        id: `${playerA.id}--${playerB.id}`,
        source: playerA.id,
        target: playerB.id,
        weight:
          ratingDifference +
          Math.abs(playerA.pingMs - playerB.pingMs) * 0.5 -
          (playerA.waitTime + playerB.waitTime) * 0.1,
      });
    }
  }

  return edges;
}

export function buildAdjacencyList(players: Player[], edges: PlayerEdge[]): AdjacencyList {
  const adjacency: AdjacencyList = Object.fromEntries(players.map((player) => [player.id, []]));
  for (const edge of edges) {
    adjacency[edge.source]?.push({ playerId: edge.target, weight: edge.weight, edgeId: edge.id });
    adjacency[edge.target]?.push({ playerId: edge.source, weight: edge.weight, edgeId: edge.id });
  }
  return adjacency;
}

function makeMatch(id: number, players: Player[], links: PlayerEdge[]): Match {
  const firstRating = players[0]?.skillRating ?? 0;
  const ratingDifference =
    players.length === 2
      ? Math.abs(firstRating - (players[1]?.skillRating ?? 0))
      : Math.abs(
          players.slice(0, 2).reduce((total, player) => total + player.skillRating, 0) -
            players.slice(2).reduce((total, player) => total + player.skillRating, 0),
        );
  const ratingRange = players.length === 2 ? 1000 : 2000;

  return {
    id: `match-${id + 1}`,
    players,
    teamA: players.length === 2 ? [players[0] as Player] : [players[0] as Player, players[3] as Player],
    teamB: players.length === 2 ? [players[1] as Player] : [players[1] as Player, players[2] as Player],
    links,
    ratingDifference,
    fairnessScore: Math.max(0, Math.round((1 - ratingDifference / ratingRange) * 100)),
    serverId: null,
    latencyMs: null,
  };
}

/** Sorts edges in O(E log E), then selects disjoint pairs in O(E). */
export function greedyMatchPlayers(
  players: Player[],
  edges: PlayerEdge[],
  edgeOrder: "greedy" | "input" = "greedy",
): GreedyResult {
  const sortedEdges =
    edgeOrder === "greedy"
      ? [...edges].sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id))
      : edges;
  const byId = new Map(players.map((player) => [player.id, player]));
  const used = new Set<string>();
  const selectedPairs: { players: [Player, Player]; edge: PlayerEdge }[] = [];

  for (const edge of sortedEdges) {
    const playerA = byId.get(edge.source);
    const playerB = byId.get(edge.target);
    if (!playerA || !playerB || used.has(playerA.id) || used.has(playerB.id)) continue;
    used.add(playerA.id);
    used.add(playerB.id);
    selectedPairs.push({ players: [playerA, playerB], edge });
  }

  const groupSize = players[0]?.gameMode === "2v2" ? 2 : 1;
  const pairsByRegion = new Map<Region, typeof selectedPairs>();
  for (const pair of selectedPairs) {
    const region = pair.players[0].region;
    const regionalPairs = pairsByRegion.get(region) ?? [];
    regionalPairs.push(pair);
    pairsByRegion.set(region, regionalPairs);
  }
  const matches: Match[] = [];
  const acceptedEdges: PlayerEdge[] = [];

  for (const regionalPairs of pairsByRegion.values()) {
    const completedPairCount = Math.floor(regionalPairs.length / groupSize) * groupSize;
    for (let i = 0; i < completedPairCount; i += groupSize) {
      const pairGroup = regionalPairs.slice(i, i + groupSize);
      const groupPlayers = pairGroup.flatMap(({ players: pair }) => pair);

      if (groupSize === 2) {
        const ranked = [...groupPlayers].sort(
          (a, b) => b.skillRating - a.skillRating || a.id.localeCompare(b.id),
        );
        const first = ranked[0];
        const second = ranked[1];
        const third = ranked[2];
        const fourth = ranked[3];
        if (!first || !second || !third || !fourth) continue;
        matches.push(
          makeMatch(matches.length, [first, second, third, fourth], pairGroup.map((pair) => pair.edge)),
        );
      } else {
        matches.push(makeMatch(matches.length, groupPlayers, pairGroup.map((pair) => pair.edge)));
      }
      acceptedEdges.push(...pairGroup.map((pair) => pair.edge));
    }
  }

  const matchedIds = new Set(matches.flatMap((match) => match.players.map((player) => player.id)));
  return {
    matches,
    unmatched: players.filter((player) => !matchedIds.has(player.id)),
    acceptedEdges,
  };
}

class MinHeap {
  private values: { id: string; distance: number }[] = [];

  get size() {
    return this.values.length;
  }

  push(value: { id: string; distance: number }) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentValue = this.values[parent];
      const currentValue = this.values[index];
      if (!parentValue || !currentValue || parentValue.distance <= currentValue.distance) break;
      this.values[parent] = currentValue;
      this.values[index] = parentValue;
      index = parent;
    }
  }

  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first) return undefined;
    if (last && this.values.length > 0) {
      this.values[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (
          left < this.values.length &&
          (this.values[left]?.distance ?? Number.POSITIVE_INFINITY) <
            (this.values[smallest]?.distance ?? Number.POSITIVE_INFINITY)
        ) {
          smallest = left;
        }
        if (
          right < this.values.length &&
          (this.values[right]?.distance ?? Number.POSITIVE_INFINITY) <
            (this.values[smallest]?.distance ?? Number.POSITIVE_INFINITY)
        ) {
          smallest = right;
        }
        if (smallest === index) break;
        const current = this.values[index];
        const child = this.values[smallest];
        if (!current || !child) break;
        this.values[index] = child;
        this.values[smallest] = current;
        index = smallest;
      }
    }
    return first;
  }
}

export function dijkstra(
  graph: Map<string, { to: string; weight: number }[]>,
  start: string,
): Map<string, number> {
  // A binary min-heap gives Dijkstra's O((V + E) log V) bound.
  const distances = new Map<string, number>([[start, 0]]);
  const queue = new MinHeap();
  queue.push({ id: start, distance: 0 });

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current || current.distance > (distances.get(current.id) ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    for (const neighbor of graph.get(current.id) ?? []) {
      const candidate = current.distance + neighbor.weight;
      if (candidate < (distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.to, candidate);
        queue.push({ id: neighbor.to, distance: candidate });
      }
    }
  }

  return distances;
}

export function assignServers(matches: Match[], servers: Server[]): { matches: Match[]; servers: Server[] } {
  const availableServers = servers.map((server) => ({ ...server }));
  const assignedMatches: Match[] = [];

  for (const match of matches) {
    const source = `source-${match.id}`;
    const graph = new Map<string, { to: string; weight: number }[]>([[source, []]]);
    const averagePing =
      match.players.reduce((total, player) => total + player.pingMs, 0) / Math.max(match.players.length, 1);

    for (const server of availableServers) {
      const crossRegionPenalty = match.players.some((player) => player.region !== server.region) ? 45 : 0;
      const latency = averagePing + server.baseLatency + crossRegionPenalty;
      graph.get(source)?.push({ to: server.id, weight: latency });
      graph.set(server.id, []);
    }

    const distances = dijkstra(graph, source);
    const chosen = availableServers
      .filter((server) => server.currentLoad + match.players.length <= server.capacity)
      .sort((a, b) => {
        const distanceA = distances.get(a.id) ?? Number.POSITIVE_INFINITY;
        const distanceB = distances.get(b.id) ?? Number.POSITIVE_INFINITY;
        return distanceA - distanceB || a.id.localeCompare(b.id);
      })[0];

    if (chosen) {
      chosen.currentLoad += match.players.length;
      assignedMatches.push({
        ...match,
        serverId: chosen.id,
        latencyMs: Math.round(distances.get(chosen.id) ?? 0),
      });
    } else {
      assignedMatches.push({ ...match, serverId: null, latencyMs: null });
    }
  }

  return { matches: assignedMatches, servers: availableServers };
}

export function createDefaultServers(): Server[] {
  return [
    { id: "sg-01", name: "Singapore 01", region: "Asia", capacity: 20, currentLoad: 0, baseLatency: 8 },
    { id: "sg-02", name: "Tokyo 02", region: "Asia", capacity: 20, currentLoad: 0, baseLatency: 16 },
    { id: "eu-01", name: "Frankfurt 01", region: "EU", capacity: 20, currentLoad: 0, baseLatency: 10 },
    { id: "eu-02", name: "London 02", region: "EU", capacity: 20, currentLoad: 0, baseLatency: 14 },
    { id: "na-01", name: "Ashburn 01", region: "NA", capacity: 20, currentLoad: 0, baseLatency: 9 },
    { id: "na-02", name: "Oregon 02", region: "NA", capacity: 20, currentLoad: 0, baseLatency: 18 },
  ];
}

export function createSeedPlayers(): Player[] {
  const specifications: [string, number, Region, number, number, GameMode][] = [
    ["NOVA", 1860, "Asia", 24, 18, "1v1"],
    ["KITE", 1835, "Asia", 29, 32, "1v1"],
    ["ECHO", 1710, "Asia", 34, 12, "1v1"],
    ["MINT", 1692, "Asia", 31, 45, "1v1"],
    ["RIFT", 1420, "EU", 28, 20, "1v1"],
    ["AXEL", 1405, "EU", 33, 16, "1v1"],
    ["LYNX", 1280, "EU", 41, 54, "1v1"],
    ["VEX", 1255, "EU", 38, 23, "1v1"],
    ["ION", 1980, "NA", 22, 9, "1v1"],
    ["ORBIT", 1940, "NA", 26, 37, "1v1"],
    ["KODA", 1580, "NA", 39, 14, "1v1"],
    ["ZED", 1545, "NA", 44, 48, "1v1"],
    ["PULSE", 1890, "Asia", 27, 31, "2v2"],
    ["FLUX", 1870, "Asia", 30, 24, "2v2"],
    ["BYTE", 1760, "Asia", 33, 42, "2v2"],
    ["JADE", 1740, "Asia", 35, 15, "2v2"],
    ["NEX", 1475, "EU", 31, 28, "2v2"],
    ["SAGE", 1455, "EU", 36, 36, "2v2"],
    ["KERN", 1380, "EU", 39, 11, "2v2"],
    ["WAVE", 1360, "EU", 42, 51, "2v2"],
    ["CIPHER", 1910, "NA", 25, 19, "2v2"],
    ["RIOT", 1895, "NA", 29, 33, "2v2"],
    ["HALO", 1640, "NA", 38, 7, "2v2"],
    ["EMBER", 1620, "NA", 43, 44, "2v2"],
  ];

  return specifications.map(([name, skillRating, region, pingMs, waitTime, gameMode], index) => ({
    id: `seed-${index + 1}`,
    name,
    skillRating,
    region,
    pingMs,
    waitTime,
    gameMode,
  }));
}

export function createRandomPlayers(count: number, gameMode: GameMode): Player[] {
  return Array.from({ length: count }, (_, index) => {
    const region = REGIONS[Math.floor(index / 2) % REGIONS.length] ?? "Asia";
    const band = Math.floor(index / 2) % 5;
    return {
      id: `player-${gameMode}-${index + 1}`,
      name: `PLAYER_${String(index + 1).padStart(2, "0")}`,
      skillRating: Math.min(2500, 850 + band * 290 + Math.floor(Math.random() * 100)),
      region,
      pingMs: 18 + Math.floor(Math.random() * 65),
      waitTime: Math.floor(Math.random() * 90),
      gameMode,
    };
  });
}