"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { SymptomsData, RemediesData, RepertoResult } from "./types";

export function useRepertorize() {
  const [symptoms, setSymptoms] = useState<SymptomsData | null>(null);
  const [remedies, setRemedies] = useState<RemediesData | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [recentSymptoms, setRecentSymptoms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        console.log("Starting data load...");
        
        // Load remedies first (smaller file)
        console.log("Fetching remedies...");
        const remediesRes = await fetch("/data/remedies.json");
        if (!remediesRes.ok) {
          throw new Error(`Remedies fetch failed: ${remediesRes.status}`);
        }
        const remediesData = await remediesRes.json();
        console.log(`Loaded ${Object.keys(remediesData).length} remedies`);
        setRemedies(remediesData);
        
        // Then load symptoms (larger file - 20MB)
        console.log("Fetching symptoms (large file)...");
        const symptomsRes = await fetch("/data/symptoms.json");
        if (!symptomsRes.ok) {
          throw new Error(`Symptoms fetch failed: ${symptomsRes.status}`);
        }
        console.log("Parsing symptoms JSON...");
        const symptomsData = await symptomsRes.json();
        console.log(`Loaded ${Object.keys(symptomsData).length} symptoms`);

        setSymptoms(symptomsData);
        setLoading(false);
        console.log("Data load complete!");
      } catch (err) {
        console.error("Data load error:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
      }
    }

    // Load recent symptoms from sessionStorage
    const stored = sessionStorage.getItem("recentSymptoms");
    if (stored) {
      try {
        setRecentSymptoms(JSON.parse(stored));
      } catch {
        // ignore
      }
    }

    loadData();
  }, []);

  // Save recent symptoms to sessionStorage
  useEffect(() => {
    if (recentSymptoms.length > 0) {
      sessionStorage.setItem("recentSymptoms", JSON.stringify(recentSymptoms));
    }
  }, [recentSymptoms]);

  // Search symptoms
  const searchSymptoms = useCallback(
    (query: string, limit: number = 50): string[] => {
      console.log(`searchSymptoms called: query="${query}", symptoms loaded: ${!!symptoms}`);
      if (!symptoms || !query.trim()) {
        console.log("Returning empty - no symptoms or empty query");
        return [];
      }

      const q = query.toLowerCase();
      const allSymptomNames = Object.keys(symptoms);
      console.log(`Searching ${allSymptomNames.length} symptoms for "${q}"`);
      const matches: string[] = [];

      // First: recent symptoms that match
      const recentMatches = recentSymptoms.filter(
        (s) =>
          s.toLowerCase().includes(q) && !selectedSymptoms.includes(s)
      );

      // Then: other symptoms that match
      for (const symptom of allSymptomNames) {
        if (matches.length + recentMatches.length >= limit) break;
        if (
          symptom.toLowerCase().includes(q) &&
          !selectedSymptoms.includes(symptom) &&
          !recentMatches.includes(symptom)
        ) {
          matches.push(symptom);
        }
      }

      const result = [...recentMatches, ...matches];
      console.log(`Found ${result.length} matches`);
      return result;
    },
    [symptoms, selectedSymptoms, recentSymptoms]
  );

  // Add symptom
  const addSymptom = useCallback((symptom: string) => {
    setSelectedSymptoms((prev) => {
      if (prev.includes(symptom)) return prev;
      return [...prev, symptom];
    });
    // Add to recent if not already there
    setRecentSymptoms((prev) => {
      if (prev.includes(symptom)) return prev;
      return [symptom, ...prev].slice(0, 20); // keep last 20
    });
  }, []);

  // Remove symptom
  const removeSymptom = useCallback((symptom: string) => {
    setSelectedSymptoms((prev) => prev.filter((s) => s !== symptom));
  }, []);

  // Clear all symptoms
  const clearSymptoms = useCallback(() => {
    setSelectedSymptoms([]);
  }, []);

  // Repertorize: find remedies in intersection
  const results = useMemo((): RepertoResult[] => {
    if (!symptoms || !remedies || selectedSymptoms.length === 0) {
      return [];
    }

    // Gather remedy scores per symptom
    const remedyScores: {
      [abbrev: string]: { total: number; breakdown: { [s: string]: number } };
    } = {};
    const remedyPresence: { [abbrev: string]: Set<string> } = {};

    for (const symptom of selectedSymptoms) {
      const symptomData = symptoms[symptom];
      if (!symptomData) continue;

      for (const [abbrev, weight] of Object.entries(symptomData.remedies)) {
        if (!remedyScores[abbrev]) {
          remedyScores[abbrev] = { total: 0, breakdown: {} };
          remedyPresence[abbrev] = new Set();
        }
        remedyScores[abbrev].total += weight;
        remedyScores[abbrev].breakdown[symptom] = weight;
        remedyPresence[abbrev].add(symptom);
      }
    }

    // Filter to only remedies present in ALL symptoms
    const numSymptoms = selectedSymptoms.length;
    const resultsArr: RepertoResult[] = [];

    for (const [abbrev, scores] of Object.entries(remedyScores)) {
      if (remedyPresence[abbrev].size === numSymptoms) {
        resultsArr.push({
          abbrev,
          fullName: remedies[abbrev] || abbrev,
          totalScore: scores.total,
          breakdown: scores.breakdown,
        });
      }
    }

    // Sort by total score descending
    resultsArr.sort((a, b) => b.totalScore - a.totalScore);

    return resultsArr;
  }, [symptoms, remedies, selectedSymptoms]);

  return {
    loading,
    error,
    symptoms,
    remedies,
    selectedSymptoms,
    results,
    searchSymptoms,
    addSymptom,
    removeSymptom,
    clearSymptoms,
    symptomCount: symptoms ? Object.keys(symptoms).length : 0,
    remedyCount: remedies ? Object.keys(remedies).length : 0,
  };
}
