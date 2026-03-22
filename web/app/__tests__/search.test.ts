import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for fuzzy multi-token rubric search.
 *
 * The search module should be importable from "../search" and expose:
 *   - buildSearchIndex(rubricNames: string[]): SearchIndex
 *   - search(index: SearchIndex, query: string, limit?: number): SearchResult[]
 *
 * Each SearchResult has: { name: string; score: number }
 */

// The module under test — does not exist yet (TDD)
import { buildSearchIndex, search } from "../search";
import type { SearchIndex, SearchResult } from "../search";

// ---------- sample rubrics ----------
const SAMPLE_RUBRICS = [
  "Extremities, pain, foot",
  "Extremities, pain, hand",
  "Extremities, coldness, foot",
  "Extremities, numbness, foot",
  "Head, pain",
  "Head, pain, forehead",
  "Head, pain, temples",
  "Head, burning",
  "Mind, anxiety",
  "Mind, fear of death",
  "Abdomen, pain",
  "Abdomen, pain, burning",
  "Abdomen, distension",
  "Stomach, nausea",
  "Stomach, burning",
  "Chest, pain, burning",
  "Back, pain, lumbar",
  "Throat, pain, burning",
  "Skin, burning",
  "Eye, burning",
];

describe("Fuzzy multi-token search", () => {
  let index: SearchIndex;

  beforeEach(() => {
    index = buildSearchIndex(SAMPLE_RUBRICS);
  });

  // 1. Exact prefix match
  it("returns exact prefix match as top result", () => {
    const results = search(index, "Extremities, pain, foot");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Extremities, pain, foot");
  });

  // 2. Multi-token: 'pain foot' matches 'Extremities, pain, foot'
  it("matches multi-token query across rubric parts", () => {
    const results = search(index, "pain foot");
    const names = results.map((r) => r.name);
    expect(names).toContain("Extremities, pain, foot");
    // Should be in top results
    const idx = names.indexOf("Extremities, pain, foot");
    expect(idx).toBeLessThan(5);
  });

  // 3. Reversed words: 'foot pain' still finds it
  it("matches reversed word order", () => {
    const results = search(index, "foot pain");
    const names = results.map((r) => r.name);
    expect(names).toContain("Extremities, pain, foot");
  });

  // 4. Typo tolerance: 'hed pain' matches 'Head, pain'
  it("tolerates typos: 'hed pain' matches 'Head, pain'", () => {
    const results = search(index, "hed pain");
    const names = results.map((r) => r.name);
    expect(names).toContain("Head, pain");
  });

  // 5. Typo tolerance: 'burnng' matches burning rubrics
  it("tolerates typos: 'burnng' matches burning rubrics", () => {
    const results = search(index, "burnng");
    const names = results.map((r) => r.name);
    const burningResults = names.filter((n) => n.includes("burning"));
    expect(burningResults.length).toBeGreaterThan(0);
  });

  // 6. Abbreviation-like: 'abd pain' matches 'Abdomen, pain'
  it("matches abbreviation-like prefixes: 'abd pain'", () => {
    const results = search(index, "abd pain");
    const names = results.map((r) => r.name);
    expect(names).toContain("Abdomen, pain");
  });

  // 7. Progressive typing: results refine as user types more
  it("refines results as more characters are typed", () => {
    const results1 = search(index, "pa");
    const results2 = search(index, "pain");
    const results3 = search(index, "pain foot");

    // More specific queries should return fewer or more relevant results
    // "pain foot" should be more specific than "pain"
    expect(results1.length).toBeGreaterThanOrEqual(results3.length);

    // The top result for "pain foot" should be the foot-specific rubric
    if (results3.length > 0) {
      expect(results3[0].name).toContain("foot");
    }
  });

  // 8. Empty input: no results, no crash
  it("returns empty array for empty input", () => {
    const results = search(index, "");
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    const results = search(index, "   ");
    expect(results).toEqual([]);
  });

  it("does not throw on empty input", () => {
    expect(() => search(index, "")).not.toThrow();
    expect(() => search(index, "   ")).not.toThrow();
  });

  // 9. Exact matches rank above fuzzy matches
  it("ranks exact matches above fuzzy matches", () => {
    const results = search(index, "Head, pain");
    expect(results.length).toBeGreaterThan(0);
    // "Head, pain" should rank above "Head, pain, forehead" and "Head, pain, temples"
    expect(results[0].name).toBe("Head, pain");
    // The exact match score should be highest
    if (results.length > 1) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  // 10. Results are scored and ordered by relevance
  it("returns results ordered by descending score", () => {
    const results = search(index, "pain burning");
    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("every result has a numeric score", () => {
    const results = search(index, "pain");
    for (const r of results) {
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });
});
