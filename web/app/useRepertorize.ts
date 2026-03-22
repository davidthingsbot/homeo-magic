"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { SymptomsData, RemediesData, RepertoResult } from "./types";
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
    symptomNames,
    remedies,
    symptomData,
    fetchSymptomData,
    fetchMultipleSymptomData,
  } = useLazyData();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [hiddenSymptoms, setHiddenSymptoms] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState(0);
  const hydratedRef = useRef(false);

  // Restore persisted state after hydration, or load defaults on first visit
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("homeo-magic-state");
      if (raw) {
        const saved = JSON.parse(raw);
        let restored = false;
        if (Array.isArray(saved.selectedSymptoms) && saved.selectedSymptoms.length > 0) {
          setSelectedSymptoms(saved.selectedSymptoms);
          if (Array.isArray(saved.hiddenSymptoms) && saved.hiddenSymptoms.length > 0) {
            setHiddenSymptoms(new Set(saved.hiddenSymptoms));
          }
          if (typeof saved.minScore === "number" && saved.minScore > 0) {
            setMinScore(saved.minScore);
          }
          return; // Had persisted state with symptoms, skip defaults
        }
      }
    } catch {}

    // No persisted symptoms -- load defaults
    fetch("data/default-symptoms.json")
      .then((res) => res.ok ? res.json() : null)
      .then((defaults) => {
        if (Array.isArray(defaults) && defaults.length > 0) {
          setSelectedSymptoms(defaults);
        }
      })
      .catch(() => {}); // No defaults file, that's fine
  }, []);

  // When index finishes loading, fetch body-system data for any selected symptoms
  useEffect(() => {
    if (indexLoading || selectedSymptoms.length === 0) return;
    fetchMultipleSymptomData(selectedSymptoms);
  }, [indexLoading, selectedSymptoms, fetchMultipleSymptomData]);

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
        selectedSymptoms,
        hiddenSymptoms: [...hiddenSymptoms],
        minScore,
      })
    );
  }, [selectedSymptoms, hiddenSymptoms, minScore]);

  // Build fuzzy search index from symptom names
  const searchIndex = useMemo(() => {
    if (symptomNames.length === 0) return null;
    return buildSearchIndex(symptomNames);
  }, [symptomNames]);

  const searchSymptoms = useCallback(
    (query: string, limit: number = 50): string[] => {
      if (!searchIndex || !query.trim()) return [];
      const results = search(searchIndex, query, limit + selectedSymptoms.length);
      return results
        .map((r) => r.name)
        .filter((name) => !selectedSymptoms.includes(name))
        .slice(0, limit);
    },
    [searchIndex, selectedSymptoms]
  );

  const addSymptom = useCallback(
    (symptom: string) => {
      setSelectedSymptoms((prev) => {
        if (prev.includes(symptom)) return prev;
        return [...prev, symptom];
      });
      // Trigger lazy fetch of body-system data for this symptom
      fetchSymptomData(symptom);
    },
    [fetchSymptomData]
  );

  const removeSymptom = useCallback((symptom: string) => {
    setSelectedSymptoms((prev) => prev.filter((s) => s !== symptom));
    setHiddenSymptoms((prev) => {
      if (!prev.has(symptom)) return prev;
      const next = new Set(prev);
      next.delete(symptom);
      return next;
    });
  }, []);

  const hideSymptom = useCallback((symptom: string) => {
    setHiddenSymptoms((prev) => {
      const next = new Set(prev);
      next.add(symptom);
      return next;
    });
  }, []);

  const showSymptom = useCallback((symptom: string) => {
    setHiddenSymptoms((prev) => {
      if (!prev.has(symptom)) return prev;
      const next = new Set(prev);
      next.delete(symptom);
      return next;
    });
  }, []);

  const reorderSymptoms = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedSymptoms((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearSymptoms = useCallback(() => {
    setSelectedSymptoms([]);
    setHiddenSymptoms(new Set());
  }, []);

  // Use symptomData (lazy-loaded cache) as the symptoms object
  const symptoms: SymptomsData | null =
    Object.keys(symptomData).length > 0 ? symptomData : null;

  // Compute results: all remedies across visible symptoms, scored and normalized
  const results = useMemo((): {
    items: RepertoResult[];
    gradeMap: { [abbrev: string]: { [symptom: string]: number } };
    maxScore: number;
    totalCount: number;
  } => {
    if (!remedies || selectedSymptoms.length === 0) {
      return { items: [], gradeMap: {}, maxScore: 0, totalCount: 0 };
    }

    const visibleSymptoms = selectedSymptoms.filter(
      (s) => !hiddenSymptoms.has(s)
    );
    if (visibleSymptoms.length === 0) {
      return { items: [], gradeMap: {}, maxScore: 0, totalCount: 0 };
    }

    const scores: { [abbrev: string]: number } = {};
    const gradeMap: { [abbrev: string]: { [symptom: string]: number } } = {};

    for (const sym of visibleSymptoms) {
      const symData = symptomData[sym];
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
  }, [symptomData, remedies, selectedSymptoms, hiddenSymptoms]);

  return {
    loading,
    error,
    loadProgress,
    symptoms,
    remedies,
    selectedSymptoms,
    hiddenSymptoms,
    results,
    minScore,
    setMinScore,
    searchSymptoms,
    addSymptom,
    removeSymptom,
    hideSymptom,
    showSymptom,
    clearSymptoms,
    reorderSymptoms,
    symptomCount: symptomNames.length,
    remedyCount: remedies ? Object.keys(remedies).length : 0,
  };
}
