"use client";
import { dataUrl } from "./dataUrl";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { RubricsData, RemediesData, RepertoResult } from "./types";
import { useLazyData } from "./useLazyData";
import { buildSearchIndex, search } from "./search";

export interface LoadProgress {
  phase: "idle" | "index" | "done" | "error";
  message: string;
  percent: number;
}

export function useRepertorize() {
  const {
    loading: indexLoading,
    error: indexError,
    rubricNames,
    remedies,
    rubricData,
    fetchRubricData,
    fetchMultipleRubricData,
  } = useLazyData();

  const [selectedRubrics, setSelectedRubrics] = useState<string[]>([]);
  const [hiddenRubrics, setHiddenRubrics] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState(0);
  const hydratedRef = useRef(false);

  // Restore persisted state after hydration, or load defaults on first visit
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("homeo-magic-state");
      if (raw) {
        const saved = JSON.parse(raw);
        let restored = false;
        if (Array.isArray(saved.selectedRubrics) && saved.selectedRubrics.length > 0) {
          setSelectedRubrics(saved.selectedRubrics);
          if (Array.isArray(saved.hiddenRubrics) && saved.hiddenRubrics.length > 0) {
            setHiddenRubrics(new Set(saved.hiddenRubrics));
          }
          if (typeof saved.minScore === "number" && saved.minScore > 0) {
            setMinScore(saved.minScore);
          }
          return; // Had persisted state with rubrics, skip defaults
        }
      }
    } catch {}

    // No persisted rubrics -- load defaults
    fetch(dataUrl("data/default-rubrics.json"))
      .then((res) => res.ok ? res.json() : null)
      .then((defaults) => {
        if (Array.isArray(defaults) && defaults.length > 0) {
          setSelectedRubrics(defaults);
        }
      })
      .catch(() => {}); // No defaults file, that's fine
  }, []);

  // When index finishes loading, fetch body-system data for any selected rubrics
  useEffect(() => {
    if (indexLoading || selectedRubrics.length === 0) return;
    fetchMultipleRubricData(selectedRubrics);
  }, [indexLoading, selectedRubrics, fetchMultipleRubricData]);

  const loading = indexLoading;
  const error = indexError;
  const loadProgress: LoadProgress = indexLoading
    ? { phase: "index", message: "Loading index...", percent: 0 }
    : indexError
      ? { phase: "error", message: indexError, percent: 0 }
      : { phase: "done", message: "Ready", percent: 100 };

  // Persist state to sessionStorage so it survives navigation to settings.
  // Skip the initial render to avoid clobbering saved state with empty defaults
  // before the restore effect's state updates have been applied.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    sessionStorage.setItem(
      "homeo-magic-state",
      JSON.stringify({
        selectedRubrics,
        hiddenRubrics: [...hiddenRubrics],
        minScore,
      })
    );
  }, [selectedRubrics, hiddenRubrics, minScore]);

  // Build fuzzy search index from rubric names
  const searchIndex = useMemo(() => {
    if (rubricNames.length === 0) return null;
    return buildSearchIndex(rubricNames);
  }, [rubricNames]);

  const searchRubrics = useCallback(
    (query: string, limit: number = 50): string[] => {
      if (!searchIndex || !query.trim()) return [];
      const results = search(searchIndex, query, limit + selectedRubrics.length);
      return results
        .map((r) => r.name)
        .filter((name) => !selectedRubrics.includes(name))
        .slice(0, limit);
    },
    [searchIndex, selectedRubrics]
  );

  const addRubric = useCallback(
    (rubric: string) => {
      setSelectedRubrics((prev) => {
        if (prev.includes(rubric)) return prev;
        return [...prev, rubric];
      });
      // Trigger lazy fetch of body-system data for this rubric
      fetchRubricData(rubric);
    },
    [fetchRubricData]
  );

  const removeRubric = useCallback((rubric: string) => {
    setSelectedRubrics((prev) => prev.filter((s) => s !== rubric));
    setHiddenRubrics((prev) => {
      if (!prev.has(rubric)) return prev;
      const next = new Set(prev);
      next.delete(rubric);
      return next;
    });
  }, []);

  const hideRubric = useCallback((rubric: string) => {
    setHiddenRubrics((prev) => {
      const next = new Set(prev);
      next.add(rubric);
      return next;
    });
  }, []);

  const showRubric = useCallback((rubric: string) => {
    setHiddenRubrics((prev) => {
      if (!prev.has(rubric)) return prev;
      const next = new Set(prev);
      next.delete(rubric);
      return next;
    });
  }, []);

  const reorderRubrics = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedRubrics((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearRubrics = useCallback(() => {
    setSelectedRubrics([]);
    setHiddenRubrics(new Set());
  }, []);

  // Use rubricData (lazy-loaded cache) as the rubrics object
  const rubrics: RubricsData | null =
    Object.keys(rubricData).length > 0 ? rubricData : null;

  // Compute results: all remedies across visible rubrics, scored and normalized
  const results = useMemo((): {
    items: RepertoResult[];
    gradeMap: { [abbrev: string]: { [rubric: string]: number } };
    maxScore: number;
    totalCount: number;
  } => {
    if (!remedies || selectedRubrics.length === 0) {
      return { items: [], gradeMap: {}, maxScore: 0, totalCount: 0 };
    }

    const visibleRubrics = selectedRubrics.filter(
      (s) => !hiddenRubrics.has(s)
    );
    if (visibleRubrics.length === 0) {
      return { items: [], gradeMap: {}, maxScore: 0, totalCount: 0 };
    }

    const scores: { [abbrev: string]: number } = {};
    const gradeMap: { [abbrev: string]: { [rubric: string]: number } } = {};

    for (const sym of visibleRubrics) {
      const symData = rubricData[sym];
      if (!symData) continue;
      for (const [abbrev, grade] of Object.entries(symData.remedies)) {
        if (!scores[abbrev]) {
          scores[abbrev] = 0;
          gradeMap[abbrev] = {};
        }
        scores[abbrev] += grade;
        gradeMap[abbrev][sym] = grade;
      }
    }

    const allSorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (allSorted.length === 0) {
      return { items: [], gradeMap: {}, maxScore: 0, totalCount: 0 };
    }

    const maxScore = allSorted[0][1];
    const allNormalized: RepertoResult[] = allSorted.map(
      ([abbrev, rawScore]) => ({
        abbrev,
        fullName: remedies[abbrev] || abbrev,
        totalScore: Math.round((rawScore / maxScore) * 100),
        rawScore,
        breakdown: gradeMap[abbrev],
      })
    );

    return {
      items: allNormalized,
      gradeMap,
      maxScore,
      totalCount: allNormalized.length,
    };
  }, [rubricData, remedies, selectedRubrics, hiddenRubrics]);

  return {
    loading,
    error,
    loadProgress,
    rubrics,
    remedies,
    selectedRubrics,
    hiddenRubrics,
    results,
    minScore,
    setMinScore,
    searchRubrics,
    addRubric,
    removeRubric,
    hideRubric,
    showRubric,
    clearRubrics,
    reorderRubrics,
    rubricCount: rubricNames.length,
    remedyCount: remedies ? Object.keys(remedies).length : 0,
  };
}
