"use client";
import { dataUrl } from "./dataUrl";

import { useState, useEffect, useCallback, useRef } from "react";
import type { RubricsData, RemediesData } from "./types";

/**
 * Decode compact base-36 encoded rubric index using the pairs mapping.
 * Each entry is "pairIdx:remaining" or just "pairIdx" (no remaining text).
 * pairIdx is base-36 encoded, and pairs[pairIdx] gives "BodySystem, subcategory".
 */
function decodeRubricIndex(pairs: string[], encoded: string[]): string[] {
  return encoded.map((code) => {
    const colonIdx = code.indexOf(":");
    if (colonIdx === -1) {
      const pairIdx = parseInt(code, 36);
      return pairs[pairIdx];
    }
    const pairIdx = parseInt(code.substring(0, colonIdx), 36);
    const remaining = code.substring(colonIdx + 1);
    return `${pairs[pairIdx]}, ${remaining}`;
  });
}

/**
 * Determine the fetch URL for a rubric's body-system subcategory file.
 * "Mind, anxiety, morning" -> "data/rubrics/Mind/anxiety.json"
 * "Abdomen" -> "data/rubrics/Abdomen/_root.json"
 */
function getRubricFileUrl(rubricName: string): string {
  const parts = rubricName.split(", ");
  const bodySystem = parts[0];
  const subcategory = parts.length > 1 ? parts[1] : "_root";
  const safeName = subcategory.replace(/[^\w\s\-.]/g, "").trim() || "_other";
  return `data/rubrics/${bodySystem}/${safeName}.json`;
}

/**
 * Cache key for deduplication (body system + subcategory file).
 */
function getRubricCacheKey(rubricName: string): string {
  const parts = rubricName.split(", ");
  const bodySystem = parts[0];
  const subcategory = parts.length > 1 ? parts[1] : "_root";
  return `${bodySystem}/${subcategory}`;
}

export function useLazyData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rubricNames, setRubricNames] = useState<string[]>([]);
  const [remedies, setRemedies] = useState<RemediesData | null>(null);

  // Rubric data cache — grows as body-system files are fetched on demand
  const [rubricData, setRubricData] = useState<RubricsData>({});
  const fetchedFilesRef = useRef<Set<string>>(new Set());

  // Load indexes on mount (lightweight: ~2.1 MB total vs 20 MB monolithic)
  useEffect(() => {
    async function loadIndexes() {
      try {
        const [pairsRes, indexRes, remedyRes] = await Promise.all([
          fetch(dataUrl("data/rubric_pairs.json")),
          fetch(dataUrl("data/rubrics/index.json")),
          fetch(dataUrl("data/remedies/index.json")),
        ]);

        if (!pairsRes.ok || !indexRes.ok || !remedyRes.ok) {
          throw new Error("Failed to fetch index files");
        }

        const [pairs, encoded, remedyData] = await Promise.all([
          pairsRes.json(),
          indexRes.json(),
          remedyRes.json(),
        ]);

        const names = decodeRubricIndex(pairs, encoded);
        setRubricNames(names);
        setRemedies(remedyData);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load index");
        setLoading(false);
      }
    }
    loadIndexes();
  }, []);

  /**
   * Fetch rubric data for a given rubric name.
   * Loads the entire body-system/subcategory file (which contains multiple rubrics).
   * Returns a promise that resolves when the data is available.
   */
  const fetchRubricData = useCallback(
    async (rubricName: string): Promise<void> => {
      const cacheKey = getRubricCacheKey(rubricName);
      if (fetchedFilesRef.current.has(cacheKey)) return;
      fetchedFilesRef.current.add(cacheKey);

      const url = getRubricFileUrl(rubricName);
      try {
        const res = await fetch(dataUrl(url));
        if (!res.ok) {
          fetchedFilesRef.current.delete(cacheKey);
          return;
        }
        const data: RubricsData = await res.json();
        setRubricData((prev) => ({ ...prev, ...data }));
      } catch {
        fetchedFilesRef.current.delete(cacheKey);
      }
    },
    []
  );

  /**
   * Fetch rubric data for multiple rubrics in parallel.
   * Deduplicates by body-system/subcategory file.
   */
  const fetchMultipleRubricData = useCallback(
    async (rubricNames: string[]): Promise<void> => {
      const uniqueKeys = new Set<string>();
      const toFetch: string[] = [];

      for (const name of rubricNames) {
        const key = getRubricCacheKey(name);
        if (!fetchedFilesRef.current.has(key) && !uniqueKeys.has(key)) {
          uniqueKeys.add(key);
          toFetch.push(name);
        }
      }

      if (toFetch.length === 0) return;
      await Promise.all(toFetch.map(fetchRubricData));
    },
    [fetchRubricData]
  );

  return {
    loading,
    error,
    rubricNames,
    remedies,
    rubricData,
    fetchRubricData,
    fetchMultipleRubricData,
  };
}
