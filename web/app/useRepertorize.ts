"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { SymptomsData, RemediesData, RepertoResult } from "./types";

export interface LoadProgress {
  phase: "idle" | "remedies" | "symptoms" | "done" | "error";
  message: string;
  percent: number;
}

async function fetchWithProgress(
  url: string,
  onProgress: (received: number, total: number) => void
): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }

  const allChunks = new Uint8Array(received);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  const text = new TextDecoder().decode(allChunks);
  return JSON.parse(text);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function useRepertorize() {
  const [symptoms, setSymptoms] = useState<SymptomsData | null>(null);
  const [remedies, setRemedies] = useState<RemediesData | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem("homeo-magic-state");
      if (raw) return JSON.parse(raw).selectedSymptoms || [];
    } catch {}
    return [];
  });
  const [hiddenSymptoms, setHiddenSymptoms] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem("homeo-magic-state");
      if (raw) {
        const arr = JSON.parse(raw).hiddenSymptoms;
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch {}
    return new Set();
  });
  const [minScore, setMinScore] = useState(() => {
    try {
      const raw = sessionStorage.getItem("homeo-magic-state");
      if (raw) return JSON.parse(raw).minScore || 0;
    } catch {}
    return 0;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    phase: "idle",
    message: "Loading repertory data...",
    percent: 0,
  });

  // Persist state to sessionStorage so it survives navigation to settings
  useEffect(() => {
    sessionStorage.setItem(
      "homeo-magic-state",
      JSON.stringify({
        selectedSymptoms,
        hiddenSymptoms: [...hiddenSymptoms],
        minScore,
      })
    );
  }, [selectedSymptoms, hiddenSymptoms, minScore]);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoadProgress({
          phase: "remedies",
          message: "Loading remedies...",
          percent: 0,
        });
        const remediesData = (await fetchWithProgress(
          "data/remedies.json",
          (received, total) => {
            setLoadProgress({
              phase: "remedies",
              message: `Remedies: ${formatBytes(received)}${total ? " / " + formatBytes(total) : ""}`,
              percent: total ? Math.round((received / total) * 100) : 0,
            });
          }
        )) as RemediesData;
        setRemedies(remediesData);

        const startTime = Date.now();
        setLoadProgress({
          phase: "symptoms",
          message: "Loading symptoms (large file)...",
          percent: 0,
        });
        const symptomsData = (await fetchWithProgress(
          "data/symptoms.json",
          (received, total) => {
            const pct = total ? Math.round((received / total) * 100) : 0;
            setLoadProgress({
              phase: "symptoms",
              message: `Symptoms: ${formatBytes(received)}${total ? " / " + formatBytes(total) : ""} ${pct}%`,
              percent: pct,
            });
          }
        )) as SymptomsData;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        setSymptoms(symptomsData);

        setLoadProgress({
          phase: "done",
          message: `Loaded in ${elapsed}s`,
          percent: 100,
        });
        setLoading(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load data";
        setError(msg);
        setLoadProgress({ phase: "error", message: msg, percent: 0 });
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const searchSymptoms = useCallback(
    (query: string, limit: number = 50): string[] => {
      if (!symptoms || !query.trim()) return [];
      const q = query.toLowerCase();
      const matches: string[] = [];
      for (const symptom of Object.keys(symptoms)) {
        if (
          symptom.toLowerCase().includes(q) &&
          !selectedSymptoms.includes(symptom)
        ) {
          matches.push(symptom);
          if (matches.length >= limit) break;
        }
      }
      return matches;
    },
    [symptoms, selectedSymptoms]
  );

  const addSymptom = useCallback((symptom: string) => {
    setSelectedSymptoms((prev) => {
      if (prev.includes(symptom)) return prev;
      return [...prev, symptom];
    });
  }, []);

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

  const clearSymptoms = useCallback(() => {
    setSelectedSymptoms([]);
    setHiddenSymptoms(new Set());
  }, []);

  // Compute results: all remedies across visible symptoms, scored and normalized
  const results = useMemo((): {
    items: RepertoResult[];
    gradeMap: { [abbrev: string]: { [symptom: string]: number } };
    maxScore: number;
    totalCount: number;
  } => {
    if (!symptoms || !remedies || selectedSymptoms.length === 0) {
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
      const symData = symptoms[sym];
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
  }, [symptoms, remedies, selectedSymptoms, hiddenSymptoms]);

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
    symptomCount: symptoms ? Object.keys(symptoms).length : 0,
    remedyCount: remedies ? Object.keys(remedies).length : 0,
  };
}
