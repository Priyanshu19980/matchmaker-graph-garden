import {
  assignServers,
  buildCompatibilityGraph,
  createDefaultServers,
  createRandomPlayers,
  greedyMatchPlayers,
  type MatchmakingRun,
  type Player,
} from "@/lib/matchmaking";

function seededShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let state = seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target] as T, shuffled[index] as T];
  }

  return shuffled;
}

function meanFairness(scores: number[]) {
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
}

/** Computes the greedy run, a reproducible random baseline, and measured sample sizes. */
export function runMatchmaking(players: Player[], includeBenchmarks = true): MatchmakingRun & {
  benchmarks: { count: number; greedy: number; random: number; greedyMs: number; randomMs: number }[];
  randomMatches: MatchmakingRun["matches"];
} {
  const runStart = performance.now();
  const edges = buildCompatibilityGraph(players);
  const greedy = greedyMatchPlayers(players, edges);
  const assigned = assignServers(greedy.matches, createDefaultServers());
  const durationMs = performance.now() - runStart;

  const randomStart = performance.now();
  const randomResult = greedyMatchPlayers(
    players,
    seededShuffle(edges, players.length * 101 + edges.length),
    "input",
  );
  const randomDurationMs = performance.now() - randomStart;

  const benchmarks: {
    count: number;
    greedy: number;
    random: number;
    greedyMs: number;
    randomMs: number;
  }[] = [];

  if (includeBenchmarks) {
    for (const count of [10, 25, 50, 75, 100]) {
      const benchmarkMode = players[0]?.gameMode ?? "1v1";
      const sample = createRandomPlayers(count, benchmarkMode).map((player, index) => ({
        ...player,
        id: `bench-${count}-${index}`,
      }));
      const greedyStart = performance.now();
      const sampleEdges = buildCompatibilityGraph(sample);
      const sampleGreedy = greedyMatchPlayers(sample, sampleEdges);
      const greedyMs = performance.now() - greedyStart;
      const sampleRandomStart = performance.now();
      const sampleRandom = greedyMatchPlayers(
        sample,
        seededShuffle(sampleEdges, count * 271 + sampleEdges.length),
        "input",
      );
      const randomMs = performance.now() - sampleRandomStart;
      benchmarks.push({
        count,
        greedy: meanFairness(sampleGreedy.matches.map((match) => match.fairnessScore)),
        random: meanFairness(sampleRandom.matches.map((match) => match.fairnessScore)),
        greedyMs,
        randomMs,
      });
    }
  }

  return {
    ...greedy,
    matches: assigned.matches,
    edges,
    servers: assigned.servers,
    durationMs,
    randomFairness: meanFairness(randomResult.matches.map((match) => match.fairnessScore)),
    randomMatches: randomResult.matches,
    randomDurationMs,
    benchmarks,
  };
}