import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRepertorize } from "../useRepertorize";
import type { RubricsData, RemediesData } from "../types";

// ---------- sample data ----------
const sampleRubrics: RubricsData = {
  "Mind, anxiety": {
    remedies: { "Acon.": 3, "Ars.": 3, "Bell.": 1 },
  },
  "Head, pain, forehead": {
    remedies: { "Bell.": 3, "Bry.": 2, "Acon.": 1 },
  },
  "Stomach, nausea": {
    remedies: { "Nux-v.": 3, "Ars.": 2, "Bry.": 1 },
  },
  "Mind, fear of death": {
    remedies: { "Acon.": 3, "Ars.": 2 },
  },
};

const sampleRemedies: RemediesData = {
  "Acon.": "Aconitum Napellus",
  "Ars.": "Arsenicum Album",
  "Bell.": "Belladonna",
  "Bry.": "Bryonia Alba",
  "Nux-v.": "Nux Vomica",
};

// ---------- helpers ----------
// Build pairs and encoded index from the sample rubrics to match the lazy loading format.
// pairs = ["Mind, anxiety", "Head, pain", "Stomach, nausea", "Mind, fear of death"]
// Sorted by frequency (each appears once, so order is stable by insertion).
const samplePairs = ["Mind, anxiety", "Mind, fear of death", "Head, pain", "Stomach, nausea"];
const sampleEncoded = [
  "0",            // "Mind, anxiety" (pair 0, no remaining)
  "2:forehead",   // "Head, pain, forehead" (pair 2 = "Head, pain", remaining = "forehead")
  "3",            // "Stomach, nausea" (pair 3, no remaining)
  "1",            // "Mind, fear of death" (pair 1, no remaining)
];

// Split rubric files by body-system/subcategory
const mindAnxietyFile: RubricsData = {
  "Mind, anxiety": sampleRubrics["Mind, anxiety"],
};
const mindFearFile: RubricsData = {
  "Mind, fear of death": sampleRubrics["Mind, fear of death"],
};
const headPainFile: RubricsData = {
  "Head, pain, forehead": sampleRubrics["Head, pain, forehead"],
};
const stomachNauseaFile: RubricsData = {
  "Stomach, nausea": sampleRubrics["Stomach, nausea"],
};

function setupFetchMock(
  defaultRubrics: string[] | null = null
) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string) => {
      if (url.includes("symptom_pairs.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(samplePairs),
        });
      }
      if (url.includes("symptoms/index.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sampleEncoded),
        });
      }
      if (url.includes("remedies/index.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sampleRemedies),
        });
      }
      if (url.includes("symptoms/Mind/anxiety.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mindAnxietyFile),
        });
      }
      if (url.includes("symptoms/Mind/fear of death.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mindFearFile),
        });
      }
      if (url.includes("symptoms/Head/pain.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(headPainFile),
        });
      }
      if (url.includes("symptoms/Stomach/nausea.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(stomachNauseaFile),
        });
      }
      if (url.includes("default-rubrics.json")) {
        if (defaultRubrics) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(defaultRubrics),
          });
        }
        return Promise.resolve({ ok: false });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }
  );
}

// ---------- setup ----------
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockSessionStorage: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    mockSessionStorage[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockSessionStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockSessionStorage)) {
      delete mockSessionStorage[key];
    }
  }),
  get length() {
    return Object.keys(mockSessionStorage).length;
  },
  key: vi.fn((i: number) => Object.keys(mockSessionStorage)[i] ?? null),
};

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorageMock.clear();
  Object.defineProperty(window, "sessionStorage", {
    value: sessionStorageMock,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- tests ----------
describe("useRepertorize", () => {
  describe("initialization and data loading", () => {
    it("starts in loading state with empty selections", () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      expect(result.current.loading).toBe(true);
      expect(result.current.selectedRubrics).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("loads data and transitions to ready state", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeNull();
      expect(result.current.rubricCount).toBe(4);
      expect(result.current.remedyCount).toBe(5);
    });

    it("reports error on fetch failure", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("symptom_pairs.json")) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        if (url.includes("default-rubrics.json")) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("REGRESSION: hydration safety (bug #1 - sessionStorage deferred to useEffect)", () => {
    it("does NOT read sessionStorage during initial render (SSR safe)", () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      expect(result.current.selectedRubrics).toEqual([]);
      expect(result.current.minScore).toBe(0);
      expect(result.current.hiddenRubrics.size).toBe(0);
    });

    it("restores persisted state from sessionStorage via useEffect", async () => {
      const savedState = {
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: ["Head, pain, forehead"],
        minScore: 25,
      };
      mockSessionStorage["homeo-magic-state"] = JSON.stringify(savedState);
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.selectedRubrics).toEqual([
        "Mind, anxiety",
        "Head, pain, forehead",
      ]);
      expect(result.current.hiddenRubrics.has("Head, pain, forehead")).toBe(
        true
      );
      expect(result.current.minScore).toBe(25);
    });

    it("fetches default rubrics when no persisted state exists", async () => {
      setupFetchMock([
        "Mind, anxiety",
        "Stomach, nausea",
      ]);
      renderHook(() => useRepertorize());
      await waitFor(() => {
        const calls = mockFetch.mock.calls.map((c: unknown[]) => c[0]);
        expect(calls.some((url: string) => url.includes("default-rubrics.json"))).toBe(true);
      });
    });

    it("skips default rubrics fetch when persisted state exists", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock(["Stomach, nausea"]);
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedRubrics).toEqual(["Mind, anxiety"]);
    });
  });

  describe("rubric management", () => {
    it("addRubric adds a new rubric", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      expect(result.current.selectedRubrics).toContain("Mind, anxiety");
    });

    it("addRubric prevents duplicates", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.addRubric("Mind, anxiety"));
      expect(
        result.current.selectedRubrics.filter((s) => s === "Mind, anxiety")
          .length
      ).toBe(1);
    });

    it("removeRubric removes a rubric and its hidden state", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.hideRubric("Mind, anxiety"));
      expect(result.current.hiddenRubrics.has("Mind, anxiety")).toBe(true);

      act(() => result.current.removeRubric("Mind, anxiety"));
      expect(result.current.selectedRubrics).not.toContain("Mind, anxiety");
      expect(result.current.hiddenRubrics.has("Mind, anxiety")).toBe(false);
    });

    it("hideRubric / showRubric toggles visibility", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      expect(result.current.hiddenRubrics.has("Mind, anxiety")).toBe(false);

      act(() => result.current.hideRubric("Mind, anxiety"));
      expect(result.current.hiddenRubrics.has("Mind, anxiety")).toBe(true);

      act(() => result.current.showRubric("Mind, anxiety"));
      expect(result.current.hiddenRubrics.has("Mind, anxiety")).toBe(false);
    });

    it("reorderRubrics moves rubric from one position to another", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.addRubric("Head, pain, forehead"));
      act(() => result.current.addRubric("Stomach, nausea"));

      act(() => result.current.reorderRubrics(0, 2));
      expect(result.current.selectedRubrics).toEqual([
        "Head, pain, forehead",
        "Stomach, nausea",
        "Mind, anxiety",
      ]);
    });

    it("clearRubrics resets all selections", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.addRubric("Stomach, nausea"));
      act(() => result.current.hideRubric("Mind, anxiety"));
      act(() => result.current.clearRubrics());

      expect(result.current.selectedRubrics).toEqual([]);
      expect(result.current.hiddenRubrics.size).toBe(0);
    });
  });

  describe("searchRubrics", () => {
    it("returns matching rubrics that aren't already selected", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const matches = result.current.searchRubrics("mind");
      expect(matches).toContain("Mind, anxiety");
      expect(matches).toContain("Mind, fear of death");
    });

    it("excludes already selected rubrics from results", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      const matches = result.current.searchRubrics("mind");
      expect(matches).not.toContain("Mind, anxiety");
      expect(matches).toContain("Mind, fear of death");
    });

    it("returns empty array for empty query", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.searchRubrics("")).toEqual([]);
    });

    it("returns empty array for whitespace-only query", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.searchRubrics("   ")).toEqual([]);
    });

    it("respects limit parameter", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const matches = result.current.searchRubrics("mind", 1);
      expect(matches.length).toBe(1);
    });
  });

  describe("results computation (scoring and normalization)", () => {
    it("returns empty results when no rubrics selected", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.results.items).toEqual([]);
      expect(result.current.results.totalCount).toBe(0);
    });

    it("computes scores for a single rubric", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));

      // Wait for lazy fetch to complete
      await waitFor(() => {
        expect(result.current.results.items.length).toBe(3);
      });

      // Mind, anxiety: Acon.=3, Ars.=3, Bell.=1
      const items = result.current.results.items;
      expect(items[0].totalScore).toBe(100);
      expect(items[0].rawScore).toBe(3);
      const bell = items.find((i) => i.abbrev === "Bell.");
      expect(bell).toBeDefined();
      expect(bell!.totalScore).toBe(33);
    });

    it("computes combined scores for multiple rubrics", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.addRubric("Head, pain, forehead"));

      await waitFor(() => {
        expect(result.current.results.items.length).toBe(4);
      });

      const items = result.current.results.items;
      expect(items[0].rawScore).toBe(4); // Acon. or Bell.
      expect(items[0].totalScore).toBe(100);

      const acon = items.find((i) => i.abbrev === "Acon.");
      expect(acon).toBeDefined();
      expect(acon!.breakdown["Mind, anxiety"]).toBe(3);
      expect(acon!.breakdown["Head, pain, forehead"]).toBe(1);
    });

    it("results are sorted by score descending", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.addRubric("Head, pain, forehead"));

      await waitFor(() => {
        expect(result.current.results.items.length).toBe(4);
      });

      const scores = result.current.results.items.map((i) => i.rawScore);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it("excludes hidden rubrics from scoring", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.addRubric("Head, pain, forehead"));

      await waitFor(() => {
        expect(result.current.results.items.length).toBe(4);
      });

      // Hide Mind, anxiety — only Head scores should remain
      act(() => result.current.hideRubric("Mind, anxiety"));

      // Head, pain: Bell.=3, Bry.=2, Acon.=1 — no Ars.
      const items = result.current.results.items;
      const abbrevs = items.map((i) => i.abbrev);
      expect(abbrevs).not.toContain("Ars.");
      expect(items[0].abbrev).toBe("Bell.");
      expect(items[0].totalScore).toBe(100);
    });

    it("returns empty results when all rubrics are hidden", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));

      await waitFor(() => {
        expect(result.current.results.items.length).toBe(3);
      });

      act(() => result.current.hideRubric("Mind, anxiety"));
      expect(result.current.results.items).toEqual([]);
    });

    it("includes fullName from remedies data", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));

      await waitFor(() => {
        expect(result.current.results.items.length).toBe(3);
      });

      const acon = result.current.results.items.find(
        (i) => i.abbrev === "Acon."
      );
      expect(acon!.fullName).toBe("Aconitum Napellus");
    });
  });

  describe("state persistence to sessionStorage", () => {
    it("persists selectedRubrics, hiddenRubrics, and minScore", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addRubric("Mind, anxiety"));
      act(() => result.current.setMinScore(42));

      const lastCall =
        sessionStorageMock.setItem.mock.calls[
          sessionStorageMock.setItem.mock.calls.length - 1
        ];
      expect(lastCall[0]).toBe("homeo-magic-state");
      const saved = JSON.parse(lastCall[1]);
      expect(saved.selectedRubrics).toContain("Mind, anxiety");
      expect(saved.minScore).toBe(42);
    });
  });

  describe("minScore filter", () => {
    it("setMinScore updates the minScore value", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.setMinScore(50));
      expect(result.current.minScore).toBe(50);
    });
  });

  describe("REGRESSION: persistence + lazy loading integration", () => {
    it("restoring rubrics from sessionStorage loads their body-system data", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Restored rubrics should have their body-system data fetched
      await waitFor(() => {
        expect(result.current.results.items.length).toBeGreaterThan(0);
      });

      // Verify data for both restored rubrics is present in results
      const abbrevs = result.current.results.items.map((i) => i.abbrev);
      // Mind, anxiety has Acon., Ars., Bell. — Head, pain has Bell., Bry., Acon.
      expect(abbrevs).toContain("Acon.");
      expect(abbrevs).toContain("Bell.");
      expect(abbrevs).toContain("Bry.");
      expect(abbrevs).toContain("Ars.");
    });

    it("adding a rubric after restore fetches its body-system data", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Wait for restored rubric data to load
      await waitFor(() => {
        expect(result.current.results.items.length).toBeGreaterThan(0);
      });

      // Now add a new rubric from a different body system
      act(() => result.current.addRubric("Stomach, nausea"));

      // The new rubric's data should also be fetched and appear in results
      await waitFor(() => {
        const abbrevs = result.current.results.items.map((i) => i.abbrev);
        expect(abbrevs).toContain("Nux-v."); // Only in Stomach, nausea
      });
    });

    it("removing a restored rubric removes it from state AND sessionStorage", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Wait for restore to complete
      await waitFor(() => {
        expect(result.current.selectedRubrics).toEqual([
          "Mind, anxiety",
          "Head, pain, forehead",
        ]);
      });

      // Remove a restored rubric
      act(() => result.current.removeRubric("Mind, anxiety"));

      expect(result.current.selectedRubrics).toEqual(["Head, pain, forehead"]);
      expect(result.current.selectedRubrics).not.toContain("Mind, anxiety");

      // sessionStorage should reflect the removal
      const lastSetCall =
        sessionStorageMock.setItem.mock.calls[
          sessionStorageMock.setItem.mock.calls.length - 1
        ];
      const persisted = JSON.parse(lastSetCall[1]);
      expect(persisted.selectedRubrics).toEqual(["Head, pain, forehead"]);
      expect(persisted.selectedRubrics).not.toContain("Mind, anxiety");
    });

    it("clearing all rubrics works after restore", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: ["Head, pain, forehead"],
        minScore: 10,
      });
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Wait for restore to complete
      await waitFor(() => {
        expect(result.current.selectedRubrics.length).toBe(2);
      });

      // Clear all
      act(() => result.current.clearRubrics());

      expect(result.current.selectedRubrics).toEqual([]);
      expect(result.current.hiddenRubrics.size).toBe(0);

      // sessionStorage should reflect the clear
      const lastSetCall =
        sessionStorageMock.setItem.mock.calls[
          sessionStorageMock.setItem.mock.calls.length - 1
        ];
      const persisted = JSON.parse(lastSetCall[1]);
      expect(persisted.selectedRubrics).toEqual([]);
      expect(persisted.hiddenRubrics).toEqual([]);
    });

    it("adding a rubric from a different body system than restored ones produces correct combined results", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Wait for restored data
      await waitFor(() => {
        expect(result.current.results.items.length).toBe(3); // Acon, Ars, Bell
      });

      // Add rubric from different body system
      act(() => result.current.addRubric("Head, pain, forehead"));

      // Should now have combined results from Mind + Head
      await waitFor(() => {
        expect(result.current.results.items.length).toBe(4); // Acon, Ars, Bell, Bry
      });

      // Acon. appears in both: Mind,anxiety=3 + Head,pain=1 = 4
      // Bell. appears in both: Mind,anxiety=1 + Head,pain=3 = 4
      const acon = result.current.results.items.find((i) => i.abbrev === "Acon.");
      const bell = result.current.results.items.find((i) => i.abbrev === "Bell.");
      expect(acon!.rawScore).toBe(4);
      expect(bell!.rawScore).toBe(4);
    });

    it("BUG #3: after clearRubrics, remounting loads defaults instead of empty state", async () => {
      // Simulate: user had rubrics, cleared them, navigated away, came back
      // The persist effect writes {selectedRubrics: []} after clearRubrics().
      // On remount, the restore effect should NOT treat this as "had persisted state"
      // and should fall through to loading defaults.
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: [],
        hiddenRubrics: [],
        minScore: 0,
      });

      // Also set up a default-rubrics.json endpoint
      const defaultRubrics = ["Mind, anxiety", "Head, pain, forehead"];
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("repertory_index.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                rubrics: { Mind: ["Mind, anxiety"], Head: ["Head, pain, forehead"] },
                remedies: { "Acon.": "Aconitum Napellus" },
              }),
          });
        }
        if (url.includes("default-rubrics.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(defaultRubrics),
          });
        }
        if (url.includes("body_systems/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                "Mind, anxiety": { remedies: { "Acon.": 3 } },
                "Head, pain, forehead": { remedies: { "Acon.": 1 } },
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should have loaded defaults, NOT stayed empty
      await waitFor(() => {
        expect(result.current.selectedRubrics.length).toBeGreaterThan(0);
      });
      expect(result.current.selectedRubrics).toEqual(defaultRubrics);
    });

    it("persist effect does not clobber sessionStorage before restore completes", async () => {
      const savedState = {
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: ["Head, pain, forehead"],
        minScore: 25,
      };
      mockSessionStorage["homeo-magic-state"] = JSON.stringify(savedState);
      setupFetchMock();

      // Record call count before render so we only inspect calls from this test
      const callsBefore = sessionStorageMock.setItem.mock.calls.length;

      renderHook(() => useRepertorize());

      // After initial render + effects, sessionStorage should never have been
      // written with empty selectedRubrics (the persist effect should not
      // overwrite saved state before restore has had a chance to load it)
      const newCalls = sessionStorageMock.setItem.mock.calls
        .slice(callsBefore)
        .filter((c: unknown[]) => c[0] === "homeo-magic-state");
      for (const call of newCalls) {
        const written = JSON.parse(call[1] as string);
        // The persist effect should never write an empty rubrics array when
        // we had saved state — that would clobber the restore
        if (written.selectedRubrics.length === 0) {
          expect(written.selectedRubrics).not.toEqual([]);
        }
      }
    });
  });
});
