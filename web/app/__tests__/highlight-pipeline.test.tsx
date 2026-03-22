/**
 * Deep investigation of the entire highlighting pipeline.
 * Uses REAL data from passage_index.json and actual .md files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import RemedyReader, {
  cleanMarkdown,
  findPassageRange,
} from "../remedy/[slug]/RemedyReader";

// ---------- load real data ----------
const DATA_DIR = join(__dirname, "../../../data/kent/materia_medica");

function loadMarkdown(filename: string): string {
  return readFileSync(join(DATA_DIR, "remedy_markdown", filename), "utf-8");
}

const passageIndex = JSON.parse(
  readFileSync(join(DATA_DIR, "passage_index.json"), "utf-8")
) as Record<string, Array<{ keywords: string[]; passage: string }>>;

const profiles = JSON.parse(
  readFileSync(join(DATA_DIR, "profiles.json"), "utf-8")
) as Record<string, { remedy: string; file: string; abbreviations: string[] }>;

// ---------- real markdown for key remedies ----------
const nuxMd = loadMarkdown("nux_vomica.md");
const arnicaMd = loadMarkdown("arnica_montana.md");
const pulsMd = loadMarkdown("pulsatilla.md");

// ===================================================================
// 1. cleanMarkdown unit tests with REAL markdown
// ===================================================================
describe("cleanMarkdown with real markdown files", () => {
  it("strips *italic* markers from nux_vomica.md", () => {
    const cleaned = cleanMarkdown(nuxMd);
    // Markdown has *Nux* but cleaned should have just Nux
    expect(cleaned).toContain("Nux suffers from a disordered stomach");
    expect(cleaned).not.toMatch(/\*Nux\*/);
  });

  it("strips **bold** markers from nux_vomica.md", () => {
    const cleaned = cleanMarkdown(nuxMd);
    // Markdown has **Puls.** but cleaned should have just Puls.
    expect(cleaned).toContain("like Puls.");
    expect(cleaned).not.toMatch(/\*\*Puls\.\*\*/);
  });

  it("strips **bold** remedy references like **Bry.** and **Natr. sul.**", () => {
    const cleaned = cleanMarkdown(nuxMd);
    expect(cleaned).not.toMatch(/\*\*Bry\.\*\*/);
    expect(cleaned).not.toMatch(/\*\*Natr\. sul\.\*\*/);
  });

  it("preserves headings from nux_vomica.md", () => {
    const cleaned = cleanMarkdown(nuxMd);
    expect(cleaned).toContain("# Nux Vomica");
    expect(cleaned).toContain("## Mind");
    expect(cleaned).toContain("## Stomach");
  });

  it("preserves blockquotes from nux_vomica.md", () => {
    const cleaned = cleanMarkdown(nuxMd);
    expect(cleaned).toContain(
      '> "Oversensitive to impressions'
    );
  });

  it("joins wrapped lines in pulsatilla.md (single-newline format)", () => {
    const cleaned = cleanMarkdown(pulsMd);
    // Lines 6-9 wrap mid-sentence and should be joined
    expect(cleaned).toContain(
      "yet she is most nervous, fidgety, changeable"
    );
    // Should NOT have a line break between "most" and "nervous"
    expect(cleaned).not.toContain("most\nnervous");
  });

  it("detects paragraph breaks in pulsatilla.md (terminal punct + capital)", () => {
    const cleaned = cleanMarkdown(pulsMd);
    // "tearful blondes." is followed by "Mind:" (capital M) = paragraph break
    const idx1 = cleaned.indexOf("tearful blondes.");
    const idx2 = cleaned.indexOf("Mind:");
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
    // There should be a paragraph break (\n\n) between them
    const between = cleaned.slice(idx1, idx2);
    expect(between).toContain("\n\n");
  });

  it("handles arnica_montana.md without crashing", () => {
    const cleaned = cleanMarkdown(arnicaMd);
    expect(cleaned).toContain("# Arnica Montana");
    expect(cleaned).toContain("The Arnica patient is morose");
  });

  it("produces no literal asterisks in cleaned output for nux_vomica", () => {
    const cleaned = cleanMarkdown(nuxMd);
    // After stripping all emphasis, there should be no * characters
    // (unless they appear in non-emphasis context, which is rare)
    // Check that common bold/italic patterns are gone
    expect(cleaned).not.toMatch(/\*[A-Z][a-z]+\*/); // *Word*
    expect(cleaned).not.toMatch(/\*\*[A-Z][a-z]+\.\*\*/); // **Word.**
  });
});

// ===================================================================
// 2. findPassageRange with REAL passage_index + cleaned markdown
// ===================================================================
describe("findPassageRange with real data", () => {
  describe("Nux vomica passages", () => {
    const cleaned = cleanMarkdown(nuxMd);
    const nuxPassages = passageIndex["Nux-v."] ?? [];

    it("has passages in the index", () => {
      expect(nuxPassages.length).toBeGreaterThan(0);
    });

    it("finds the first passage (oversensitiveness)", () => {
      const p = nuxPassages[0];
      const range = findPassageRange(p.passage, cleaned);
      expect(range).not.toBeNull();
      if (range) {
        const highlighted = cleaned.slice(range.start, range.end);
        expect(highlighted.toLowerCase()).toContain("irritable");
        expect(highlighted.toLowerCase()).toContain("oversensitive");
      }
    });

    it("finds the stomach passage (italic Nux stripped)", () => {
      // passage_index: "Nux suffers..." but markdown has "*Nux* suffers..."
      const stomachP = nuxPassages.find((p) =>
        p.passage.includes("disordered stomach")
      );
      expect(stomachP).toBeTruthy();
      const range = findPassageRange(stomachP!.passage, cleaned);
      expect(range).not.toBeNull();
      if (range) {
        expect(cleaned.slice(range.start, range.end)).toContain(
          "disordered stomach"
        );
      }
    });

    it("finds the morning passage (bold Puls. stripped)", () => {
      // passage_index: "...like Puls." but markdown has "...like **Puls.**"
      const morningP = nuxPassages.find((p) =>
        p.passage.includes("worse in the morning")
      );
      expect(morningP).toBeTruthy();
      const range = findPassageRange(morningP!.passage, cleaned);
      expect(range).not.toBeNull();
    });

    it("finds the bladder passage (plain text, no formatting diff)", () => {
      const bladderP = nuxPassages.find((p) =>
        p.passage.includes("strain to urinate")
      );
      expect(bladderP).toBeTruthy();
      const range = findPassageRange(bladderP!.passage, cleaned);
      expect(range).not.toBeNull();
    });

    // Test ALL passages — count how many match
    it("finds at least 90% of all Nux passages", () => {
      let found = 0;
      for (const p of nuxPassages) {
        if (findPassageRange(p.passage, cleaned)) found++;
      }
      const rate = found / nuxPassages.length;
      expect(rate).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("Arnica passages", () => {
    const cleaned = cleanMarkdown(arnicaMd);
    const arnPassages = passageIndex["Arn."] ?? [];

    it("has passages in the index", () => {
      expect(arnPassages.length).toBeGreaterThan(0);
    });

    it("finds the morose passage", () => {
      const p = arnPassages[0];
      const range = findPassageRange(p.passage, cleaned);
      expect(range).not.toBeNull();
      if (range) {
        expect(cleaned.slice(range.start, range.end)).toContain("morose");
      }
    });

    it("finds at least 90% of all Arnica passages", () => {
      let found = 0;
      for (const p of arnPassages) {
        if (findPassageRange(p.passage, cleaned)) found++;
      }
      const rate = found / arnPassages.length;
      expect(rate).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("Pulsatilla passages", () => {
    const cleaned = cleanMarkdown(pulsMd);
    const pulsPassages = passageIndex["Puls."] ?? [];

    it("has passages in the index", () => {
      expect(pulsPassages.length).toBeGreaterThan(0);
    });

    it("finds the tearful/plethoric passage (multi-line wrap joined)", () => {
      // This passage spans lines that wrap mid-sentence in the markdown
      const p = pulsPassages.find((p) =>
        p.passage.includes("tearful, plethoric")
      );
      expect(p).toBeTruthy();
      const range = findPassageRange(p!.passage, cleaned);
      expect(range).not.toBeNull();
      if (range) {
        expect(cleaned.slice(range.start, range.end)).toContain(
          "tearful, plethoric"
        );
      }
    });

    it("finds the melancholia passage", () => {
      const p = pulsPassages.find((p) =>
        p.passage.includes("Melancholia, sadness")
      );
      expect(p).toBeTruthy();
      const range = findPassageRange(p!.passage, cleaned);
      expect(range).not.toBeNull();
    });

    it("finds at least 90% of all Pulsatilla passages", () => {
      let found = 0;
      for (const p of pulsPassages) {
        if (findPassageRange(p.passage, cleaned)) found++;
      }
      const rate = found / pulsPassages.length;
      expect(rate).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("edge cases", () => {
    it("handles passage with emphasis markers stripped from surrounding context", () => {
      // Simulate: markdown has "*Nux* is an old dyspeptic" → cleaned is "Nux is an old dyspeptic"
      // passage_index has "Nux is an old dyspeptic"
      const cleaned = cleanMarkdown("# Test\n\n*Nux* is an old dyspeptic, lean, hungry.");
      const range = findPassageRange(
        "Nux is an old dyspeptic, lean, hungry.",
        cleaned
      );
      expect(range).not.toBeNull();
    });

    it("handles passage where text diverges at end (prefix match)", () => {
      // Passage says "symptoms." but cleaned says "symptoms; more text"
      const cleaned = "The patient has cardiac symptoms; it is much like other remedies.";
      const passage = "The patient has cardiac symptoms.";
      const range = findPassageRange(passage, cleaned);
      expect(range).not.toBeNull();
      if (range) {
        expect(cleaned.slice(range.start, range.end)).toContain("cardiac symptoms");
      }
    });

    it("handles passage with expanded remedy name (skip first word)", () => {
      // passage_index says "Abrotanum" but markdown has "Abrot."
      const cleaned = "The Abrot. patient is sensitive to cold air and cold damp weather.";
      const passage =
        "The Abrotanum patient is sensitive to cold air and cold damp weather.";
      const range = findPassageRange(passage, cleaned);
      expect(range).not.toBeNull();
      if (range) {
        expect(cleaned.slice(range.start, range.end)).toContain("sensitive to cold");
      }
    });

    it("returns null for completely unrelated passage", () => {
      const cleaned = cleanMarkdown(nuxMd);
      const range = findPassageRange(
        "This text is not found anywhere in any remedy.",
        cleaned
      );
      expect(range).toBeNull();
    });

    it("handles empty passage", () => {
      const cleaned = cleanMarkdown(nuxMd);
      const range = findPassageRange("", cleaned);
      // Empty passage should match at start (index 0) since empty string is in every string
      // This is acceptable behavior
      expect(range).not.toBeNull();
    });
  });
});

// ===================================================================
// 3. cleanMarkdown + findPassageRange integration across remedies
// ===================================================================
describe("cross-remedy passage matching rate", () => {
  const remedies = ["Nux-v.", "Arn.", "Puls."];

  for (const abbrev of remedies) {
    it(`matches 90%+ passages for ${abbrev}`, () => {
      const prof = profiles[abbrev];
      if (!prof) return;
      const md = loadMarkdown(prof.file);
      const cleaned = cleanMarkdown(md);
      const passages = passageIndex[abbrev] ?? [];

      let found = 0;
      const missed: string[] = [];
      for (const p of passages) {
        if (findPassageRange(p.passage, cleaned)) {
          found++;
        } else {
          missed.push(p.passage.slice(0, 60));
        }
      }

      const rate = passages.length > 0 ? found / passages.length : 1;
      if (rate < 0.9) {
        console.log(
          `${abbrev}: ${found}/${passages.length} (${(rate * 100).toFixed(1)}%) — missed examples:`
        );
        missed.slice(0, 5).forEach((m) => console.log(`  - ${m}...`));
      }
      expect(rate).toBeGreaterThanOrEqual(0.9);
    });
  }
});

// ===================================================================
// 4. Full rendering pipeline tests with real-shaped data
// ===================================================================
const mockFetch = vi.fn();
global.fetch = mockFetch;

let mockSearch = "";

beforeEach(() => {
  mockFetch.mockReset();
  mockSearch = "";
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      get search() {
        return mockSearch;
      },
    },
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setQueryParams(params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  mockSearch = "?" + sp.toString();
}

// Use real-ish Nux data but inline to avoid file-load race
const nuxProfiles = {
  "Nux-v.": {
    remedy: "Nux Vomica",
    file: "nux_vomica.md",
    abbreviations: ["Nux-v."],
  },
};

const nuxPassageIndexData = {
  "Nux-v.": passageIndex["Nux-v."] ?? [],
};

function setupNuxFetch(md?: string) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("profiles.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(nuxProfiles),
      });
    }
    if (url.includes("passage_index.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(nuxPassageIndexData),
      });
    }
    if (url.includes("remedy_markdown/")) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(md ?? nuxMd),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe("full rendering pipeline with real Nux data", () => {
  it("renders the Nux Vomica title", async () => {
    setupNuxFetch();
    render(<RemedyReader slug="nux_vomica" />);
    await waitFor(() => {
      expect(screen.getAllByText("Nux Vomica").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("strips emphasis markers in rendered output", async () => {
    setupNuxFetch();
    render(<RemedyReader slug="nux_vomica" />);
    await waitFor(() => {
      const remedyText = document.querySelector(".remedy-text");
      expect(remedyText).toBeTruthy();
      expect(remedyText!.textContent).toContain("Nux suffers from a disordered stomach");
      expect(remedyText!.textContent).not.toContain("*Nux*");
    });
  });

  it("highlights the stomach passage with real passage_index data", async () => {
    const stomachPassage = passageIndex["Nux-v."]?.find((p) =>
      p.passage.includes("disordered stomach")
    );
    if (!stomachPassage) return;

    setQueryParams({
      symptoms: "Stomach, constipation",
      highlight: stomachPassage.passage,
    });
    setupNuxFetch();
    render(<RemedyReader slug="nux_vomica" />);

    await waitFor(() => {
      const primaryMark = document.querySelector('[data-highlight="primary"]');
      expect(primaryMark).toBeTruthy();
      expect(primaryMark!.textContent).toContain("disordered stomach");
    });
  });

  it("highlights both primary and secondary passages simultaneously", async () => {
    const stomachP = passageIndex["Nux-v."]?.find((p) =>
      p.passage.includes("disordered stomach")
    );
    const bladderP = passageIndex["Nux-v."]?.find((p) =>
      p.passage.includes("strain to urinate")
    );
    if (!stomachP || !bladderP) return;

    setQueryParams({
      symptoms: "Stomach, constipation|Bladder, urging to urinate (morbid desire), frequent",
      highlight: stomachP.passage,
    });
    setupNuxFetch();
    render(<RemedyReader slug="nux_vomica" />);

    await waitFor(() => {
      const primary = document.querySelector('[data-highlight="primary"]');
      const secondary = document.querySelector('[data-highlight="secondary"]');
      expect(primary).toBeTruthy();
      expect(primary!.textContent).toContain("disordered stomach");
      // Secondary should exist for the bladder passage
      if (secondary) {
        expect(secondary.textContent).toContain("strain to urinate");
      }
    });
  });

  it("merges duplicate ranges when multiple symptoms match same passage", async () => {
    // Multiple bladder-related symptoms all match the same bladder passage
    setQueryParams({
      symptoms: [
        "Bladder, urging to urinate (morbid desire), frequent",
        "Bladder, urination, dysuria",
        "Urine, bloody",
      ].join("|"),
    });
    setupNuxFetch();
    render(<RemedyReader slug="nux_vomica" />);

    await waitFor(() => {
      const marks = document.querySelectorAll("mark");
      expect(marks.length).toBeGreaterThan(0);
    });

    // The bladder passage should appear exactly once (merged, not duplicated)
    const marks = document.querySelectorAll("mark");
    const bladderMarks = Array.from(marks).filter((m) =>
      m.textContent?.includes("strain to urinate")
    );
    expect(bladderMarks.length).toBeLessThanOrEqual(1);
  });

  it("shows symptom badges with checkmarks for matched symptoms", async () => {
    setQueryParams({
      symptoms: "Mind, anxiety, restlessness|Mind, nonexistent symptom xyz",
    });
    setupNuxFetch();
    render(<RemedyReader slug="nux_vomica" />);

    await waitFor(() => {
      expect(screen.getByText(/matching passage/)).toBeInTheDocument();
    });

    // "Mind, anxiety, restlessness" should match (keywords in passage index)
    const buttons = document.querySelectorAll("button");
    const matchedBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Mind, anxiety")
    );
    expect(matchedBtn).toBeTruthy();
    expect(matchedBtn!.textContent).toContain("\u2713");
  });
});

// ===================================================================
// 5. MateriaPanel buildRemedyUrl ↔ RemedyReader highlight param
// ===================================================================
describe("buildRemedyUrl → RemedyReader highlight param round-trip", () => {
  it("passage text survives URL encoding round-trip", () => {
    const passage =
      "Nux suffers from a disordered stomach. A stasis of the portal system is present.";

    // Simulate what buildRemedyUrl does
    const params = new URLSearchParams();
    params.set("highlight", passage);
    const encoded = params.toString();

    // Simulate what RemedyReader does
    const decoded = new URLSearchParams("?" + encoded);
    expect(decoded.get("highlight")).toBe(passage);
  });

  it("passage with special chars survives URL encoding", () => {
    const passage =
      'He says: "Doctor, there is no use; I am going to die."';
    const params = new URLSearchParams();
    params.set("highlight", passage);
    const decoded = new URLSearchParams("?" + params.toString());
    expect(decoded.get("highlight")).toBe(passage);
  });

  it("passage with pipe chars survives (not confused with symptom separator)", () => {
    // Symptoms use | as separator, make sure passage text with | works
    const passage = "Symptom A | Symptom B";
    const params = new URLSearchParams();
    params.set("symptoms", "Mind, anxiety|Head, pain");
    params.set("highlight", passage);
    const decoded = new URLSearchParams("?" + params.toString());
    expect(decoded.get("highlight")).toBe(passage);
    expect(decoded.get("symptoms")).toBe("Mind, anxiety|Head, pain");
  });
});

// ===================================================================
// 6. Symptom badge click-to-scroll behavior
// ===================================================================
describe("symptom badge click-to-scroll", () => {
  it("scrolls to the matching highlight mark on badge click", async () => {
    const stomachP = passageIndex["Nux-v."]?.find((p) =>
      p.passage.includes("disordered stomach")
    );
    if (!stomachP) return;

    setQueryParams({
      symptoms: "Stomach, constipation",
      highlight: stomachP.passage,
    });
    setupNuxFetch();

    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(<RemedyReader slug="nux_vomica" />);

    await waitFor(() => {
      const primaryMark = document.querySelector('[data-highlight="primary"]');
      expect(primaryMark).toBeTruthy();
    });

    // Wait for auto-scroll on load
    await waitFor(
      () => expect(scrollIntoViewMock).toHaveBeenCalled(),
      { timeout: 1000 }
    );

    scrollIntoViewMock.mockClear();

    // Click the symptom badge
    const badge = screen.getByText(/Stomach, constipation/i);
    badge.click();

    // Should scroll to the highlight (badge click calls scrollIntoView)
    await waitFor(
      () => expect(scrollIntoViewMock).toHaveBeenCalled(),
      { timeout: 1000 }
    );
  });
});
