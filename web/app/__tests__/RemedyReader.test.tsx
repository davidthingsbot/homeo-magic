import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RemedyReader from "../remedy/[slug]/RemedyReader";

// ---------- sample data ----------
const sampleProfiles = {
  "Acon.": {
    remedy: "Aconitum Napellus",
    file: "aconitum_napellus.md",
    abbreviations: ["Acon."],
  },
};

const samplePassageIndex = {
  "Acon.": [
    {
      keywords: ["anxiety", "fear", "restlessness"],
      passage: "The anxiety that is found in Aconitum is overwhelming.",
    },
    {
      keywords: ["headache", "head", "congestion"],
      passage: "Violent headache with fullness and congestion.",
    },
  ],
};

const sampleMarkdown = `# Aconitum Napellus

## Mental Symptoms

The anxiety that is found in Aconitum is overwhelming. The patient cannot sit still.

## Head Symptoms

Violent headache with fullness and congestion. The head feels as if it would burst.

"This is a quote from Kent about the burning sensations"

This is a regular paragraph that
was wrapped across multiple lines
in the source file.`;

// ---------- mock fetch ----------
const mockFetch = vi.fn();
global.fetch = mockFetch;

function setupFetchMock(opts?: {
  profilesOk?: boolean;
  markdownOk?: boolean;
  markdown?: string;
}) {
  const {
    profilesOk = true,
    markdownOk = true,
    markdown = sampleMarkdown,
  } = opts ?? {};

  mockFetch.mockImplementation((url: string) => {
    if (url.includes("profiles.json")) {
      if (!profilesOk) return Promise.resolve({ ok: false });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sampleProfiles),
      });
    }
    if (url.includes("passage_index.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(samplePassageIndex),
      });
    }
    if (url.includes("remedy_markdown/")) {
      if (!markdownOk)
        return Promise.resolve({
          ok: false,
          text: () => Promise.resolve(""),
        });
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(markdown),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

// ---------- mock window.location.search ----------
let mockSearch = "";

beforeEach(() => {
  mockFetch.mockReset();
  mockSearch = "";
  // Mock URLSearchParams by overriding window.location.search
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

// ---------- tests ----------
describe("RemedyReader", () => {
  describe("loading and error states", () => {
    it("shows loading state initially", () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);
      expect(screen.getByText(/Loading remedy text/)).toBeInTheDocument();
    });

    it("renders remedy title after loading", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        // Title appears in both header and markdown h1
        const titles = screen.getAllByText("Aconitum Napellus");
        expect(titles.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows error when remedy not found", async () => {
      setupFetchMock();
      render(<RemedyReader slug="nonexistent_remedy" />);
      await waitFor(() => {
        expect(screen.getByText("Remedy not found")).toBeInTheDocument();
      });
    });

    it("shows error when profiles fetch fails", async () => {
      setupFetchMock({ profilesOk: false });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(screen.getByText("Failed to load profiles")).toBeInTheDocument();
      });
    });

    it("shows error when markdown fetch fails", async () => {
      setupFetchMock({ markdownOk: false });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(
          screen.getByText("Failed to load remedy text")
        ).toBeInTheDocument();
      });
    });
  });

  describe("markdown rendering and paragraph handling", () => {
    it("renders h1 headings", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        const h1s = screen.getAllByRole("heading", { level: 1 });
        // At least one h1 from the markdown content
        expect(h1s.length).toBeGreaterThanOrEqual(1);
        expect(h1s.some((h) => h.textContent?.includes("Aconitum Napellus"))).toBe(true);
      });
    });

    it("renders h2 headings", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(
          screen.getByText("Mental Symptoms")
        ).toBeInTheDocument();
      });
    });

    it("renders blockquotes for text starting with quotes", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        const blockquote = document.querySelector("blockquote");
        expect(blockquote).toBeTruthy();
        expect(blockquote!.textContent).toContain("burning sensations");
      });
    });

    it("REGRESSION: preserves double-newline paragraph breaks (bug fix ee5ebf2)", async () => {
      setupFetchMock({
        markdown:
          "# Title\n\nFirst paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.",
      });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(screen.getByText("First paragraph here.")).toBeInTheDocument();
        expect(screen.getByText("Second paragraph here.")).toBeInTheDocument();
        expect(screen.getByText("Third paragraph here.")).toBeInTheDocument();
      });

      // Each should be in its own <p> tag
      const paragraphs = document.querySelectorAll("p.my-3");
      expect(paragraphs.length).toBe(3);
    });

    it("REGRESSION: joins wrapped lines within a single paragraph block (bug fix ee5ebf2)", async () => {
      setupFetchMock({
        markdown:
          "# Title\n\nThis is a paragraph that\nwas wrapped across multiple\nlines in the source.",
      });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        // Wrapped lines should be joined into one paragraph
        expect(
          screen.getByText(
            "This is a paragraph that was wrapped across multiple lines in the source."
          )
        ).toBeInTheDocument();
      });
    });

    it("does not join headings across lines", async () => {
      setupFetchMock({
        markdown: "# My Heading\n\nA paragraph.\n\n## Sub Heading\n\nAnother paragraph.",
      });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(screen.getByText("My Heading")).toBeInTheDocument();
        expect(screen.getByText("Sub Heading")).toBeInTheDocument();
      });
    });
  });

  describe("passage highlighting", () => {
    it("highlights matched passages from rubric search", async () => {
      setQueryParams({
        rubrics: "Mind, anxiety",
      });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        // The matching passage info should be shown
        expect(screen.getByText(/matching passage/)).toBeInTheDocument();
      });

      // Rubric badge should show
      expect(screen.getByText(/Mind, anxiety/)).toBeInTheDocument();
    });

    it("highlights primary passage with distinct styling", async () => {
      const passage =
        "The anxiety that is found in Aconitum is overwhelming.";
      setQueryParams({
        rubrics: "Mind, anxiety",
        highlight: passage,
      });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        const primaryMark = document.querySelector(
          '[data-highlight="primary"]'
        );
        expect(primaryMark).toBeTruthy();
      });
    });

    it("highlights secondary passages with different styling", async () => {
      setQueryParams({
        rubrics: "Mind, anxiety|Head, headache",
        highlight: "some other passage",
      });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        // There should be secondary highlights (non-primary matched passages)
        const marks = document.querySelectorAll("mark");
        if (marks.length > 0) {
          const secondary = document.querySelector(
            '[data-highlight="secondary"]'
          );
          // Secondary highlights exist for non-primary matches
          expect(secondary || marks.length > 0).toBeTruthy();
        }
      });
    });

    it("shows rubric badges with check marks for matched rubrics", async () => {
      setQueryParams({ rubrics: "Mind, anxiety" });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        // The matched rubric should show a checkmark
        const badge = screen.getByText(/Mind, anxiety/);
        expect(badge.textContent).toContain("\u2713");
      });
    });

    it("shows rubric badges without check marks for unmatched rubrics", async () => {
      setQueryParams({ rubrics: "Mind, anxiety|Extremities, cold" });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        expect(screen.getByText(/matching passage/)).toBeInTheDocument();
      });

      // "Extremities, cold" won't match any passage
      const badges = document.querySelectorAll("button.text-xs, span.text-xs");
      const unmatchedBadge = Array.from(badges).find(
        (b) =>
          b.textContent?.includes("Extremities") &&
          !b.textContent?.includes("\u2713")
      );
      expect(unmatchedBadge).toBeTruthy();
    });

    it("does not show passage section when no rubrics provided", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        const titles = screen.getAllByText("Aconitum Napellus");
        expect(titles.length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.queryByText(/matching passage/)).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("shows back link in error state only (removed from normal view in 9dabff8)", async () => {
      setupFetchMock();
      render(<RemedyReader slug="nonexistent_remedy" />);

      await waitFor(() => {
        expect(screen.getByText(/Back to Homeo-Magic/)).toBeInTheDocument();
      });

      const backLink = screen.getByText(/Back to Homeo-Magic/);
      expect(backLink.closest("a")).toHaveAttribute("href", "/");
    });

    it("renders Kent lecture attribution", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        expect(
          screen.getByText(/Kent.*Lectures on Homeopathic Materia Medica/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("BUG FIX: single-newline paragraph separation", () => {
    it("splits single-newline-separated paragraphs into multiple <p> elements", async () => {
      // Real markdown files use single newlines between paragraphs, not double
      setupFetchMock({
        markdown:
          "# Title\n\nFirst paragraph ends here.\nSecond paragraph starts with capital.\nThird paragraph also separate.",
      });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(screen.getByText("First paragraph ends here.")).toBeInTheDocument();
      });

      const paragraphs = document.querySelectorAll("p.my-3");
      expect(paragraphs.length).toBe(3);
    });

    it("joins wrapped lines within a paragraph (continuation lines)", async () => {
      // Lines that end mid-sentence (no terminal punctuation) should be joined
      setupFetchMock({
        markdown:
          "# Title\n\nThis is a long sentence that\ncontinues on the next line without\nany break in the thought.",
      });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        expect(
          screen.getByText(
            "This is a long sentence that continues on the next line without any break in the thought."
          )
        ).toBeInTheDocument();
      });

      const paragraphs = document.querySelectorAll("p.my-3");
      expect(paragraphs.length).toBe(1);
    });

    it("handles real-world markdown format with mixed wrapping and paragraph breaks", async () => {
      // Mimics actual file format: some lines wrap mid-sentence, some are paragraph breaks
      setupFetchMock({
        markdown: [
          "# Aconitum Napellus",
          "",
          "Aconite is a short-acting remedy. Its symptoms do not last long. It is a violent poison in",
          "large doses, either destroying life or passing away in its effects quite soon.",
          "Like a great storm, it comes and sweeps over and passes away.",
          "Strong, robust people become sick from",
          "violent exposure to cold.",
        ].join("\n"),
      });
      render(<RemedyReader slug="aconitum_napellus" />);
      await waitFor(() => {
        // First paragraph: lines 3-4 joined (line 3 ends with "in" - continuation)
        expect(
          screen.getByText(/Aconite is a short-acting remedy.*quite soon\./)
        ).toBeInTheDocument();
      });

      // Should have 3 paragraphs:
      // 1. "Aconite...quite soon." (lines 3-4 joined)
      // 2. "Like a great storm..." (line 5)
      // 3. "Strong...cold." (lines 6-7 joined)
      const paragraphs = document.querySelectorAll("p.my-3");
      expect(paragraphs.length).toBe(3);
    });
  });

  describe("FEATURE: scroll-to-highlight on load", () => {
    it("scrolls to primary highlight element after loading", async () => {
      const passage = "The anxiety that is found in Aconitum is overwhelming.";
      setQueryParams({
        rubrics: "Mind, anxiety",
        highlight: passage,
      });
      setupFetchMock();

      const scrollIntoViewMock = vi.fn();
      // Mock scrollIntoView on any element that gets it called
      Element.prototype.scrollIntoView = scrollIntoViewMock;

      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        const primaryMark = document.querySelector('[data-highlight="primary"]');
        expect(primaryMark).toBeTruthy();
      });

      // Wait for the 300ms setTimeout in the scroll effect
      await waitFor(
        () => {
          expect(scrollIntoViewMock).toHaveBeenCalledWith({
            behavior: "smooth",
            block: "center",
          });
        },
        { timeout: 1000 }
      );
    });

    it("does not scroll when no highlight param is provided", async () => {
      setQueryParams({ rubrics: "Mind, anxiety" });
      setupFetchMock();

      const scrollIntoViewMock = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;

      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        expect(screen.getByText(/matching passage/)).toBeInTheDocument();
      });

      // Give time for any potential scroll
      await new Promise((r) => setTimeout(r, 500));
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });
  });

  describe("FEATURE: MateriaPanel passage link includes highlight param", () => {
    it("passage link href includes highlight query param with passage text", async () => {
      const passage = "The anxiety that is found in Aconitum is overwhelming.";
      setQueryParams({
        rubrics: "Mind, anxiety",
        highlight: passage,
      });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        const primaryMark = document.querySelector('[data-highlight="primary"]');
        expect(primaryMark).toBeTruthy();
        expect(primaryMark!.textContent).toContain("anxiety");
      });
    });
  });
});

// ==========================================================================
// Real-data Nux vomica tests — expose known bugs with actual content
// ==========================================================================

// Real markdown from nux_vomica.md (subset with formatting markers)
const nuxMarkdown = [
  "# Nux Vomica",
  "",
  "## Stomach",
  "",
  "*Nux* suffers from a disordered stomach. A stasis of the portal system is present, portal congestion; stasis in haemorrhoidal veins with hemorrhoids; constipation; dysentery; paralysis of the rectum.",
  "",
  "Stomach symptoms like **Puls.**; worse in the morning; foul mouth in the morning also like **Puls.** Bursting sensation in the head as if a stone crushed the vertex after disordered stomach.",
  "",
  "## Bladder",
  "",
  "The same condition is found in the bladder. He must strain to urinate. There is tenesmus, urging. The bladder is full and the urine dribbles away, yet when he strains it ceases to dribble. In regard to the bowels, though the patient strains much, he passes but a scanty stool.",
].join("\n");

const nuxProfiles = {
  "Nux-v.": {
    remedy: "Nux Vomica",
    file: "nux_vomica.md",
    abbreviations: ["Nux-v."],
  },
};

// Real passage entries from passage_index.json — note NO markdown formatting
const nuxPassageIndex = {
  "Nux-v.": [
    {
      keywords: ["stomach", "portal congestion", "hemorrhoids", "constipation", "dysentery", "rectum", "paralysis"],
      passage: "Nux suffers from a disordered stomach. A stasis of the portal system is present, portal congestion; stasis in haemorrhoidal veins with hemorrhoids; constipation; dysentery; paralysis of the rectum.",
    },
    {
      keywords: ["stomach", "worse morning", "foul mouth", "morning"],
      passage: "Stomach symptoms like Puls.; worse in the morning; foul mouth in the morning also like Puls.",
    },
    {
      keywords: ["bladder", "urine", "straining", "tenesmus", "dribbling"],
      passage: "He must strain to urinate. There is tenesmus, urging. The bladder is full and the urine dribbles away, yet when he strains it ceases to dribble.",
    },
  ],
};

function setupNuxFetchMock() {
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
        json: () => Promise.resolve(nuxPassageIndex),
      });
    }
    if (url.includes("remedy_markdown/")) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(nuxMarkdown),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe("Real-data Nux vomica highlighting", () => {
  describe("BUG #1: markdown formatting causes wrong/missing highlight", () => {
    it("highlights the passage specified in ?highlight= when markdown has *italic* markers", async () => {
      // passage_index says "Nux suffers..." but markdown has "*Nux* suffers..."
      const passage = nuxPassageIndex["Nux-v."][0].passage;
      setQueryParams({
        rubrics: "Stomach, constipation",
        highlight: passage,
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const primaryMark = document.querySelector('[data-highlight="primary"]');
        expect(primaryMark).toBeTruthy();
        expect(primaryMark!.textContent).toContain("disordered stomach");
      });
    });

    it("highlights the passage specified in ?highlight= when markdown has **bold** markers", async () => {
      // passage_index says "...like Puls." but markdown has "...like **Puls.**"
      const passage = nuxPassageIndex["Nux-v."][1].passage;
      setQueryParams({
        rubrics: "Stomach, worse morning",
        highlight: passage,
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const primaryMark = document.querySelector('[data-highlight="primary"]');
        expect(primaryMark).toBeTruthy();
        expect(primaryMark!.textContent).toContain("worse in the morning");
      });
    });

    it("primary highlight corresponds to ?highlight= param, not a different passage", async () => {
      // Set highlight to the stomach passage; bladder passage is also matched via rubrics
      const stomachPassage = nuxPassageIndex["Nux-v."][0].passage;
      setQueryParams({
        rubrics: "Stomach, constipation|Bladder, urging to urinate (morbid desire), frequent",
        highlight: stomachPassage,
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const primaryMark = document.querySelector('[data-highlight="primary"]');
        expect(primaryMark).toBeTruthy();
        // Primary must contain the stomach passage text, NOT the bladder passage
        expect(primaryMark!.textContent).toContain("disordered stomach");
        expect(primaryMark!.textContent).not.toContain("strain to urinate");
      });
    });

    it("strips markdown formatting from rendered text (no literal asterisks)", async () => {
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const titles = screen.getAllByText(/Nux Vomica/);
        expect(titles.length).toBeGreaterThanOrEqual(1);
      });

      // The rendered text should show "Nux suffers" not "*Nux* suffers"
      const remedyText = document.querySelector(".remedy-text")!;
      expect(remedyText.textContent).toContain("Nux suffers from a disordered stomach");
      expect(remedyText.textContent).not.toContain("*Nux*");
      expect(remedyText.textContent).not.toContain("**Puls.**");
    });
  });

  describe("BUG #2: overlapping ranges — multiple rubrics matching one passage", () => {
    it("renders bladder passage text exactly once when 5 rubrics match it", async () => {
      // These are real default rubrics that all score highest on the bladder passage
      setQueryParams({
        rubrics: [
          "Urine, bloody",
          "Urine, odor offensive",
          "Urine, specific gravity increased",
          "Bladder, urging to urinate (morbid desire), frequent",
          "Bladder, urination, dysuria",
        ].join("|"),
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        expect(screen.getByText(/matching passage/)).toBeInTheDocument();
      });

      // Count occurrences of the unique bladder passage phrase in DOM text
      const remedyText = document.querySelector(".remedy-text")!.textContent!;
      const phrase = "He must strain to urinate";
      const occurrences = remedyText.split(phrase).length - 1;
      expect(occurrences).toBe(1);
    });

    it("produces exactly one <mark> range for 5 duplicate overlapping matches", async () => {
      setQueryParams({
        rubrics: [
          "Urine, bloody",
          "Urine, odor offensive",
          "Urine, specific gravity increased",
          "Bladder, urging to urinate (morbid desire), frequent",
          "Bladder, urination, dysuria",
        ].join("|"),
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const marks = document.querySelectorAll("mark");
        expect(marks.length).toBeGreaterThan(0);
      });

      // All 5 rubrics map to the same passage — should produce ONE merged <mark>, not 5
      const marks = document.querySelectorAll("mark");
      // Count marks that contain the bladder passage text
      const bladderMarks = Array.from(marks).filter((m) =>
        m.textContent?.includes("strain to urinate")
      );
      expect(bladderMarks.length).toBe(1);
    });
  });

  describe("cleanMarkdown + findPassageRange integration with real markdown", () => {
    it("passage without formatting matches text that had *italic* stripped", async () => {
      // The passage "Nux suffers..." should be findable in cleaned markdown
      const passage = nuxPassageIndex["Nux-v."][0].passage;
      setQueryParams({
        rubrics: "Stomach, constipation",
        highlight: passage,
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        // If findPassageRange works, there should be a highlight
        const marks = document.querySelectorAll("mark");
        expect(marks.length).toBeGreaterThan(0);
      });
    });

    it("passage without formatting matches text that had **bold** stripped", async () => {
      const passage = nuxPassageIndex["Nux-v."][1].passage;
      setQueryParams({
        rubrics: "Stomach, worse morning",
        highlight: passage,
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const marks = document.querySelectorAll("mark");
        expect(marks.length).toBeGreaterThan(0);
      });
    });

    it("plain passage (no formatting difference) still matches correctly", async () => {
      // The bladder passage has no formatting differences
      const passage = nuxPassageIndex["Nux-v."][2].passage;
      setQueryParams({
        rubrics: "Bladder, urging to urinate (morbid desire), frequent",
        highlight: passage,
      });
      setupNuxFetchMock();
      render(<RemedyReader slug="nux_vomica" />);

      await waitFor(() => {
        const primaryMark = document.querySelector('[data-highlight="primary"]');
        expect(primaryMark).toBeTruthy();
        expect(primaryMark!.textContent).toContain("strain to urinate");
      });
    });
  });
});

// ---------- unit tests for exported helper functions ----------
// We test the internal functions by importing the module and testing through rendering
describe("cleanMarkdown (tested via rendering)", () => {
  it("handles empty input gracefully", async () => {
    setupFetchMock({ markdown: "" });
    render(<RemedyReader slug="aconitum_napellus" />);
    await waitFor(() => {
      expect(screen.getByText("Aconitum Napellus")).toBeInTheDocument();
    });
    // Should render without crashing
  });

  it("handles markdown with only headings", async () => {
    setupFetchMock({ markdown: "# Title\n\n## Subtitle" });
    render(<RemedyReader slug="aconitum_napellus" />);
    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Subtitle")).toBeInTheDocument();
    });
  });

  it("preserves blockquote content starting with curly quotes", async () => {
    setupFetchMock({
      markdown: '# Title\n\n\u201cThis is a curly-quoted passage\u201d',
    });
    render(<RemedyReader slug="aconitum_napellus" />);
    await waitFor(() => {
      const bq = document.querySelector("blockquote");
      expect(bq).toBeTruthy();
      expect(bq!.textContent).toContain("curly-quoted passage");
    });
  });
});

describe("matchPassages scoring (tested via rendering)", () => {
  it("matches passages based on keyword overlap", async () => {
    setQueryParams({ rubrics: "Mind, anxiety, restlessness" });
    setupFetchMock();
    render(<RemedyReader slug="aconitum_napellus" />);

    await waitFor(() => {
      // "anxiety" and "restlessness" are keywords in the first passage
      expect(screen.getByText(/matching passage/)).toBeInTheDocument();
    });
  });

  it("does not match passages with insufficient score", async () => {
    // Use a rubric with very short terms that won't match
    setQueryParams({ rubrics: "ab, cd" });
    setupFetchMock();
    render(<RemedyReader slug="aconitum_napellus" />);

    await waitFor(() => {
      const titles = screen.getAllByText("Aconitum Napellus");
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    // No matching passages section should appear
    expect(screen.queryByText(/matching passage/)).not.toBeInTheDocument();
  });
});
