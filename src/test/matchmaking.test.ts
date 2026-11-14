import { describe, expect, it } from "vitest";
import {
  assignServers,
  buildAdjacencyList,
  buildCompatibilityGraph,
  dijkstra,
  greedyMatchPlayers,
  type Match,
  type Player,
  type PlayerEdge,
  type Server,
} from "@/lib/matchmaking";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    skillRating: 1000,
    region: "Asia",
    pingMs: 20,
    waitTime: 0,
    gameMode: "1v1",
    ...overrides,
  };
}

function match(id: string, players: Player[]): Match {
  return {
    id,
    players,
    teamA: [players[0] as Player],
    teamB: [players[1] as Player],
    links: [],
    ratingDifference: 0,
    fairnessScore: 100,
    serverId: null,
    latencyMs: null,
  };
}

describe("matchmaking algorithm", () => {
  it("connects only same-mode, same-region players within the 250-rating threshold", () => {
    const players = [
      player("a", { skillRating: 1000 }),
      player("b", { skillRating: 1250 }),
      player("c", { skillRating: 1251 }),
      player("d", { region: "EU" }),
      player("e", { gameMode: "2v2" }),
    ];
    expect(buildCompatibilityGraph(players).map((edge) => edge.id)).toEqual(["a--b"]);
  });

  it("weights edges with rating, ping, and wait-time priority", () => {
    const [edge] = buildCompatibilityGraph([
      player("a", { skillRating: 1000, pingMs: 20, waitTime: 30 }),
      player("b", { skillRating: 1100, pingMs: 40, waitTime: 10 }),
    ]);
    expect(edge?.weight).toBe(107);
  });

  it("stores each compatible edge in both adjacency-list directions", () => {
    const players = [player("a"), player("b")];
    const adjacency = buildAdjacencyList(players, buildCompatibilityGraph(players));
    expect(adjacency.a?.[0]?.playerId).toBe("b");
    expect(adjacency.b?.[0]?.playerId).toBe("a");
  });

  it("greedily chooses lowest-weight edges without reusing players", () => {
    const players = [player("a"), player("b"), player("c"), player("d")];
    const edges: PlayerEdge[] = [
      { id: "a-b", source: "a", target: "b", weight: 1 },
      { id: "a-c", source: "a", target: "c", weight: 2 },
      { id: "b-d", source: "b", target: "d", weight: 3 },
    ];
    const result = greedyMatchPlayers(players, edges);
    expect(result.acceptedEdges.map((edge) => edge.id)).toEqual(["a-b"]);
    expect(result.matches[0]?.players.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.unmatched.map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("snake-drafts the two highest ratings against the next two in 2v2", () => {
    const players = [
      player("a", { skillRating: 2000, gameMode: "2v2" }),
      player("b", { skillRating: 1900, gameMode: "2v2" }),
      player("c", { skillRating: 1800, gameMode: "2v2" }),
      player("d", { skillRating: 1700, gameMode: "2v2" }),
    ];
    const edges: PlayerEdge[] = [
      { id: "a-b", source: "a", target: "b", weight: 1 },
      { id: "c-d", source: "c", target: "d", weight: 2 },
    ];
    const result = greedyMatchPlayers(players, edges);
    expect(result.matches[0]?.teamA.map((item) => item.id)).toEqual(["a", "d"]);
    expect(result.matches[0]?.teamB.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("finds the shortest Dijkstra path", () => {
    const graph = new Map([
      ["start", [{ to: "middle", weight: 2 }, { to: "end", weight: 10 }]],
      ["middle", [{ to: "end", weight: 3 }]],
      ["end", []],
    ]);
    expect(dijkstra(graph, "start").get("end")).toBe(5);
  });

  it("assigns a match to the lowest-latency server with room for every player", () => {
    const players = [player("a"), player("b")];
    const servers: Server[] = [
      { id: "full", name: "Full", region: "Asia", capacity: 2, currentLoad: 1, baseLatency: 1 },
      { id: "open", name: "Open", region: "Asia", capacity: 2, currentLoad: 0, baseLatency: 8 },
    ];
    const result = assignServers([match("one", players)], servers);
    expect(result.matches[0]?.serverId).toBe("open");
    expect(result.matches[0]?.latencyMs).toBe(28);
    expect(result.servers.find((server) => server.id === "open")?.currentLoad).toBe(2);
  });

  it("leaves a match unassigned when no server has room for the full group", () => {
    const players = [player("a"), player("b")];
    const servers: Server[] = [
      { id: "full", name: "Full", region: "Asia", capacity: 3, currentLoad: 2, baseLatency: 1 },
    ];
    const result = assignServers([match("one", players)], servers);
    expect(result.matches[0]?.serverId).toBeNull();
    expect(result.servers[0]?.currentLoad).toBe(2);
  });
});