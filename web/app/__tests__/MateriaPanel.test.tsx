import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MateriaPanel, resetMateriaCache } from "../MateriaPanel";
import type { ProfilesData, SymptomIndexData } from "../types";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const sampleProfiles: ProfilesData = {
  "Acon.": {
    remedy: "Aconitum Napellus",
    abbreviations: ["Acon."],
    file: "aconitum_napellus.md",
    total_symptoms_in_repertory: 5202,
    personality:
      "A vigorous, plethoric, robust individual with strong vitality.",
    mental_state:
      "The mind is dominated by intense nervous irritation and excitement.",
    emotional_pattern:
      "The core emotional state is extreme fear and anguish.",
  },
  "Bell.": {
    remedy: "Belladonna",
    abbreviations: ["Bell."],
    file: "belladonna.md",
    total_symptoms_in_repertory: 8000,
    personality: "Hot, red, throbbing constitution.",
    mental_state: "Delirium with violence and rage.",
    emotional_pattern: "Sudden intense emotions with heat.",
  },
};

const sampleSymptomIndex: SymptomIndexData = {
  "Acon.": {
    Mind: "The patient feels the violence of his sickness, with great nervous irritation.",
    "Mind, irritability":
      "There is moaning and irritability, anger, throwing things away.",
    Head: "Violent headache over the eyes with congestion.",
  },
  "Bell.": {
    Mind: "Delirium, sees ghosts and frightful visions.",
    Head: "Throbbing, pulsating headache worse from light and noise.",
  },
};

function mockFetchResponses(
  profiles: ProfilesData | null,
  symptomIndex: SymptomIndexData | null
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("profiles.json")) {
      if (!profiles) return Promise.reject(new Error("Not found"));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(profiles),
      });
    }
    if (url.includes("symptom_index.json")) {
      if (!symptomIndex) return Promise.reject(new Error("Not found"));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(symptomIndex),
      });
    }
    if (url.includes("archive_links.json") || url.includes("passage_index.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }
    return Promise.reject(new Error("Unknown URL"));
  });
}

describe("MateriaPanel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetMateriaCache();
  });

  it("renders loading state initially", () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={["Mind", "Head"]} />
    );
    expect(screen.getByText(/loading materia medica/i)).toBeInTheDocument();
  });

  it("renders symptom cross-references for selected symptoms", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={["Mind", "Head"]} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/symptom cross-references/i)
      ).toBeInTheDocument();
    });

    // Check symptom names are shown in bold context
    expect(screen.getByText("Mind")).toBeInTheDocument();
    expect(screen.getByText("Head")).toBeInTheDocument();

    // Check Kent quotes are rendered
    expect(
      screen.getByText(
        /The patient feels the violence of his sickness/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Violent headache over the eyes/)
    ).toBeInTheDocument();
  });

  it("shows fallback when no symptom passage exists", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel
        remedyAbbrev="Acon."
        selectedSymptoms={["Mind", "Stomach"]}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/symptom cross-references/i)
      ).toBeInTheDocument();
    });

    // "Mind" has a passage, "Stomach" does not for Acon.
    expect(
      screen.getByText(/The patient feels the violence/)
    ).toBeInTheDocument();
    expect(screen.getByText(/no specific passage found/i)).toBeInTheDocument();
  });

  it("renders constitutional profile section", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={["Mind"]} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/constitutional profile/i)
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/A vigorous, plethoric, robust individual/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The mind is dominated by intense nervous irritation/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The core emotional state is extreme fear/)
    ).toBeInTheDocument();
  });

  it("renders book link section", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={[]} />
    );

    await waitFor(() => {
      expect(screen.getByText(/full book text/i)).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /read full kent/i });
    expect(link).toHaveAttribute(
      "href",
      "/remedy/aconitum_napellus"
    );
  });

  it("shows fallback when no materia data exists for remedy", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel
        remedyAbbrev="Unknown."
        selectedSymptoms={["Mind"]}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/no materia medica data available/i)
      ).toBeInTheDocument();
    });
  });

  it("handles fetch errors gracefully", async () => {
    mockFetchResponses(null, null);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={["Mind"]} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/no materia medica data available/i)
      ).toBeInTheDocument();
    });
  });

  it("renders symptom cross-references before constitutional profile", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={["Mind"]} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/symptom cross-references/i)
      ).toBeInTheDocument();
    });

    const sections = screen.getAllByRole("heading", { level: 3 });
    const sectionTexts = sections.map((s) => s.textContent);
    const crossRefIdx = sectionTexts.findIndex((t) =>
      t?.match(/symptom cross-references/i)
    );
    const profileIdx = sectionTexts.findIndex((t) =>
      t?.match(/constitutional profile/i)
    );
    const bookIdx = sectionTexts.findIndex((t) =>
      t?.match(/full book text/i)
    );

    expect(crossRefIdx).toBeLessThan(profileIdx);
    expect(profileIdx).toBeLessThan(bookIdx);
  });

  it("shows no cross-references section when no symptoms selected", async () => {
    mockFetchResponses(sampleProfiles, sampleSymptomIndex);
    render(
      <MateriaPanel remedyAbbrev="Acon." selectedSymptoms={[]} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/constitutional profile/i)
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/symptom cross-references/i)
    ).not.toBeInTheDocument();
  });
});
