"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRepertorize } from "./useRepertorize";
import chroma from "chroma-js";
import { MateriaPanel } from "./MateriaPanel";

// Color scale for score heat-mapping
const defaultScale = () => chroma.scale(["#fef3c7", "#fca5a5"]).mode("lab");

function useColorScale() {
  const [scaleRef, setScaleRef] = useState<{ fn: ReturnType<typeof chroma.scale>; colors?: string[] }>(() => ({ fn: defaultScale() }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem("homeo-magic-color-scale");
      if (!raw) return;
      const data = JSON.parse(raw);
      const scale = data.scale;
      if (Array.isArray(scale) && scale.length >= 3) {
        setScaleRef({ fn: chroma.scale(scale).mode(data.mode || "lab"), colors: scale });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!scaleRef.colors) return;
    let styleEl = document.getElementById("dynamic-grade-styles");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-grade-styles";
      document.head.appendChild(styleEl);
    }
    let css = "";
    for (let i = 0; i < scaleRef.colors.length; i++) {
      const bg = scaleRef.colors[i];
      const fg = getTextColor(bg);
      css += `.grade-${i + 1} { background: ${bg} !important; color: ${fg} !important; }\n`;
    }
    styleEl.textContent = css;
  }, [scaleRef]);

  const getScoreColor = useCallback(
    (t: number) => scaleRef.fn(t).hex(),
    [scaleRef]
  );

  return { getScoreColor };
}

function getTextColor(bgHex: string): string {
  const [r, g, b] = chroma(bgHex).rgb();
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#1f2937" : "#ffffff";
}

export default function Home() {
  const {
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
    reorderSymptoms,
    symptomCount,
    remedyCount,
  } = useRepertorize();

  const dragRef = useRef<{ index: number } | null>(null);
  const [symColWidth, setSymColWidth] = useState(420);
  const [hoveredRemedy, setHoveredRemedy] = useState<string | null>(null);
  const [hoveredSymRow, setHoveredSymRow] = useState<string | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [detailPanel, setDetailPanel] = useState<{
    type: "remedy" | "symptom";
    name: string;
  } | null>(null);

  // Auto-select top remedy when results first appear
  useEffect(() => {
    if (results.items.length > 0 && !detailPanel) {
      setDetailPanel({ type: "remedy", name: results.items[0].abbrev });
    }
  }, [results.items.length > 0]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { getScoreColor } = useColorScale();

  const suggestions = useMemo(() => {
    if (query.trim().length < 2) return [];
    return searchSymptoms(query, 50);
  }, [query, searchSymptoms]);
  const showDropdown = dropdownOpen && suggestions.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === "Escape") setDropdownOpen(false);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((p) =>
          p < suggestions.length - 1 ? p + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((p) =>
          p > 0 ? p - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) handleSelectSuggestion(suggestions[highlightedIndex]);
        break;
      case "Escape":
        setDropdownOpen(false);
        break;
    }
  }

  function handleSelectSuggestion(symptom: string) {
    addSymptom(symptom);
    setQuery("");
    setDropdownOpen(false);
    inputRef.current?.focus();
  }

  // Filter and limit results
  const filtered = results.items.filter((r) => r.totalScore >= minScore);
  const displayed = filtered.slice(0, 40);
  const visibleSymptoms = selectedSymptoms.filter(
    (s) => !hiddenSymptoms.has(s)
  );
  const hiddenList = selectedSymptoms.filter((s) => hiddenSymptoms.has(s));

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="text-center mb-6 text-white">
        <h1 className="text-4xl font-bold" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.2)" }}>
          Homeo-Magic
        </h1>
        <p className="mt-2 text-[0.95rem] opacity-90">
          {loading ? (
            <span className="loading-pulse">{loadProgress.message}</span>
          ) : error ? (
            <span style={{ color: "#fca5a5" }}>Error: {error}</span>
          ) : (
            <>
              {symptomCount.toLocaleString()} symptoms &bull;{" "}
              {remedyCount.toLocaleString()} remedies
            </>
          )}
        </p>
        {loadProgress.phase === "symptoms" && loadProgress.percent > 0 && (
          <div className="mt-2 inline-flex items-center gap-2">
            <div className="w-[100px] h-2 bg-[#D3DCDE] rounded overflow-hidden">
              <div
                className="h-full bg-[#EF9B0C] transition-all"
                style={{ width: `${loadProgress.percent}%` }}
              />
            </div>
            <span className="text-sm">{loadProgress.percent}%</span>
          </div>
        )}
        <div className="mt-2">
          <a
            href="settings.html"
            className="inline-flex items-center gap-1 text-[13px] text-white/85 hover:text-white no-underline transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Color Settings
          </a>
        </div>
      </header>

      {/* Search */}
      <div className="bg-white rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.2)] mb-5">
        <label htmlFor="search" className="block font-semibold text-[#065774] mb-2">
          Add symptoms:
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id="search"
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setDropdownOpen(true); }}
            placeholder="Type to search (e.g., headache, anxiety, burning)..."
            className="w-full px-[18px] py-[14px] text-base border-2 border-[#D3DCDE] rounded-[10px] outline-none transition-all font-inherit focus:border-[#EF9B0C] focus:shadow-[0_0_0_3px_rgba(239,155,12,0.2)] disabled:bg-[#eef1f2] disabled:cursor-not-allowed"
            autoComplete="off"
            disabled={loading}
          />
          {showDropdown && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-[100] top-full left-0 right-0 bg-white border-2 border-[#EF9B0C] rounded-[10px] mt-1 max-h-[300px] overflow-y-auto shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
            >
              {suggestions.map((symptom, idx) => (
                <button
                  key={symptom}
                  ref={idx === highlightedIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onClick={() => handleSelectSuggestion(symptom)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-4 py-3 text-sm cursor-pointer border-b border-[#e4e9eb] last:border-b-0 transition-colors ${
                    idx === highlightedIndex ? "bg-[#eef1f2]" : "hover:bg-[#eef1f2]"
                  }`}
                >
                  <HighlightMatch text={symptom} query={query} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected symptoms tags */}
      {selectedSymptoms.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 items-center">
          {visibleSymptoms.map((s) => (
            <span
              key={s}
              className="animate-fade-in inline-flex items-center gap-1.5 bg-white text-[#065774] px-3.5 py-2 rounded-full text-[13px] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              {s}
              <button
                onClick={() => removeSymptom(s)}
                className="bg-[#065774] text-white border-none w-[18px] h-[18px] rounded-full text-sm flex items-center justify-center cursor-pointer hover:bg-[#042B58]"
              >
                &times;
              </button>
            </span>
          ))}
          {hiddenList.length > 0 && (
            <>
              <span className="text-[#d1d5db] text-xl mx-1">|</span>
              {hiddenList.map((s) => (
                <span
                  key={s}
                  onClick={() => showSymptom(s)}
                  className="animate-fade-in inline-flex items-center gap-1.5 bg-[#f3f4f6] text-[#6b7280] px-3.5 py-2 rounded-full text-[13px] font-medium opacity-70 cursor-pointer line-through decoration-[#9ca3af] hover:opacity-100 hover:bg-[#e5e7eb]"
                >
                  {s}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSymptom(s); }}
                    className="bg-[#065774] text-white border-none w-[18px] h-[18px] rounded-full text-sm flex items-center justify-center cursor-pointer hover:bg-[#042B58]"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] overflow-hidden">
        {selectedSymptoms.length === 0 ? (
          <div className="py-16 px-5 text-center text-[#6b7280]">
            <div className="text-5xl mb-4">&#x1F50D;</div>
            <p>Search and select symptoms above to find matching remedies</p>
          </div>
        ) : visibleSymptoms.length === 0 ? (
          <div className="py-16 px-5 text-center text-[#6b7280]">
            <p>
              All {selectedSymptoms.length} symptoms are hidden. Click a hidden
              symptom above to show it.
            </p>
          </div>
        ) : results.items.length === 0 ? (
          <div className="py-16 px-5 text-center text-[#6b7280]">
            <p>No remedies found for these symptoms</p>
          </div>
        ) : (
          <>
            <div
              className="px-5 py-4 font-semibold text-white"
              style={{
                background:
                  "linear-gradient(135deg, #065774 0%, #042B58 100%)",
              }}
            >
              {results.totalCount} Remedies Found
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-4 px-5 py-3 bg-[#eef1f2] border-b border-[#D3DCDE] flex-wrap">
              <label className="font-medium text-[#065774] text-[13px]">
                Min score:
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value))}
                className="score-slider w-[150px]"
                style={{
                  direction: "rtl",
                  background: `linear-gradient(to right, ${getScoreColor(minScore / 100)} ${100 - minScore}%, #D3DCDE ${100 - minScore}%)`,
                }}
              />
              <span
                className="font-bold min-w-[35px] text-center text-sm px-2 py-0.5 rounded"
                style={{
                  background: getScoreColor(minScore / 100),
                  color: getTextColor(getScoreColor(minScore / 100)),
                }}
              >
                {minScore}
              </span>
              {minScore > 0 && (
                <button
                  onClick={() => setMinScore(0)}
                  className="px-3 py-1.5 bg-[#D3DCDE] text-[#065774] border-none rounded-md text-xs font-medium cursor-pointer hover:bg-[#c5cdd0]"
                >
                  Reset
                </button>
              )}
              <span className="text-xs text-[#6b7280] ml-auto">
                Showing {displayed.length} of {filtered.length} remedies
                (&ge;{minScore})
                {filtered.length > displayed.length &&
                  ` \u2022 ${filtered.length - displayed.length} more below`}
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th
                      className="text-left bg-[#e4e9eb] px-2 py-2.5 font-semibold text-[#065774] sticky top-0 z-10 border-b border-[#e4e9eb] relative"
                      style={{ width: symColWidth, minWidth: 420, maxWidth: 800 }}
                    >
                      Analysis
                      <span
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#EF9B0C] transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          resizeRef.current = { startX: e.clientX, startWidth: symColWidth };
                          const onMove = (ev: MouseEvent) => {
                            if (!resizeRef.current) return;
                            const diff = ev.clientX - resizeRef.current.startX;
                            const newWidth = Math.max(200, Math.min(800, resizeRef.current.startWidth + diff));
                            setSymColWidth(newWidth);
                          };
                          const onUp = () => {
                            resizeRef.current = null;
                            document.removeEventListener("mousemove", onMove);
                            document.removeEventListener("mouseup", onUp);
                          };
                          document.addEventListener("mousemove", onMove);
                          document.addEventListener("mouseup", onUp);
                        }}
                      />
                    </th>
                    {displayed.map((r) => (
                      <th
                        key={r.abbrev}
                        onClick={() =>
                          setDetailPanel({ type: "remedy", name: r.abbrev })
                        }
                        onMouseEnter={() => setHoveredRemedy(r.abbrev)}
                        onMouseLeave={() => setHoveredRemedy(null)}
                        className="relative bg-[#f3f6f7] px-2 pt-2.5 pb-[10px] font-semibold text-[#065774] sticky top-0 z-10 border-b border-[#e4e9eb] text-center cursor-pointer hover:bg-[#e9eef0] transition-colors"
                        style={{
                          writingMode: "vertical-rl",
                          textOrientation: "mixed",
                          transform: "rotate(180deg)",
                          height: "100px",
                          verticalAlign: "bottom",
                          fontSize: "16px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.abbrev}
                        {hoveredRemedy === r.abbrev && (
                          <span
                            className="pointer-events-none absolute z-20 left-1/2 top-[calc(100%+6px)] -translate-x-1/2 rotate-180 whitespace-nowrap bg-[#EF9B0C] text-white text-xs font-normal px-3 py-1.5 rounded-md shadow-lg"
                            style={{ writingMode: "horizontal-tb", textOrientation: "initial" }}
                          >
                            {remedies?.[r.abbrev] || r.abbrev}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Score row */}
                  <tr>
                    <td className="text-left px-2 py-2.5 font-semibold border-b-2 border-[#D3DCDE]" style={{ background: "linear-gradient(180deg, #f3f6f7 0%, #e9eef0 100%)" }}>
                      Score
                    </td>
                    {displayed.map((r) => {
                      const bg = getScoreColor(r.totalScore / 100);
                      const fg = getTextColor(bg);
                      return (
                        <td
                          key={r.abbrev}
                          onClick={() => setMinScore(r.totalScore)}
                          className="text-center px-2 py-2.5 font-bold text-sm border-b-2 border-[#D3DCDE] cursor-pointer transition-all hover:scale-110"
                          style={{ background: bg, color: fg }}
                          title={`Click to set minimum score to ${r.totalScore}`}
                        >
                          {r.totalScore}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Symptom rows */}
                  {visibleSymptoms.map((sym) => {
                    const symData = symptoms?.[sym];
                    const symCount = symData
                      ? Object.keys(symData.remedies).length
                      : 0;
                    const symIndex = selectedSymptoms.indexOf(sym);
                    return (
                      <tr
                        key={sym}
                        draggable
                        onDragStart={(e) => {
                          dragRef.current = { index: symIndex };
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragRef.current !== null) {
                            reorderSymptoms(dragRef.current.index, symIndex);
                            dragRef.current = null;
                          }
                        }}
                        onDragEnd={() => { dragRef.current = null; }}
                        onMouseEnter={() => setHoveredSymRow(sym)}
                        onMouseLeave={() => setHoveredSymRow(null)}
                      >
                        <td
                          onClick={() =>
                            setDetailPanel({ type: "symptom", name: sym })
                          }
                          className="text-left px-2 py-2.5 border-b border-[#e4e9eb] cursor-pointer hover:bg-[#eef1f2] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="flex-shrink-0 cursor-grab text-[#9ca3af]"
                              style={{ opacity: hoveredSymRow === sym ? 1 : 0, transition: "opacity 0.15s" }}
                              title="Drag to reorder"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="4" r="2"/><circle cx="15" cy="4" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/></svg>
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                hideSymptom(sym);
                              }}
                              className="border-none w-[22px] h-[22px] rounded bg-[#e5e7eb] text-[#374151] text-xs cursor-pointer flex items-center justify-center hover:bg-[#d1d5db] flex-shrink-0"
                              style={{ opacity: hoveredSymRow === sym ? 1 : 0, transition: "opacity 0.15s" }}
                              title="Hide symptom"
                            >
                              <EyeIcon />
                            </button>
                            <span className="flex-1">{sym}</span>
                            <span className="text-[#9ca3af] text-[11px]">
                              ({symCount})
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeSymptom(sym);
                              }}
                              className="border-none w-[22px] h-[22px] rounded bg-[#D3DCDE] text-[#065774] text-xs cursor-pointer flex items-center justify-center hover:bg-[#065774] hover:text-white flex-shrink-0 ml-auto"
                              style={{ opacity: hoveredSymRow === sym ? 1 : 0, transition: "opacity 0.15s" }}
                              title="Remove symptom"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                        {displayed.map((r) => {
                          const grade = r.breakdown[sym];
                          return (
                            <td
                              key={r.abbrev}
                              className="text-center px-2 py-2.5 border-b border-[#e4e9eb]"
                            >
                              {grade ? (
                                <span className={`grade grade-${grade}`}>
                                  {grade}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Detail panel */}
      {detailPanel && (
        <DetailPanel
          type={detailPanel.type}
          name={detailPanel.name}
          symptoms={symptoms}
          remedies={remedies}
          selectedSymptoms={selectedSymptoms}
          onClose={() => setDetailPanel(null)}
          onShowRemedyDetail={(name) =>
            setDetailPanel({ type: "remedy", name })
          }
        />
      )}
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#fef08a] px-0.5 rounded-sm">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function DetailPanel({
  type,
  name,
  symptoms,
  remedies,
  selectedSymptoms,
  onClose,
  onShowRemedyDetail,
}: {
  type: "remedy" | "symptom";
  name: string;
  symptoms: Record<string, { remedies: Record<string, number> }> | null;
  remedies: Record<string, string> | null;
  selectedSymptoms: string[];
  onClose: () => void;
  onShowRemedyDetail: (name: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] mt-5 overflow-hidden animate-slide-up">
      <div
        className="flex justify-between items-center px-5 py-3.5 text-white font-semibold"
        style={{
          background: "linear-gradient(135deg, #065774 0%, #042B58 100%)",
        }}
      >
        <span>{type === "remedy" ? "Remedy" : "Symptom"}</span>
        <button
          onClick={onClose}
          className="bg-white/20 border-none text-white w-7 h-7 rounded-full text-lg cursor-pointer flex items-center justify-center hover:bg-white/30 transition-colors"
        >
          &times;
        </button>
      </div>
      <div className="p-5 text-[15px] leading-relaxed text-[#374151]">
        {type === "remedy" ? (
          <>
            <div className="text-2xl font-bold text-[#065774] mb-2">
              {remedies?.[name] || name}
            </div>
            <div className="text-sm text-[#6b7280] mb-4">
              Abbreviation: {name}
            </div>
            <MateriaPanel
              remedyAbbrev={name}
              selectedSymptoms={selectedSymptoms}
            />
          </>
        ) : (
          <>
            <div className="text-lg text-[#1f2937]">{name}</div>
            {symptoms?.[name] && (
              <div className="mt-4 pt-4 border-t border-[#e5e7eb] text-sm text-[#6b7280]">
                <strong>
                  {Object.keys(symptoms[name].remedies).length}
                </strong>{" "}
                remedies cover this symptom
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(symptoms[name].remedies)
                    .sort((a, b) => b[1] - a[1])
                    .map(([rem, grade]) => (
                      <span
                        key={rem}
                        onClick={() => onShowRemedyDetail(rem)}
                        className={`grade-${grade} px-2.5 py-1 rounded-xl text-xs font-medium cursor-pointer`}
                      >
                        {rem} ({grade})
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
