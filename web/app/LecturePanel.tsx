"use client";
import { dataUrl } from "./dataUrl";
import { useState, useEffect, useMemo, useRef } from "react";
import type { ProfilesData } from "./types";
import { cleanMarkdown, findPassageRange } from "./remedy/[slug]/RemedyReader";

let cachedProfiles: ProfilesData | null = null;
let cachedPassageIndex: Record<string, Array<{ keywords: string[]; passage: string }>> | null = null;

async function loadData() {
  if (cachedProfiles && cachedPassageIndex) {
    return { profiles: cachedProfiles, passageIndex: cachedPassageIndex };
  }
  const [profilesRes, passagesRes] = await Promise.all([
    fetch(dataUrl("data/kent/profiles.json")),
    fetch(dataUrl("data/kent/passage_index.json")),
  ]);
  const profiles = profilesRes.ok ? ((await profilesRes.json()) as ProfilesData) : null;
  const passageIndex = passagesRes.ok ? await passagesRes.json() : null;
  if (profiles) cachedProfiles = profiles;
  if (passageIndex) cachedPassageIndex = passageIndex;
  return { profiles, passageIndex };
}

function matchPassages(
  passages: Array<{ keywords: string[]; passage: string }>,
  rubrics: string[]
): Record<string, string> {
  const results: Record<string, string> = {};
  for (const sym of rubrics) {
    const parts = sym.split(",").map((s) => s.trim().toLowerCase());
    const searchTerms = parts
      .filter((p) => p.length > 2)
      .flatMap((p) => p.replace(/[()]/g, "").split(/\s+/))
      .filter((w) => w.length > 3 && !["with", "from", "morbid", "desire"].includes(w));
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
    if (!para) { charOffset += 2; continue; }

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
      rendered = highlightText(content, paraStart + (isH1 ? 2 : isH2 ? 3 : 0), overlapping);
    } else {
      rendered = content;
    }

    if (isH1) {
      elements.push(<h1 key={pi} className="text-2xl font-bold text-[#065774] mt-8 mb-3 font-serif">{rendered}</h1>);
    } else if (isH2) {
      elements.push(<h2 key={pi} className="text-lg font-semibold text-[#065774] mt-6 mb-2 font-serif border-b border-[#D3DCDE] pb-2">{rendered}</h2>);
    } else if (isQuote) {
      elements.push(<blockquote key={pi} className="border-l-4 border-[#EF9B0C] pl-4 my-3 italic text-[#374151]">{rendered}</blockquote>);
    } else {
      elements.push(<p key={pi} className="my-2 leading-[1.7]">{rendered}</p>);
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
    if (pos < r.start) parts.push(text.slice(pos, r.start));
    parts.push(
      <mark
        key={i}
        data-highlight={r.primary ? "primary" : "secondary"}
        className={r.primary
          ? "bg-[#EF9B0C]/30 rounded px-0.5 ring-2 ring-[#EF9B0C]/50"
          : "bg-yellow-100 rounded px-0.5"
        }
      >
        {text.slice(r.start, r.end)}
      </mark>
    );
    pos = r.end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

export function LecturePanel({
  remedyAbbrev,
  selectedRubrics,
  highlightPassage,
}: {
  remedyAbbrev: string;
  selectedRubrics: string[];
  highlightPassage?: string;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [matchedPassages, setMatchedPassages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [remedyName, setRemedyName] = useState("");
  const scrolledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMarkdown(null);
    setMatchedPassages({});
    setRemedyName("");
    scrolledRef.current = false;

    loadData().then(async ({ profiles, passageIndex }) => {
      if (cancelled) return;
      if (!profiles || !profiles[remedyAbbrev]) {
        setLoading(false);
        return;
      }
      const prof = profiles[remedyAbbrev];
      setRemedyName(prof.remedy);

      // Match passages
      const remedyPassages = passageIndex?.[remedyAbbrev] ?? [];
      const matched = matchPassages(remedyPassages, selectedRubrics);
      setMatchedPassages(matched);

      // Load markdown
      const mdRes = await fetch(dataUrl(`data/kent/remedy_markdown/${prof.file}`));
      if (!mdRes.ok || cancelled) { setLoading(false); return; }
      const mdText = await mdRes.text();
      if (cancelled) return;
      setMarkdown(mdText);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [remedyAbbrev]);

  const { elements, primaryRef } = useMemo(() => {
    if (!markdown) return { elements: [], primaryRef: null as string | null };

    const cleaned = cleanMarkdown(markdown);
    const allPassages = Object.entries(matchedPassages);
    const rangesRaw: Array<{ start: number; end: number; primary: boolean }> = [];
    let primaryPassage: string | null = null;

    for (const [, passage] of allPassages) {
      if (!passage) continue;
      const isPrimary = passage === highlightPassage;
      if (isPrimary) primaryPassage = passage;
      const range = findPassageRange(passage, cleaned);
      if (range) rangesRaw.push({ ...range, primary: isPrimary });
    }

    if (highlightPassage && !primaryPassage) {
      const range = findPassageRange(highlightPassage, cleaned);
      if (range) {
        rangesRaw.push({ ...range, primary: true });
        primaryPassage = highlightPassage;
      }
    }

    // Merge overlapping ranges
    const sorted = rangesRaw.sort((a, b) => a.start - b.start || a.end - b.end);
    const ranges: typeof rangesRaw = [];
    for (const r of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && r.start < last.end) {
        last.end = Math.max(last.end, r.end);
        if (r.primary) last.primary = true;
      } else {
        ranges.push({ ...r });
      }
    }

    return { elements: renderMarkdown(markdown, ranges), primaryRef: primaryPassage };
  }, [markdown, matchedPassages, highlightPassage]);

  // Scroll to highlighted passage within the panel
  useEffect(() => {
    if (!highlightPassage || loading) return;
    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector('[data-highlight="primary"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightPassage, loading]);

  if (loading) {
    return (
      <div className="py-12 text-center text-[#6b7280] text-sm loading-pulse">
        Loading lecture text...
      </div>
    );
  }

  if (!markdown) {
    return (
      <div className="p-5">
        {/* Spacer matching remedy panel: name (text-2xl mb-2) + abbreviation (text-sm mb-4) */}
        <div className="text-2xl font-bold mb-2 invisible">&#8203;</div>
        <div className="text-sm mb-4 invisible">&#8203;</div>
        <div className="py-16 px-6 text-center text-[#6b7280]">
          <p className="text-sm font-medium mb-1">No lecture available</p>
          <p className="text-xs">
            Kent&apos;s Materia Medica does not include a lecture for this remedy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-y-auto px-5 py-4 text-[14px] leading-[1.7] text-[#1f2937] font-serif remedy-text" style={{ maxHeight: "calc(100vh - 160px)" }}>
      <h2 className="text-xl font-bold text-[#065774] mb-1 font-serif">{remedyName}</h2>
      <p className="text-xs text-[#6b7280] mb-4">Kent&apos;s Lectures on Homeopathic Materia Medica</p>
      {elements}
    </div>
  );
}
