import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../page";
import type { RubricsData, RemediesData } from "../types";

// ---------- sample data ----------
const sampleRubrics: RubricsData = {
  "Mind, anxiety": {
    remedies: { "Acon.": 3, "Ars.": 2 },
  },
  "Head, pain, forehead": {
    remedies: { "Bell.": 3, "Acon.": 1 },
  },
  "Stomach, nausea": {
    remedies: { "Nux-v.": 3 },
  },
};

const sampleRemedies: RemediesData = {
  "Acon.": "Aconitum Napellus",
  "Ars.": "Arsenicum Album",
  "Bell.": "Belladonna",
  "Nux-v.": "Nux Vomica",
};

// Lazy loading index data
const samplePairs = ["Mind, anxiety", "Head, pain", "Stomach, nausea"];
const sampleEncoded = [
  "0",            // "Mind, anxiety"
  "1:forehead",   // "Head, pain, forehead"
  "2",            // "Stomach, nausea"
];

// Split rubric files
const mindAnxietyFile: RubricsData = {
  "Mind, anxiety": sampleRubrics["Mind, anxiety"],
};
const headPainFile: RubricsData = {
  "Head, pain, forehead": sampleRubrics["Head, pain, forehead"],
};
const stomachNauseaFile: RubricsData = {
  "Stomach, nausea": sampleRubrics["Stomach, nausea"],
};

// ---------- mock fetch ----------
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock MateriaPanel to avoid its own fetch calls
vi.mock("../MateriaPanel", () => ({
  MateriaPanel: ({ remedyAbbrev }: { remedyAbbrev: string }) => (
    <div data-testid="materia-panel">{remedyAbbrev}</div>
  ),
}));

function setupFetchMock() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("rubric_pairs.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(samplePairs),
      });
    }
    if (url.includes("rubrics/index.json")) {
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
    if (url.includes("rubrics/Mind/anxiety.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mindAnxietyFile),
      });
    }
    if (url.includes("rubrics/Head/pain.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(headPainFile),
      });
    }
    if (url.includes("rubrics/Stomach/nausea.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(stomachNauseaFile),
      });
    }
    if (url.includes("default-rubrics.json")) {
      return Promise.resolve({ ok: false });
    }
    if (url.includes("profiles.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }
    if (url.includes("passage_index.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

// ---------- mock sessionStorage/localStorage ----------
const mockSessionStorage: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    mockSessionStorage[key] = val;
  }),
  removeItem: vi.fn(),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockSessionStorage)) delete mockSessionStorage[key];
  }),
  get length() { return Object.keys(mockSessionStorage).length; },
  key: vi.fn(() => null),
};

const mockLocalStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    mockLocalStorage[key] = val;
  }),
  removeItem: vi.fn(),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockLocalStorage)) delete mockLocalStorage[key];
  }),
  get length() { return Object.keys(mockLocalStorage).length; },
  key: vi.fn(() => null),
};

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorageMock.clear();
  localStorageMock.clear();
  Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock, writable: true });
  Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- tests ----------
describe("Home page", () => {
  describe("initial render and loading", () => {
    it("shows loading state initially", () => {
      setupFetchMock();
      render(<Home />);
      expect(screen.getByText("Homeo-Magic")).toBeInTheDocument();
    });

    it("shows rubric/remedy counts after loading", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() => {
        expect(screen.getByText(/3 rubrics/)).toBeInTheDocument();
        expect(screen.getByText(/4 remedies/)).toBeInTheDocument();
      });
    });

    it("shows empty state when no rubrics selected", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() =>
        expect(
          screen.getByText(/Search and select rubrics above/)
        ).toBeInTheDocument()
      );
    });
  });

  describe("REGRESSION: hydration safety - useColorScale (bug #1)", () => {
    it("does NOT read localStorage during initial render", () => {
      setupFetchMock();
      render(<Home />);
      expect(screen.getByText("Homeo-Magic")).toBeInTheDocument();
    });

    it("reads color scale from localStorage via useEffect", async () => {
      mockLocalStorage["homeo-magic-color-scale"] = JSON.stringify({
        scale: ["#ff0000", "#00ff00", "#0000ff"],
        mode: "lab",
      });
      setupFetchMock();
      render(<Home />);
      await waitFor(() => {
        expect(localStorageMock.getItem).toHaveBeenCalledWith(
          "homeo-magic-color-scale"
        );
      });
    });
  });

  describe("REGRESSION: hover state for action icons (bug #2)", () => {
    it("shows action icons on row hover via React state (not CSS)", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      // Wait for lazy-loaded rubric data to arrive and results to render
      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );
      // Wait for results table (scores computed after lazy fetch)
      await waitFor(() =>
        expect(screen.getByText(/Showing.*remedies/)).toBeInTheDocument()
      );

      const symText = screen.getByText("Mind, anxiety");
      const row = symText.closest("tr");
      expect(row).toBeTruthy();

      const trashButtons = row!.querySelectorAll('button[title="Remove rubric"]');
      expect(trashButtons.length).toBe(1);
      expect(trashButtons[0]).toHaveStyle({ opacity: "0" });

      fireEvent.mouseEnter(row!);

      await waitFor(() => {
        expect(trashButtons[0]).toHaveStyle({ opacity: "1" });
      });

      fireEvent.mouseLeave(row!);
      await waitFor(() => {
        expect(trashButtons[0]).toHaveStyle({ opacity: "0" });
      });
    });

    it("shows drag handle on hover via inline style, not CSS class", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );
      await waitFor(() =>
        expect(screen.getByText(/Showing.*remedies/)).toBeInTheDocument()
      );

      const dragHandle = screen.getByTitle("Drag to reorder");
      expect(dragHandle).toHaveStyle({ opacity: "0" });

      const row = dragHandle.closest("tr");
      fireEvent.mouseEnter(row!);
      await waitFor(() => {
        expect(dragHandle).toHaveStyle({ opacity: "1" });
      });
    });

    it("shows eye icon on hover via inline style", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );
      await waitFor(() =>
        expect(screen.getByText(/Showing.*remedies/)).toBeInTheDocument()
      );

      const eyeButton = screen.getByTitle("Hide rubric");
      expect(eyeButton).toHaveStyle({ opacity: "0" });

      const row = eyeButton.closest("tr");
      fireEvent.mouseEnter(row!);
      await waitFor(() => {
        expect(eyeButton).toHaveStyle({ opacity: "1" });
      });
    });
  });

  describe("REGRESSION: tooltip fixed positioning (bug #3)", () => {
    it("renders remedy tooltip with fixed positioning to avoid clipping", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText(/Showing.*remedies/)).toBeInTheDocument()
      );

      const remedyHeaders = screen.getAllByText("Acon.");
      const headerTh = remedyHeaders[0].closest("th");
      expect(headerTh).toBeTruthy();

      headerTh!.getBoundingClientRect = () => ({
        left: 100,
        top: 200,
        right: 150,
        bottom: 250,
        width: 50,
        height: 50,
        x: 100,
        y: 200,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(headerTh!);

      await waitFor(() => {
        const tooltip = document.querySelector(".fixed.z-50");
        expect(tooltip).toBeTruthy();
        expect(tooltip).toHaveStyle({
          transform: "translate(-50%, -100%)",
        });
      });

      const matches = screen.getAllByText("Aconitum Napellus");
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("search and suggestion dropdown", () => {
    it("shows suggestions when typing 2+ characters", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() =>
        expect(screen.getByText(/3 rubrics/)).toBeInTheDocument()
      );

      const input = screen.getByPlaceholderText(/Type to search/);
      fireEvent.change(input, { target: { value: "mind" } });
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText(/anxiety/)).toBeInTheDocument();
      });
    });

    it("does not show suggestions for single character", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() =>
        expect(screen.getByText(/3 rubrics/)).toBeInTheDocument()
      );

      const input = screen.getByPlaceholderText(/Type to search/);
      fireEvent.change(input, { target: { value: "m" } });

      expect(screen.queryByText("Mind, anxiety")).not.toBeInTheDocument();
    });

    it("disables search input while loading", () => {
      setupFetchMock();
      render(<Home />);
      const input = screen.getByPlaceholderText(/Type to search/);
      expect(input).toBeDisabled();
    });
  });

  describe("HighlightMatch component", () => {
    it("highlights matching text in suggestions", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() =>
        expect(screen.getByText(/3 rubrics/)).toBeInTheDocument()
      );

      const input = screen.getByPlaceholderText(/Type to search/);
      fireEvent.change(input, { target: { value: "anx" } });
      fireEvent.focus(input);

      await waitFor(() => {
        const mark = document.querySelector("mark");
        expect(mark).toBeTruthy();
        expect(mark!.textContent).toBe("anx");
      });
    });
  });

  describe("rubric row interactions", () => {
    it("removes a rubric when trash icon is clicked", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      const row = screen.getByText("Mind, anxiety").closest("tr");
      fireEvent.mouseEnter(row!);

      const trashButtons = row!.querySelectorAll('button[title="Remove rubric"]');
      fireEvent.click(trashButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText("Mind, anxiety")).not.toBeInTheDocument();
      });
    });

    it("hides a rubric when eye icon is clicked", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      const row = screen.getByText("Mind, anxiety").closest("tr");
      fireEvent.mouseEnter(row!);

      const eyeButton = row!.querySelector('button[title="Hide rubric"]')!;
      fireEvent.click(eyeButton);

      await waitFor(() => {
        expect(row).toHaveStyle({ opacity: "0.4" });
      });
    });
  });

  describe("clear all rubrics", () => {
    it("shows clear button with count when rubrics are selected", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() => {
        const clearBtn = screen.getByTestId("clear-all-rubrics");
        expect(clearBtn).toBeInTheDocument();
        expect(clearBtn).toHaveTextContent("Clear All (2)");
      });
    });

    it("does not show clear button when no rubrics selected", async () => {
      setupFetchMock();
      render(<Home />);

      await waitFor(() => {
        expect(screen.queryByTestId("clear-all-rubrics")).not.toBeInTheDocument();
      });
    });

    it("removes all rubrics and clears sessionStorage when clicked", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedRubrics: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenRubrics: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByTestId("clear-all-rubrics")).toBeInTheDocument()
      );

      fireEvent.click(screen.getByTestId("clear-all-rubrics"));

      // Confirmation dialog appears — click the confirm "Clear All" button
      await waitFor(() =>
        expect(screen.getByText(/Clear all rubrics\?/)).toBeInTheDocument()
      );
      const confirmBtn = screen.getAllByText("Clear All").find(
        (el) => el.tagName === "BUTTON" && !el.closest("[data-testid='clear-all-rubrics']")
      )!;
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.queryByText("Mind, anxiety")).not.toBeInTheDocument();
        expect(screen.queryByText("Head, pain, forehead")).not.toBeInTheDocument();
        expect(screen.queryByTestId("clear-all-rubrics")).not.toBeInTheDocument();
      });
    });
  });

  describe("settings link", () => {
    it("renders settings link pointing to settings.html", async () => {
      setupFetchMock();
      render(<Home />);
      const settingsLink = screen.getByText("Color Settings");
      expect(settingsLink.closest("a")).toHaveAttribute("href", "settings.html");
    });
  });
});
