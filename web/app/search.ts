/**
 * Fuzzy multi-token rubric search module.
 */

export interface SearchIndex {
  names: string[];
  lowered: string[];
  tokens: string[][];  // pre-split lowercase tokens per rubric
}

export interface SearchResult {
  name: string;
  score: number;
}

export function buildSearchIndex(rubricNames: string[]): SearchIndex {
  const names = rubricNames;
  const lowered = names.map((n) => n.toLowerCase());
  const tokens = lowered.map((n) =>
    n.split(/[\s,]+/).filter((t) => t.length > 0)
  );
  return { names, lowered, tokens };
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row DP
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function tokenMatchScore(queryToken: string, rubricToken: string): number {
  // Exact match
  if (queryToken === rubricToken) return 10;
  // Prefix match
  if (rubricToken.startsWith(queryToken)) return 8;
  // Contains
  if (rubricToken.includes(queryToken)) return 5;

  // Edit distance for fuzzy matching
  const maxDist = queryToken.length <= 3 ? 1 : 2;
  const dist = editDistance(queryToken, rubricToken);
  if (dist <= maxDist) return 6 - dist;

  // Check prefix with edit distance (for abbreviations like "hed" -> "head")
  const prefixLen = Math.min(queryToken.length + 1, rubricToken.length);
  const prefixDist = editDistance(queryToken, rubricToken.substring(0, prefixLen));
  if (prefixDist <= maxDist) return 5 - prefixDist;

  return 0;
}

export function search(
  index: SearchIndex,
  query: string,
  limit: number = 50
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryLower = trimmed.toLowerCase();
  const queryTokens = queryLower.split(/[\s,]+/).filter((t) => t.length > 0);
  if (queryTokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (let i = 0; i < index.names.length; i++) {
    const nameLower = index.lowered[i];
    const rubricTokens = index.tokens[i];

    let totalScore = 0;

    // Bonus for exact full match
    if (nameLower === queryLower) {
      totalScore += 100;
    }
    // Bonus for exact prefix match
    else if (nameLower.startsWith(queryLower)) {
      totalScore += 50;
    }

    // Score each query token against best matching rubric token
    let allTokensMatch = true;
    for (const qt of queryTokens) {
      let bestTokenScore = 0;
      for (const st of rubricTokens) {
        const s = tokenMatchScore(qt, st);
        if (s > bestTokenScore) bestTokenScore = s;
      }
      if (bestTokenScore === 0) {
        allTokensMatch = false;
        break;
      }
      totalScore += bestTokenScore;
    }

    if (!allTokensMatch || totalScore === 0) continue;

    // Slight penalty for longer names (prefer more specific matches)
    const lengthPenalty = rubricTokens.length * 0.1;
    totalScore -= lengthPenalty;

    results.push({ name: index.names[i], score: totalScore });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
