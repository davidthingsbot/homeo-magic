#!/usr/bin/env python3
"""
Tests for processed materia medica output (batch processing results).
Validates profiles, symptom passages, and data integrity.
Run with: python3 -m pytest test-materia-processed.py -v
"""

import json
import pytest
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data" / "kent" / "materia_medica"
PROCESSED_DIR = DATA_DIR / "processed"
REMEDIES_PATH = Path(__file__).parent / "data" / "remedies.json"


# --- Fixtures ---

@pytest.fixture(scope="module")
def all_results():
    """Load all batch results into a single list."""
    results = []
    for i in range(10):
        batch_file = PROCESSED_DIR / f"batch_{i}.json"
        with open(batch_file) as f:
            results.extend(json.load(f))
    return results


@pytest.fixture(scope="module")
def remedies_db():
    with open(REMEDIES_PATH) as f:
        return json.load(f)


# --- Batch File Tests ---

class TestBatchFiles:
    """Test that all batch files exist and are valid JSON."""

    def test_all_10_batches_exist(self):
        for i in range(10):
            assert (PROCESSED_DIR / f"batch_{i}.json").exists(), f"batch_{i}.json missing"

    def test_all_batches_valid_json(self):
        for i in range(10):
            with open(PROCESSED_DIR / f"batch_{i}.json") as f:
                data = json.load(f)
            assert isinstance(data, list), f"batch_{i}.json is not a list"
            assert len(data) > 0, f"batch_{i}.json is empty"

    def test_total_remedy_count(self, all_results):
        assert len(all_results) == 174, f"Expected 174 remedies, got {len(all_results)}"

    def test_no_errors(self, all_results):
        errors = [r for r in all_results if "error" in r and "profile" not in r]
        assert len(errors) == 0, f"Found {len(errors)} errors: {[r['remedy'] for r in errors]}"


# --- Remedy Structure Tests ---

class TestRemedyStructure:
    """Test that each remedy result has the required fields."""

    def test_all_have_remedy_name(self, all_results):
        for r in all_results:
            assert "remedy" in r, f"Missing 'remedy' field"
            assert len(r["remedy"]) > 0, f"Empty remedy name"

    def test_all_have_abbreviations(self, all_results):
        for r in all_results:
            assert "abbreviations" in r, f"{r['remedy']} missing abbreviations"
            assert isinstance(r["abbreviations"], list)

    def test_all_have_file_reference(self, all_results):
        for r in all_results:
            assert "file" in r, f"{r['remedy']} missing file reference"
            assert r["file"].endswith(".md")

    def test_no_duplicate_remedies(self, all_results):
        names = [r["remedy"] for r in all_results]
        dupes = [n for n in names if names.count(n) > 1]
        assert len(dupes) == 0, f"Duplicate remedies: {set(dupes)}"

    def test_markdown_files_exist(self, all_results):
        md_dir = DATA_DIR / "remedy_markdown"
        for r in all_results:
            md_file = md_dir / r["file"]
            assert md_file.exists(), f"Markdown file missing: {r['file']}"


# --- Profile Tests ---

class TestProfiles:
    """Test constitutional profile quality."""

    def test_all_have_profiles(self, all_results):
        for r in all_results:
            assert "profile" in r, f"{r['remedy']} missing profile"

    def test_profiles_have_personality(self, all_results):
        for r in all_results:
            profile = r.get("profile", {})
            assert "personality" in profile, f"{r['remedy']} profile missing personality"
            assert len(profile["personality"]) > 20, f"{r['remedy']} personality too short"

    def test_profiles_have_mental_state(self, all_results):
        for r in all_results:
            profile = r.get("profile", {})
            assert "mental_state" in profile, f"{r['remedy']} profile missing mental_state"
            assert len(profile["mental_state"]) > 20, f"{r['remedy']} mental_state too short"

    def test_profiles_have_emotional_pattern(self, all_results):
        for r in all_results:
            profile = r.get("profile", {})
            assert "emotional_pattern" in profile, f"{r['remedy']} profile missing emotional_pattern"
            assert len(profile["emotional_pattern"]) > 20, f"{r['remedy']} emotional_pattern too short"

    def test_profiles_no_errors(self, all_results):
        profile_errors = [r["remedy"] for r in all_results if "error" in r.get("profile", {})]
        assert len(profile_errors) == 0, f"Profile errors: {profile_errors}"

    def test_known_remedy_profile_quality(self, all_results):
        """Spot check: Pulsatilla should mention gentle/tearful/yielding."""
        puls = next((r for r in all_results if "Pulsatilla" in r["remedy"]), None)
        if puls:
            personality = puls["profile"]["personality"].lower()
            assert any(w in personality for w in ["gentle", "tearful", "mild", "yielding"]), \
                f"Pulsatilla profile doesn't mention key traits: {personality}"


# --- Symptom Passage Tests ---

class TestSymptomPassages:
    """Test symptom-passage cross-references."""

    def test_all_have_symptom_passages(self, all_results):
        for r in all_results:
            assert "symptom_passages" in r, f"{r['remedy']} missing symptom_passages"
            assert isinstance(r["symptom_passages"], dict)

    def test_passages_are_strings(self, all_results):
        for r in all_results:
            for symptom, passage in r.get("symptom_passages", {}).items():
                assert isinstance(symptom, str), f"{r['remedy']}: symptom key not string"
                assert isinstance(passage, str), f"{r['remedy']}: passage not string for {symptom}"

    def test_passages_have_content(self, all_results):
        """Each passage should be more than just a few words."""
        short_count = 0
        total = 0
        for r in all_results:
            for symptom, passage in r.get("symptom_passages", {}).items():
                total += 1
                if len(passage) < 10:
                    short_count += 1
        # Allow some "no passage found" entries but not too many
        assert short_count / max(total, 1) < 0.3, \
            f"Too many short/empty passages: {short_count}/{total}"

    def test_major_remedies_have_many_passages(self, all_results):
        """Major remedies should have substantial passage counts."""
        for name in ["Nux Vomica", "Sulphur", "Pulsatilla"]:
            remedy = next((r for r in all_results if name in r["remedy"]), None)
            if remedy:
                count = len(remedy["symptom_passages"])
                assert count >= 10, f"{name} only has {count} passages, expected 10+"

    def test_symptom_paths_match_repertory_format(self, all_results):
        """Symptom keys should look like repertory paths (comma-separated)."""
        sample = all_results[0]
        for symptom in list(sample.get("symptom_passages", {}).keys())[:5]:
            assert "," in symptom or len(symptom.split()) <= 3, \
                f"Symptom key doesn't look like a repertory path: {symptom}"


# --- Cross-Reference Integrity Tests ---

class TestCrossReferenceIntegrity:
    """Test that processed data is consistent with source data."""

    def test_abbreviations_exist_in_remedies_db(self, all_results, remedies_db):
        """Each abbreviation should exist in the remedies database."""
        missing = []
        for r in all_results:
            for abbrev in r.get("abbreviations", []):
                if abbrev not in remedies_db:
                    missing.append((r["remedy"], abbrev))
        # Some Kent remedy names may not match exactly; allow a small margin
        assert len(missing) / max(len(all_results), 1) < 0.15, \
            f"Too many unmatched abbreviations: {missing[:10]}"

    def test_total_symptom_count_reasonable(self, all_results):
        """Total symptoms referenced should be substantial."""
        total_symptoms = sum(
            r.get("total_symptoms_in_repertory", 0) for r in all_results
        )
        assert total_symptoms > 10000, \
            f"Total symptom references seem low: {total_symptoms}"


# --- Merge Readiness Tests ---

class TestMergeReadiness:
    """Tests that verify data is ready to be merged into unified index files."""

    def test_profiles_json_assemblable(self, all_results):
        """Should be able to build a profiles.json from the data."""
        profiles = {}
        for r in all_results:
            if r.get("abbreviations"):
                key = r["abbreviations"][0]
                profiles[key] = r.get("profile", {})
        assert len(profiles) > 100, f"Only {len(profiles)} profiles assemblable"

    def test_symptom_index_assemblable(self, all_results):
        """Should be able to build a symptom_index.json from the data."""
        index = {}
        for r in all_results:
            if r.get("abbreviations") and r.get("symptom_passages"):
                key = r["abbreviations"][0]
                index[key] = r["symptom_passages"]
        assert len(index) > 100, f"Only {len(index)} index entries assemblable"
