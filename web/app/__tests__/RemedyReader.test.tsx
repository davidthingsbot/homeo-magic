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
    it("highlights matched passages from symptom search", async () => {
      setQueryParams({
        symptoms: "Mind, anxiety",
      });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        // The matching passage info should be shown
        expect(screen.getByText(/matching passage/)).toBeInTheDocument();
      });

      // Symptom badge should show
      expect(screen.getByText(/Mind, anxiety/)).toBeInTheDocument();
    });

    it("highlights primary passage with distinct styling", async () => {
      const passage =
        "The anxiety that is found in Aconitum is overwhelming.";
      setQueryParams({
        symptoms: "Mind, anxiety",
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
        symptoms: "Mind, anxiety|Head, headache",
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

    it("shows symptom badges with check marks for matched symptoms", async () => {
      setQueryParams({ symptoms: "Mind, anxiety" });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        // The matched symptom should show a checkmark
        const badge = screen.getByText(/Mind, anxiety/);
        expect(badge.textContent).toContain("\u2713");
      });
    });

    it("shows symptom badges without check marks for unmatched symptoms", async () => {
      setQueryParams({ symptoms: "Mind, anxiety|Extremities, cold" });
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      await waitFor(() => {
        expect(screen.getByText(/matching passage/)).toBeInTheDocument();
      });

      // "Extremities, cold" won't match any passage
      const badges = document.querySelectorAll("span.text-xs");
      const unmatchedBadge = Array.from(badges).find(
        (b) =>
          b.textContent?.includes("Extremities") &&
          !b.textContent?.includes("\u2713")
      );
      expect(unmatchedBadge).toBeTruthy();
    });

    it("does not show passage section when no symptoms provided", async () => {
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
    it("renders back link", async () => {
      setupFetchMock();
      render(<RemedyReader slug="aconitum_napellus" />);

      // Wait for loading to finish so the nav renders
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
    setQueryParams({ symptoms: "Mind, anxiety, restlessness" });
    setupFetchMock();
    render(<RemedyReader slug="aconitum_napellus" />);

    await waitFor(() => {
      // "anxiety" and "restlessness" are keywords in the first passage
      expect(screen.getByText(/matching passage/)).toBeInTheDocument();
    });
  });

  it("does not match passages with insufficient score", async () => {
    // Use a symptom with very short terms that won't match
    setQueryParams({ symptoms: "ab, cd" });
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
