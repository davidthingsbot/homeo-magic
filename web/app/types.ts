// Rubric data structure from symptoms.json
export interface RubricsData {
  [rubricName: string]: {
    remedies: {
      [remedyAbbrev: string]: number; // weight 1-3
    };
  };
}

// Remedies data structure from remedies.json
export interface RemediesData {
  [abbrev: string]: string; // full name
}

// Materia medica profile from profiles.json
export interface MateriaProfile {
  remedy: string;
  abbreviations: string[];
  file: string;
  total_rubrics_in_repertory: number;
  personality: string;
  mental_state: string;
  emotional_pattern: string;
}

export type ProfilesData = Record<string, MateriaProfile>;

// Rubric index from rubric_index.json - remedy abbrev -> rubric path -> Kent quote
export type RubricIndexData = Record<string, Record<string, string>>;

// Result of repertorization
export interface RepertoResult {
  abbrev: string;
  fullName: string;
  totalScore: number; // normalized 0-100
  rawScore: number; // actual sum of grades
  breakdown: {
    [rubric: string]: number;
  };
}
