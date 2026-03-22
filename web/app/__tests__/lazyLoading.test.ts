import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * Tests for lazy loading of rubric and remedy data.
 *
 * The lazy loading hook fetches compact indexes on mount (symptom_pairs.json,
 * symptoms/index.json, remedies/index.json) and decodes rubric names client-side.
 * Full rubric data is fetched per body-system subcategory on demand.
 */

import { useLazyData } from "../useLazyData";

// ---------- mock data ----------

// Compact encoded index matching the split_rubrics.py format
const mockPairs = [
  "Abdomen, pain",
  "Head, pain",
  "Extremities, pain",
];
const mockEncodedIndex = [
  "0",            // "Abdomen, pain"
  "0:burning",    // "Abdomen, pain, burning"
  "1",            // "Head, pain"
  "1:forehead",   // "Head, pain, forehead"
  "2:foot",       // "Extremities, pain, foot"
];

const mockRemedyIndex = {
  "Acon.": "Aconitum Napellus",
  "Ars.": "Arsenicum Album",
  "Bell.": "Belladonna",
  "Bry.": "Bryonia Alba",
  "Nux-v.": "Nux Vomica",
  "Nat-m.": "Natrum Muriaticum",
};

const mockAbdomenPain = {
  "Abdomen, pain": {
    remedies: { "Acon.": 3, "Nux-v.": 2 },
  },
  "Abdomen, pain, burning": {
    remedies: { "Ars.": 3, "Bell.": 1 },
  },
};

const mockHeadPain = {
  "Head, pain": {
    remedies: { "Bell.": 3, "Bry.": 2 },
  },
  "Head, pain, forehead": {
    remedies: { "Bell.": 3, "Nat-m.": 2 },
  },
};

const mockRemedyDetail = {
  "Acon.": {
    fullName: "Aconitum Napellus",
    rubrics: ["Abdomen, pain", "Head, pain"],
    totalScore: 5202,
  },
};

// ---------- fetch tracking ----------

let fetchCalls: string[] = [];
const originalFetch = global.fetch;

function mockFetch(url: string): Promise<Response> {
  fetchCalls.push(url);

  let data: unknown;

  if (url.includes("symptom_pairs.json")) {
    data = mockPairs;
  } else if (url.includes("symptoms/index.json")) {
    data = mockEncodedIndex;
  } else if (url.includes("remedies/index.json")) {
    data = mockRemedyIndex;
  } else if (url.includes("symptoms/Abdomen/pain.json")) {
    data = mockAbdomenPain;
  } else if (url.includes("symptoms/Head/pain.json")) {
    data = mockHeadPain;
  } else if (url.includes("remedies/") && url.includes("Acon")) {
    data = mockRemedyDetail;
  } else {
    return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
  }

  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// ---------- setup ----------

beforeEach(() => {
  fetchCalls = [];
  global.fetch = vi.fn(mockFetch) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------- tests ----------

describe("Lazy loading", () => {
  // 1. Initial page load fetches only index files, not full data
  it("fetches only index files on initial load", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have fetched index files
    const indexFetches = fetchCalls.filter(
      (url) => url.includes("index.json") || url.includes("symptom_pairs.json")
    );
    expect(indexFetches.length).toBeGreaterThan(0);

    // Should NOT have fetched full rubric files
    const rubricDataFetches = fetchCalls.filter(
      (url) =>
        url.includes("symptoms/") &&
        !url.includes("index.json")
    );
    expect(rubricDataFetches).toHaveLength(0);

    // Should NOT have fetched individual remedy files
    const remedyDataFetches = fetchCalls.filter(
      (url) =>
        url.includes("remedies/") &&
        !url.includes("index.json")
    );
    expect(remedyDataFetches).toHaveLength(0);
  });

  // 2. Index decoding produces correct rubric names
  it("decodes compact index into full rubric names", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.rubricNames).toEqual([
      "Abdomen, pain",
      "Abdomen, pain, burning",
      "Head, pain",
      "Head, pain, forehead",
      "Extremities, pain, foot",
    ]);
  });

  // 3. Remedy index is loaded
  it("loads remedy index with abbreviation to name mapping", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.remedies).toBeDefined();
    expect(result.current.remedies!["Acon."]).toBe("Aconitum Napellus");
    expect(Object.keys(result.current.remedies!).length).toBe(6);
  });

  // 4. Selecting a rubric triggers fetch for body system subcategory
  it("fetches body system subcategory when rubric data requested", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    fetchCalls = []; // Reset to track only new fetches

    await act(async () => {
      await result.current.fetchRubricData("Abdomen, pain");
    });

    const abdomenFetches = fetchCalls.filter((url) =>
      url.toLowerCase().includes("abdomen")
    );
    expect(abdomenFetches.length).toBeGreaterThan(0);
  });

  // 5. Previously fetched data is cached (no duplicate fetches)
  it("caches fetched data and does not re-fetch", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // First fetch
    await act(async () => {
      await result.current.fetchRubricData("Abdomen, pain");
    });

    const firstFetchCount = fetchCalls.filter((url) =>
      url.toLowerCase().includes("abdomen")
    ).length;

    // Second fetch — should use cache
    await act(async () => {
      await result.current.fetchRubricData("Abdomen, pain");
    });

    const secondFetchCount = fetchCalls.filter((url) =>
      url.toLowerCase().includes("abdomen")
    ).length;

    // Should not have made additional network requests
    expect(secondFetchCount).toBe(firstFetchCount);
  });

  // 6. App works correctly with data arriving incrementally
  it("provides rubric data incrementally as body systems are loaded", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Initially no rubric detail data loaded
    expect(result.current.rubricData["Abdomen, pain"]).toBeUndefined();

    // Load abdomen data
    await act(async () => {
      await result.current.fetchRubricData("Abdomen, pain");
    });

    // Now abdomen rubrics should be available
    const abdomenData = result.current.rubricData["Abdomen, pain"];
    expect(abdomenData).toBeDefined();
    expect(abdomenData?.remedies).toBeDefined();
    expect(abdomenData?.remedies["Acon."]).toBe(3);

    // Head data still not available
    expect(result.current.rubricData["Head, pain"]).toBeUndefined();

    // Load head data
    await act(async () => {
      await result.current.fetchRubricData("Head, pain");
    });

    // Now both are available
    expect(result.current.rubricData["Head, pain"]).toBeDefined();
    expect(result.current.rubricData["Abdomen, pain"]).toBeDefined();
  });

  // 7. Repertorization results identical with lazy-loaded vs monolithic data
  it("produces correct repertorization with lazy-loaded data", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Load needed body systems
    await act(async () => {
      await result.current.fetchRubricData("Abdomen, pain");
      await result.current.fetchRubricData("Head, pain");
    });

    // Get rubric data for repertorization
    const abdomenPain = result.current.rubricData["Abdomen, pain"];
    const headPain = result.current.rubricData["Head, pain"];

    expect(abdomenPain).toBeDefined();
    expect(headPain).toBeDefined();

    // Verify the data matches what we'd expect from the monolithic file
    expect(abdomenPain!.remedies["Acon."]).toBe(3);
    expect(abdomenPain!.remedies["Nux-v."]).toBe(2);
    expect(headPain!.remedies["Bell."]).toBe(3);
    expect(headPain!.remedies["Bry."]).toBe(2);
  });

  // 8. fetchMultipleRubricData deduplicates by file
  it("deduplicates fetches when loading multiple rubrics from same file", async () => {
    const { result } = renderHook(() => useLazyData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    fetchCalls = [];

    // Both "Abdomen, pain" and "Abdomen, pain, burning" are in the same file
    await act(async () => {
      await result.current.fetchMultipleRubricData([
        "Abdomen, pain",
        "Abdomen, pain, burning",
      ]);
    });

    const abdomenFetches = fetchCalls.filter((url) =>
      url.toLowerCase().includes("abdomen")
    );
    // Should only fetch once since both are in Abdomen/pain.json
    expect(abdomenFetches.length).toBe(1);

    // Both rubrics should be available
    expect(result.current.rubricData["Abdomen, pain"]).toBeDefined();
    expect(result.current.rubricData["Abdomen, pain, burning"]).toBeDefined();
  });
});
