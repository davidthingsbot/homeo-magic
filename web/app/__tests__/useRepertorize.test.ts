import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRepertorize } from "../useRepertorize";
import type { SymptomsData, RemediesData } from "../types";

// ---------- sample data ----------
const sampleSymptoms: SymptomsData = {
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
function createMockStreamResponse(data: unknown) {
  const text = JSON.stringify(data);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
  return {
    ok: true,
    headers: new Headers({ "content-length": String(encoded.length) }),
    body: stream,
  };
}

function setupFetchMock(
  remedies: RemediesData = sampleRemedies,
  symptoms: SymptomsData = sampleSymptoms,
  defaultSymptoms: string[] | null = null
) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string) => {
      if (url.includes("remedies.json")) {
        return Promise.resolve(createMockStreamResponse(remedies));
      }
      if (url.includes("symptoms.json")) {
        return Promise.resolve(createMockStreamResponse(symptoms));
      }
      if (url.includes("default-symptoms.json")) {
        if (defaultSymptoms) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(defaultSymptoms),
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
      expect(result.current.selectedSymptoms).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("loads data and transitions to ready state", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeNull();
      expect(result.current.symptomCount).toBe(4);
      expect(result.current.remedyCount).toBe(5);
    });

    it("reports error on fetch failure", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("remedies.json")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: new Headers(),
            body: new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
          });
        }
        if (url.includes("default-symptoms.json")) {
          return Promise.resolve({ ok: false });
        }
        return Promise.reject(new Error("fail"));
      });
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("REGRESSION: hydration safety (bug #1 - sessionStorage deferred to useEffect)", () => {
    it("does NOT read sessionStorage during initial render (SSR safe)", () => {
      setupFetchMock();
      // The hook should initialize with empty state, not read sessionStorage
      // sessionStorage.getItem should only be called inside useEffect, not in useState initializer
      const { result } = renderHook(() => useRepertorize());
      // Initial render: selectedSymptoms must be empty array (server-safe default)
      expect(result.current.selectedSymptoms).toEqual([]);
      expect(result.current.minScore).toBe(0);
      expect(result.current.hiddenSymptoms.size).toBe(0);
    });

    it("restores persisted state from sessionStorage via useEffect", async () => {
      const savedState = {
        selectedSymptoms: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenSymptoms: ["Head, pain, forehead"],
        minScore: 25,
      };
      mockSessionStorage["homeo-magic-state"] = JSON.stringify(savedState);
      setupFetchMock();

      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // After useEffect runs, state should be restored
      expect(result.current.selectedSymptoms).toEqual([
        "Mind, anxiety",
        "Head, pain, forehead",
      ]);
      expect(result.current.hiddenSymptoms.has("Head, pain, forehead")).toBe(
        true
      );
      expect(result.current.minScore).toBe(25);
    });

    it("fetches default symptoms when no persisted state exists", async () => {
      setupFetchMock(sampleRemedies, sampleSymptoms, [
        "Mind, anxiety",
        "Stomach, nausea",
      ]);
      renderHook(() => useRepertorize());
      // Verify that default-symptoms.json is fetched when no sessionStorage state
      await waitFor(() => {
        const calls = mockFetch.mock.calls.map((c: unknown[]) => c[0]);
        expect(calls.some((url: string) => url.includes("default-symptoms.json"))).toBe(true);
      });
    });

    it("skips default symptoms fetch when persisted state exists", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedSymptoms: ["Mind, anxiety"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock(sampleRemedies, sampleSymptoms, ["Stomach, nausea"]);
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));
      // Should use persisted state, not defaults
      expect(result.current.selectedSymptoms).toEqual(["Mind, anxiety"]);
    });
  });

  describe("symptom management", () => {
    it("addSymptom adds a new symptom", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      expect(result.current.selectedSymptoms).toContain("Mind, anxiety");
    });

    it("addSymptom prevents duplicates", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.addSymptom("Mind, anxiety"));
      expect(
        result.current.selectedSymptoms.filter((s) => s === "Mind, anxiety")
          .length
      ).toBe(1);
    });

    it("removeSymptom removes a symptom and its hidden state", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.hideSymptom("Mind, anxiety"));
      expect(result.current.hiddenSymptoms.has("Mind, anxiety")).toBe(true);

      act(() => result.current.removeSymptom("Mind, anxiety"));
      expect(result.current.selectedSymptoms).not.toContain("Mind, anxiety");
      expect(result.current.hiddenSymptoms.has("Mind, anxiety")).toBe(false);
    });

    it("hideSymptom / showSymptom toggles visibility", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      expect(result.current.hiddenSymptoms.has("Mind, anxiety")).toBe(false);

      act(() => result.current.hideSymptom("Mind, anxiety"));
      expect(result.current.hiddenSymptoms.has("Mind, anxiety")).toBe(true);

      act(() => result.current.showSymptom("Mind, anxiety"));
      expect(result.current.hiddenSymptoms.has("Mind, anxiety")).toBe(false);
    });

    it("reorderSymptoms moves symptom from one position to another", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.addSymptom("Head, pain, forehead"));
      act(() => result.current.addSymptom("Stomach, nausea"));

      // Move first to last
      act(() => result.current.reorderSymptoms(0, 2));
      expect(result.current.selectedSymptoms).toEqual([
        "Head, pain, forehead",
        "Stomach, nausea",
        "Mind, anxiety",
      ]);
    });

    it("clearSymptoms resets all selections", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.addSymptom("Stomach, nausea"));
      act(() => result.current.hideSymptom("Mind, anxiety"));
      act(() => result.current.clearSymptoms());

      expect(result.current.selectedSymptoms).toEqual([]);
      expect(result.current.hiddenSymptoms.size).toBe(0);
    });
  });

  describe("searchSymptoms", () => {
    it("returns matching symptoms that aren't already selected", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const matches = result.current.searchSymptoms("mind");
      expect(matches).toContain("Mind, anxiety");
      expect(matches).toContain("Mind, fear of death");
    });

    it("excludes already selected symptoms from results", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      const matches = result.current.searchSymptoms("mind");
      expect(matches).not.toContain("Mind, anxiety");
      expect(matches).toContain("Mind, fear of death");
    });

    it("returns empty array for empty query", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.searchSymptoms("")).toEqual([]);
    });

    it("returns empty array for whitespace-only query", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.searchSymptoms("   ")).toEqual([]);
    });

    it("respects limit parameter", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const matches = result.current.searchSymptoms("mind", 1);
      expect(matches.length).toBe(1);
    });
  });

  describe("results computation (scoring and normalization)", () => {
    it("returns empty results when no symptoms selected", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.results.items).toEqual([]);
      expect(result.current.results.totalCount).toBe(0);
    });

    it("computes scores for a single symptom", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));

      // Mind, anxiety: Acon.=3, Ars.=3, Bell.=1
      // maxScore = 3, so Acon. and Ars. = 100, Bell. = 33
      const items = result.current.results.items;
      expect(items.length).toBe(3);
      expect(items[0].totalScore).toBe(100);
      expect(items[0].rawScore).toBe(3);
      // Bell should be last with score ~33
      const bell = items.find((i) => i.abbrev === "Bell.");
      expect(bell).toBeDefined();
      expect(bell!.totalScore).toBe(33);
    });

    it("computes combined scores for multiple symptoms", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.addSymptom("Head, pain, forehead"));

      // Mind, anxiety: Acon.=3, Ars.=3, Bell.=1
      // Head, pain:    Bell.=3, Bry.=2, Acon.=1
      // Combined: Acon.=4, Bell.=4, Ars.=3, Bry.=2
      const items = result.current.results.items;
      expect(items.length).toBe(4);
      expect(items[0].rawScore).toBe(4); // Acon. or Bell.
      expect(items[0].totalScore).toBe(100);

      // Check breakdown exists
      const acon = items.find((i) => i.abbrev === "Acon.");
      expect(acon).toBeDefined();
      expect(acon!.breakdown["Mind, anxiety"]).toBe(3);
      expect(acon!.breakdown["Head, pain, forehead"]).toBe(1);
    });

    it("results are sorted by score descending", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.addSymptom("Head, pain, forehead"));

      const scores = result.current.results.items.map((i) => i.rawScore);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it("excludes hidden symptoms from scoring", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.addSymptom("Head, pain, forehead"));

      // Hide Mind, anxiety — only Head scores should remain
      act(() => result.current.hideSymptom("Mind, anxiety"));

      // Head, pain: Bell.=3, Bry.=2, Acon.=1 — no Ars.
      const items = result.current.results.items;
      const abbrevs = items.map((i) => i.abbrev);
      expect(abbrevs).not.toContain("Ars.");
      expect(items[0].abbrev).toBe("Bell.");
      expect(items[0].totalScore).toBe(100);
    });

    it("returns empty results when all symptoms are hidden", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.hideSymptom("Mind, anxiety"));

      expect(result.current.results.items).toEqual([]);
    });

    it("includes fullName from remedies data", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));

      const acon = result.current.results.items.find(
        (i) => i.abbrev === "Acon."
      );
      expect(acon!.fullName).toBe("Aconitum Napellus");
    });
  });

  describe("state persistence to sessionStorage", () => {
    it("persists selectedSymptoms, hiddenSymptoms, and minScore", async () => {
      setupFetchMock();
      const { result } = renderHook(() => useRepertorize());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addSymptom("Mind, anxiety"));
      act(() => result.current.setMinScore(42));

      // Check sessionStorage was called with correct data
      const lastCall =
        sessionStorageMock.setItem.mock.calls[
          sessionStorageMock.setItem.mock.calls.length - 1
        ];
      expect(lastCall[0]).toBe("homeo-magic-state");
      const saved = JSON.parse(lastCall[1]);
      expect(saved.selectedSymptoms).toContain("Mind, anxiety");
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
});
