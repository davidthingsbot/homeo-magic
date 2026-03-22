"use client";
import { dataUrl } from "./dataUrl";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SymptomsData, RemediesData } from "./types";

/**
 * Decode compact base-36 encoded symptom index using the pairs mapping.
 * Each entry is "pairIdx:remaining" or just "pairIdx" (no remaining text).
 * pairIdx is base-36 encoded, and pairs[pairIdx] gives "BodySystem, subcategory".
 */
function decodeSymptomIndex(pairs: string[], encoded: string[]): string[] {
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
 * Determine the fetch URL for a symptom's body-system subcategory file.
 * "Mind, anxiety, morning" -> "data/symptoms/Mind/anxiety.json"
 * "Abdomen" -> "data/symptoms/Abdomen/_root.json"
 */
function getSymptomFileUrl(symptomName: string): string {
  const parts = symptomName.split(", ");
  const bodySystem = parts[0];
  const subcategory = parts.length > 1 ? parts[1] : "_root";
  const safeName = subcategory.replace(/[^\w\s\-.]/g, "").trim() || "_other";
  return `data/symptoms/${bodySystem}/${safeName}.json`;
}

/**
 * Cache key for deduplication (body system + subcategory file).
 */
function getSymptomCacheKey(symptomName: string): string {
  const parts = symptomName.split(", ");
  const bodySystem = parts[0];
  const subcategory = parts.length > 1 ? parts[1] : "_root";
  return `${bodySystem}/${subcategory}`;
}

export function useLazyData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symptomNames, setSymptomNames] = useState<string[]>([]);
  const [remedies, setRemedies] = useState<RemediesData | null>(null);

  // Symptom data cache — grows as body-system files are fetched on demand
  const [symptomData, setSymptomData] = useState<SymptomsData>({});
  const fetchedFilesRef = useRef<Set<string>>(new Set());

  // Load indexes on mount (lightweight: ~2.1 MB total vs 20 MB monolithic)
  useEffect(() => {
    async function loadIndexes() {
      try {
        const [pairsRes, indexRes, remedyRes] = await Promise.all([
          fetch(dataUrl("data/symptom_pairs.json")),
          fetch(dataUrl("data/symptoms/index.json")),
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

        const names = decodeSymptomIndex(pairs, encoded);
        setSymptomNames(names);
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
   * Fetch symptom data for a given symptom name.
   * Loads the entire body-system/subcategory file (which contains multiple symptoms).
   * Returns a promise that resolves when the data is available.
   */
  const fetchSymptomData = useCallback(
    async (symptomName: string): Promise<void> => {
      const cacheKey = getSymptomCacheKey(symptomName);
      if (fetchedFilesRef.current.has(cacheKey)) return;
      fetchedFilesRef.current.add(cacheKey);

      const url = getSymptomFileUrl(symptomName);
      try {
        const res = await fetch(dataUrl(url));
        if (!res.ok) {
          fetchedFilesRef.current.delete(cacheKey);
          return;
        }
        const data: SymptomsData = await res.json();
        setSymptomData((prev) => ({ ...prev, ...data }));
      } catch {
        fetchedFilesRef.current.delete(cacheKey);
      }
    },
    []
  );

  /**
   * Fetch symptom data for multiple symptoms in parallel.
   * Deduplicates by body-system/subcategory file.
   */
  const fetchMultipleSymptomData = useCallback(
    async (symptomNames: string[]): Promise<void> => {
      const uniqueKeys = new Set<string>();
      const toFetch: string[] = [];

      for (const name of symptomNames) {
        const key = getSymptomCacheKey(name);
        if (!fetchedFilesRef.current.has(key) && !uniqueKeys.has(key)) {
          uniqueKeys.add(key);
          toFetch.push(name);
        }
      }

      if (toFetch.length === 0) return;
      await Promise.all(toFetch.map(fetchSymptomData));
    },
    [fetchSymptomData]
  );

  return {
    loading,
    error,
    symptomNames,
    remedies,
    symptomData,
    fetchSymptomData,
    fetchMultipleSymptomData,
  };
}
