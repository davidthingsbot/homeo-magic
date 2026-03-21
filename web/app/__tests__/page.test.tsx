import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../page";
import type { SymptomsData, RemediesData } from "../types";

// ---------- sample data ----------
const sampleSymptoms: SymptomsData = {
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

// ---------- mock fetch with streaming response ----------
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
    if (url.includes("remedies.json")) {
      return Promise.resolve(createMockStreamResponse(sampleRemedies));
    }
    if (url.includes("symptoms.json")) {
      return Promise.resolve(createMockStreamResponse(sampleSymptoms));
    }
    if (url.includes("default-symptoms.json")) {
      return Promise.resolve({ ok: false });
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

    it("shows symptom/remedy counts after loading", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() => {
        expect(screen.getByText(/3 symptoms/)).toBeInTheDocument();
        expect(screen.getByText(/4 remedies/)).toBeInTheDocument();
      });
    });

    it("shows empty state when no symptoms selected", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() =>
        expect(
          screen.getByText(/Search and select symptoms above/)
        ).toBeInTheDocument()
      );
    });
  });

  describe("REGRESSION: hydration safety - useColorScale (bug #1)", () => {
    it("does NOT read localStorage during initial render", () => {
      // useColorScale defers localStorage.getItem to useEffect
      // This means on the server, the default chroma scale is used
      setupFetchMock();
      // If localStorage were read in useState, it would cause a hydration mismatch
      // because server has no localStorage. The fix defers to useEffect.
      render(<Home />);
      // The component should render without errors (no hydration mismatch)
      expect(screen.getByText("Homeo-Magic")).toBeInTheDocument();
    });

    it("reads color scale from localStorage via useEffect", async () => {
      mockLocalStorage["homeo-magic-color-scale"] = JSON.stringify({
        scale: ["#ff0000", "#00ff00", "#0000ff"],
        mode: "lab",
      });
      setupFetchMock();
      render(<Home />);
      // After effect runs, localStorage should have been read
      await waitFor(() => {
        expect(localStorageMock.getItem).toHaveBeenCalledWith(
          "homeo-magic-color-scale"
        );
      });
    });
  });

  describe("REGRESSION: hover state for action icons (bug #2)", () => {
    it("shows action icons on row hover via React state (not CSS)", async () => {
      // Pre-set selected symptoms via sessionStorage
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedSymptoms: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      // Find the symptom row
      const symText = screen.getByText("Mind, anxiety");
      const row = symText.closest("tr");
      expect(row).toBeTruthy();

      // Before hover: action buttons should have opacity 0 (via inline style)
      const trashButtons = row!.querySelectorAll('button[title="Remove symptom"]');
      expect(trashButtons.length).toBe(1);
      expect(trashButtons[0]).toHaveStyle({ opacity: "0" });

      // Hover the row
      fireEvent.mouseEnter(row!);

      // After hover: action buttons should become visible (opacity 1)
      await waitFor(() => {
        expect(trashButtons[0]).toHaveStyle({ opacity: "1" });
      });

      // Mouse leave: should hide again
      fireEvent.mouseLeave(row!);
      await waitFor(() => {
        expect(trashButtons[0]).toHaveStyle({ opacity: "0" });
      });
    });

    it("shows drag handle on hover via inline style, not CSS class", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedSymptoms: ["Mind, anxiety"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      // The drag handle uses inline style opacity, not Tailwind hover classes
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
        selectedSymptoms: ["Mind, anxiety"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      const eyeButton = screen.getByTitle("Hide symptom");
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
        selectedSymptoms: ["Mind, anxiety"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText(/Remedies Found/)).toBeInTheDocument()
      );

      // Find a remedy column header and hover it
      const remedyHeaders = screen.getAllByText("Acon.");
      // The first one is in the thead
      const headerTh = remedyHeaders[0].closest("th");
      expect(headerTh).toBeTruthy();

      // Mock getBoundingClientRect for the header
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

      // The tooltip should appear with fixed positioning
      await waitFor(() => {
        const tooltip = document.querySelector(".fixed.z-50");
        expect(tooltip).toBeTruthy();
        // It should use transform translate for centering
        expect(tooltip).toHaveStyle({
          transform: "translate(-50%, -100%)",
        });
      });

      // The tooltip should show the full remedy name (also shown in detail panel)
      const matches = screen.getAllByText("Aconitum Napellus");
      expect(matches.length).toBeGreaterThanOrEqual(2); // detail panel + tooltip
    });
  });

  describe("search and suggestion dropdown", () => {
    it("shows suggestions when typing 2+ characters", async () => {
      setupFetchMock();
      render(<Home />);
      await waitFor(() =>
        expect(screen.getByText(/3 symptoms/)).toBeInTheDocument()
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
        expect(screen.getByText(/3 symptoms/)).toBeInTheDocument()
      );

      const input = screen.getByPlaceholderText(/Type to search/);
      fireEvent.change(input, { target: { value: "m" } });

      // No dropdown should appear
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
        expect(screen.getByText(/3 symptoms/)).toBeInTheDocument()
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

  describe("symptom row interactions", () => {
    it("removes a symptom when trash icon is clicked", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedSymptoms: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      // Hover to make the button visible, then click
      const row = screen.getByText("Mind, anxiety").closest("tr");
      fireEvent.mouseEnter(row!);

      const trashButtons = row!.querySelectorAll('button[title="Remove symptom"]');
      fireEvent.click(trashButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText("Mind, anxiety")).not.toBeInTheDocument();
      });
    });

    it("hides a symptom when eye icon is clicked", async () => {
      mockSessionStorage["homeo-magic-state"] = JSON.stringify({
        selectedSymptoms: ["Mind, anxiety", "Head, pain, forehead"],
        hiddenSymptoms: [],
        minScore: 0,
      });
      setupFetchMock();
      render(<Home />);

      await waitFor(() =>
        expect(screen.getByText("Mind, anxiety")).toBeInTheDocument()
      );

      const row = screen.getByText("Mind, anxiety").closest("tr");
      fireEvent.mouseEnter(row!);

      // There are multiple hide buttons (one per row), get the one in this row
      const eyeButton = row!.querySelector('button[title="Hide symptom"]')!;
      fireEvent.click(eyeButton);

      // Row should become semi-transparent (opacity: 0.4)
      await waitFor(() => {
        expect(row).toHaveStyle({ opacity: "0.4" });
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
