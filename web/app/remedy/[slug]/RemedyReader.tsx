"use client";
import { dataUrl } from "../../dataUrl";

import { useState, useEffect, useRef, useMemo } from "react";

// ---------- types ----------
interface PassageEntry {
  keywords: string[];
  passage: string;
}
interface MateriaProfile {
  remedy: string;
  file: string;
  abbreviations: string[];
}

// ---------- markdown cleanup ----------
function cleanMarkdown(raw: string): string {
  // Split on double newlines to get major blocks (around headings)
  const blocks = raw.split(/\n\n+/);
  const cleaned: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#") || trimmed.startsWith(">")) {
      // Headings and blockquotes: preserve as-is
      cleaned.push(trimmed);
    } else {
      // The actual markdown files use single newlines between paragraphs.
      // Detect paragraph breaks: a line ending with terminal punctuation
      // followed by a line starting with a capital letter is a paragraph break.
      // Lines ending mid-sentence are continuations and get joined.
      const lines = trimmed.split("\n");
      const paragraphs: string[] = [];
      let current: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        current.push(line);

        if (i < lines.length - 1) {
          const nextLine = lines[i + 1].trim();
          const endsWithTerminal = /[.!?"\u201d)']$/.test(line);
          const nextStartsNewSentence = /^[A-Z\u201c"]/.test(nextLine);

          if (endsWithTerminal && nextStartsNewSentence) {
            // Paragraph boundary: flush current lines as one paragraph
            paragraphs.push(current.join(" ").replace(/\s+/g, " "));
            current = [];
          }
        }
      }

      // Flush remaining lines
      if (current.length > 0) {
        paragraphs.push(current.join(" ").replace(/\s+/g, " "));
      }

      cleaned.push(paragraphs.join("\n\n"));
    }
  }

  let result = cleaned.join("\n\n");

  // Strip markdown emphasis markers so passage matching works
  // (passage_index.json stores plain text without formatting)
  result = result.replace(/\*\*(.+?)\*\*/g, "$1"); // **bold** -> bold
  result = result.replace(/\*(.+?)\*/g, "$1"); // *italic* -> italic

  return result;
}

// ---------- render markdown to React elements ----------
function renderMarkdown(
  text: string,
  highlightRanges: Array<{ start: number; end: number; primary: boolean }>
): React.ReactNode[] {
  const cleaned = cleanMarkdown(text);
  const paragraphs = cleaned.split(/\n{2,}/);
  const elements: React.ReactNode[] = [];

  let charOffset = 0;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi].trim();
    if (!para) {
      charOffset += 2;
      continue;
    }

    const paraStart = cleaned.indexOf(para, charOffset);
    const paraEnd = paraStart + para.length;
    charOffset = paraEnd;

    const overlapping = highlightRanges.filter(
      (r) => r.start < paraEnd && r.end > paraStart
    );

    const isH1 = para.startsWith("# ");
    const isH2 = para.startsWith("## ");
    const isQuote = para.startsWith('"') || para.startsWith('\u201c');

    const content = isH1 ? para.slice(2) : isH2 ? para.slice(3) : para;

    let rendered: React.ReactNode;

    if (overlapping.length > 0) {
      rendered = highlightText(
        content,
        paraStart + (isH1 ? 2 : isH2 ? 3 : 0),
        overlapping
      );
    } else {
      rendered = content;
    }

    if (isH1) {
      elements.push(
        <h1
          key={pi}
          className="text-3xl font-bold text-[#065774] mt-10 mb-4 font-serif"
        >
          {rendered}
        </h1>
      );
    } else if (isH2) {
      elements.push(
        <h2
          key={pi}
          className="text-xl font-semibold text-[#065774] mt-8 mb-3 font-serif border-b border-[#D3DCDE] pb-2"
        >
          {rendered}
        </h2>
      );
    } else if (isQuote) {
      elements.push(
        <blockquote
          key={pi}
          className="border-l-4 border-[#EF9B0C] pl-4 my-4 italic text-[#374151]"
        >
          {rendered}
        </blockquote>
      );
    } else {
      elements.push(
        <p key={pi} className="my-3 leading-[1.8]">
          {rendered}
        </p>
      );
    }
  }

  return elements;
}

function highlightText(
  text: string,
  textGlobalStart: number,
  ranges: Array<{ start: number; end: number; primary: boolean }>
): React.ReactNode {
  const localRanges = ranges
    .map((r) => ({
      start: Math.max(0, r.start - textGlobalStart),
      end: Math.min(text.length, r.end - textGlobalStart),
      primary: r.primary,
    }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start);

  if (localRanges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let pos = 0;

  for (let i = 0; i < localRanges.length; i++) {
    const r = localRanges[i];
    if (pos < r.start) {
      parts.push(text.slice(pos, r.start));
    }
    parts.push(
      <mark
        key={i}
        data-highlight={r.primary ? "primary" : "secondary"}
        className={
          r.primary
            ? "bg-[#EF9B0C]/30 rounded px-0.5 ring-2 ring-[#EF9B0C]/50"
            : "bg-yellow-100 rounded px-0.5"
        }
      >
        {text.slice(r.start, r.end)}
      </mark>
    );
    pos = r.end;
  }

  if (pos < text.length) {
    parts.push(text.slice(pos));
  }

  return <>{parts}</>;
}

// ---------- passage matching (mirrors MateriaPanel logic) ----------
function extractSearchTerms(symptom: string): string[] {
  const parts = symptom.split(",").map((s) => s.trim().toLowerCase());
  return parts
    .filter((p) => p.length > 2)
    .flatMap((p) => p.replace(/[()]/g, "").split(/\s+/))
    .filter(
      (w) =>
        w.length > 3 && !["with", "from", "morbid", "desire"].includes(w)
    );
}

function matchPassages(
  passages: PassageEntry[],
  symptoms: string[]
): Record<string, string> {
  const results: Record<string, string> = {};
  for (const sym of symptoms) {
    const searchTerms = extractSearchTerms(sym);
    if (searchTerms.length === 0) continue;
    let bestPassage = "";
    let bestScore = 0;
    for (const p of passages) {
      if (!p.keywords || !p.passage) continue;
      const kwStr = p.keywords.join(" ").toLowerCase();
      const passageLower = p.passage.toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (kwStr.includes(term)) score += 2;
        if (passageLower.includes(term)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestPassage = p.passage;
      }
    }
    if (bestScore >= 2 && bestPassage) {
      results[sym] = bestPassage;
    }
  }
  return results;
}

// ---------- main component ----------
export default function RemedyReader({ slug }: { slug: string }) {
  // Read query params on the client side (static export can't use searchParams)
  const [symptomsParam, setSymptomsParam] = useState("");
  const [highlightParam, setHighlightParam] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setSymptomsParam(sp.get("symptoms") || "");
    setHighlightParam(sp.get("highlight") || "");
  }, []);

  const symptoms = useMemo(
    () =>
      symptomsParam
        ? symptomsParam.split("|").filter((s) => s.length > 0)
        : [],
    [symptomsParam]
  );

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [profile, setProfile] = useState<MateriaProfile | null>(null);
  const [matchedPassages, setMatchedPassages] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [profilesRes, passagesRes] = await Promise.all([
          fetch(dataUrl("data/kent/profiles.json")),
          fetch(dataUrl("data/kent/passage_index.json")),
        ]);

        if (!profilesRes.ok) throw new Error("Failed to load profiles");

        const profiles = (await profilesRes.json()) as Record<
          string,
          MateriaProfile
        >;
        const passageIndex = passagesRes.ok
          ? ((await passagesRes.json()) as Record<string, PassageEntry[]>)
          : {};

        if (cancelled) return;

        const prof = Object.values(profiles).find(
          (p) => p.file === slug + ".md"
        );

        if (!prof) {
          setError("Remedy not found");
          setLoading(false);
          return;
        }

        setProfile(prof);

        const abbrevKey = Object.keys(profiles).find(
          (k) => profiles[k].file === prof.file
        );

        if (abbrevKey && symptoms.length > 0) {
          const remedyPassages = passageIndex[abbrevKey] ?? [];
          const matched = matchPassages(remedyPassages, symptoms);
          setMatchedPassages(matched);
        }

        const mdRes = await fetch(
          dataUrl(`data/kent/remedy_markdown/${prof.file}`)
        );
        if (!mdRes.ok) throw new Error("Failed to load remedy text");

        if (cancelled) return;

        const mdText = await mdRes.text();
        setMarkdown(mdText);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load"
          );
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, symptomsParam]);

  const { elements, primaryRef } = useMemo(() => {
    if (!markdown) return { elements: [], primaryRef: null as string | null };

    const cleaned = cleanMarkdown(markdown);
    const cleanedLower = cleaned.toLowerCase();

    // Normalize whitespace for fuzzy matching: collapse all runs of whitespace to single space
    function normalizeWS(s: string): string {
      return s.replace(/\s+/g, " ").trim();
    }

    // Find a passage in the cleaned text using normalized whitespace matching
    // Returns { start, end } in the original cleaned text, or null
    function findPassageRange(passage: string): { start: number; end: number } | null {
      const passageLower = passage.toLowerCase();
      // Try exact match first
      let idx = cleanedLower.indexOf(passageLower);
      if (idx !== -1) return { start: idx, end: idx + passage.length };

      // Try normalized whitespace match
      const normPassage = normalizeWS(passageLower);
      const normCleaned = normalizeWS(cleanedLower);
      const normIdx = normCleaned.indexOf(normPassage);
      if (normIdx === -1) return null;

      // Map normalized position back to original cleaned text position
      // Walk through cleaned text, tracking normalized position
      let origPos = 0;
      let normPos = 0;
      let matchStart = -1;
      let inWhitespace = false;

      // Skip leading whitespace in cleaned text
      while (origPos < cleaned.length && normPos < normIdx) {
        const ch = cleanedLower[origPos];
        if (/\s/.test(ch)) {
          if (!inWhitespace) {
            normPos++; // collapsed whitespace = one space in normalized
            inWhitespace = true;
          }
          origPos++;
        } else {
          normPos++;
          inWhitespace = false;
          origPos++;
        }
      }
      // Skip any whitespace at match boundary
      while (origPos < cleaned.length && /\s/.test(cleanedLower[origPos])) origPos++;
      matchStart = origPos;

      // Now find the end
      const normMatchEnd = normIdx + normPassage.length;
      while (origPos < cleaned.length && normPos < normMatchEnd) {
        const ch = cleanedLower[origPos];
        if (/\s/.test(ch)) {
          if (!inWhitespace) {
            normPos++;
            inWhitespace = true;
          }
          origPos++;
        } else {
          normPos++;
          inWhitespace = false;
          origPos++;
        }
      }

      if (matchStart >= 0) return { start: matchStart, end: origPos };
      return null;
    }

    const allPassages = Object.entries(matchedPassages);
    const rangesRaw: Array<{
      start: number;
      end: number;
      primary: boolean;
    }> = [];

    let primaryPassage: string | null = null;

    for (const [, passage] of allPassages) {
      if (!passage) continue;
      const isPrimary = passage === highlightParam;
      if (isPrimary) primaryPassage = passage;

      const range = findPassageRange(passage);
      if (range) {
        rangesRaw.push({ ...range, primary: isPrimary });
      }
    }

    if (highlightParam && !primaryPassage) {
      const range = findPassageRange(highlightParam);
      if (range) {
        rangesRaw.push({ ...range, primary: true });
        primaryPassage = highlightParam;
      }
    }

    // Deduplicate and merge overlapping ranges.
    // Multiple symptoms can match the same passage text, creating duplicate ranges.
    // Merge overlapping ranges, preserving primary status if any overlap is primary.
    const sorted = rangesRaw.sort((a, b) => a.start - b.start || a.end - b.end);
    const ranges: typeof rangesRaw = [];
    for (const r of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && r.start < last.end) {
        // Overlapping -- merge, keep the wider range and preserve primary
        last.end = Math.max(last.end, r.end);
        if (r.primary) last.primary = true;
      } else {
        ranges.push({ ...r });
      }
    }

    return {
      elements: renderMarkdown(markdown, ranges),
      primaryRef: primaryPassage,
    };
  }, [markdown, matchedPassages, highlightParam]);

  useEffect(() => {
    if (scrolledRef.current || !primaryRef || loading) return;
    scrolledRef.current = true;

    const timer = setTimeout(() => {
      const el = document.querySelector('[data-highlight="primary"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [primaryRef, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-lg loading-pulse">
          Loading remedy text...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
          <div className="text-4xl mb-4">&#x1F4D6;</div>
          <p className="text-[#374151] text-lg">{error}</p>
          <a
            href="/"
            className="mt-4 inline-block text-[#065774] hover:underline"
          >
            &larr; Back to Homeo-Magic
          </a>
        </div>
      </div>
    );
  }

  const matchCount = Object.values(matchedPassages).filter(Boolean).length;

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <nav className="flex items-center gap-4 mb-6 text-white">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-white/85 hover:text-white no-underline text-sm transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Homeo-Magic
        </a>
      </nav>

      <article className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] overflow-hidden">
        <header
          className="px-8 py-6 text-white"
          style={{
            background:
              "linear-gradient(135deg, #065774 0%, #042B58 100%)",
          }}
        >
          <h1 className="text-3xl font-bold font-serif">
            {profile?.remedy}
          </h1>
          <p className="mt-1 text-white/70 text-sm">
            Kent&apos;s Lectures on Homeopathic Materia Medica
          </p>
        </header>

        {symptoms.length > 0 && matchCount > 0 && (
          <div className="px-8 py-4 bg-[#fefce8] border-b border-[#fde68a]">
            <div className="text-sm font-semibold text-[#92400e] mb-2">
              {matchCount} matching passage{matchCount !== 1 ? "s" : ""}{" "}
              highlighted for your symptoms:
            </div>
            <div className="flex flex-wrap gap-2">
              {symptoms.map((sym) => {
                const hasMatch = !!matchedPassages[sym];
                return (
                  <span
                    key={sym}
                    className={`text-xs px-2.5 py-1 rounded-full ${
                      hasMatch
                        ? "bg-[#EF9B0C]/20 text-[#92400e] font-medium"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {sym}
                    {hasMatch ? " \u2713" : ""}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-8 py-6 text-[#1f2937] text-[16px] leading-[1.8] font-serif remedy-text">
          {elements}
        </div>
      </article>
    </div>
  );
}
