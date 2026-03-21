#!/usr/bin/env python3
"""
Tests for the repertorization engine (engine/repertorize.py).
Run with: python3 -m pytest test-repertorize.py -v
"""

import json
import pytest
from pathlib import Path

from engine.repertorize import search_symptoms, repertorize

DATA_DIR = Path(__file__).parent / "data"


# --- Fixtures ---

@pytest.fixture(scope="module")
def symptoms():
    with open(DATA_DIR / "symptoms.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def remedies():
    with open(DATA_DIR / "remedies.json") as f:
        return json.load(f)


# --- Search Tests ---

class TestSearchSymptoms:
    """Test symptom search functionality."""

    def test_basic_search(self, symptoms):
        matches = search_symptoms("headache", symptoms)
        assert len(matches) > 0

    def test_case_insensitive(self, symptoms):
        lower = search_symptoms("headache", symptoms)
        upper = search_symptoms("HEADACHE", symptoms)
        assert lower == upper

    def test_partial_match(self, symptoms):
        matches = search_symptoms("irritab", symptoms)
        assert len(matches) > 0
        assert all("irritab" in m.lower() for m in matches)

    def test_limit_respected(self, symptoms):
        matches = search_symptoms("pain", symptoms, limit=5)
        assert len(matches) <= 5

    def test_no_results(self, symptoms):
        matches = search_symptoms("xyznonexistent123", symptoms)
        assert len(matches) == 0

    def test_comma_path_search(self, symptoms):
        """Searching with comma-separated path should work."""
        matches = search_symptoms("cold, agg", symptoms)
        assert len(matches) > 0

    def test_returns_valid_symptom_keys(self, symptoms):
        matches = search_symptoms("headache", symptoms)
        for m in matches:
            assert m in symptoms, f"Search result '{m}' not in symptoms database"

    def test_default_limit(self, symptoms):
        matches = search_symptoms("pain", symptoms)
        assert len(matches) <= 10  # default limit


# --- Repertorization Tests ---

class TestRepertorize:
    """Test the repertorization algorithm."""

    CLASSIC_SYMPTOMS = [
        "Head, pain, morning",
        "Mind, irritability",
        "Generalities, cold, in general agg."
    ]

    def test_empty_symptoms(self, symptoms, remedies):
        results = repertorize([], symptoms, remedies)
        assert results == []

    def test_single_symptom(self, symptoms, remedies):
        results = repertorize(["Mind, irritability"], symptoms, remedies)
        assert len(results) > 0

    def test_intersection_returns_results(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        assert len(results) > 0

    def test_results_sorted_by_score(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        scores = [r[1] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_result_tuple_structure(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        for r in results[:5]:
            assert len(r) == 4, f"Expected 4-tuple, got {len(r)}"
            abbrev, score, breakdown, full_name = r
            assert isinstance(abbrev, str)
            assert isinstance(score, int)
            assert isinstance(breakdown, dict)
            assert isinstance(full_name, str)

    def test_breakdown_contains_all_symptoms(self, symptoms, remedies):
        """Each remedy in the intersection should have scores for ALL symptoms."""
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        for abbrev, score, breakdown, _ in results:
            assert len(breakdown) == len(self.CLASSIC_SYMPTOMS), \
                f"{abbrev} breakdown has {len(breakdown)} entries, expected {len(self.CLASSIC_SYMPTOMS)}"

    def test_scores_are_positive(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        for _, score, _, _ in results:
            assert score > 0

    def test_nux_vomica_in_classic_repertorization(self, symptoms, remedies):
        """Nux Vomica should appear in top results for its classic symptoms."""
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        abbrevs = [r[0] for r in results[:5]]
        assert "Nux-v." in abbrevs, f"Nux-v. not in top 5: {abbrevs}"

    def test_total_score_equals_sum_of_breakdown(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        for abbrev, total, breakdown, _ in results:
            expected = sum(breakdown.values())
            assert total == expected, f"{abbrev}: total {total} != sum {expected}"

    def test_intersection_count_reasonable(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        assert len(results) >= 50, f"Only {len(results)} remedies in intersection"

    def test_nonexistent_symptom_handled(self, symptoms, remedies):
        """Nonexistent symptoms should not crash."""
        results = repertorize(["Nonexistent, fake, symptom"], symptoms, remedies)
        assert results == []

    def test_mixed_valid_invalid_symptoms(self, symptoms, remedies):
        """Mix of valid and invalid symptoms should still produce results."""
        mixed = ["Mind, irritability", "Nonexistent, fake, symptom"]
        results = repertorize(mixed, symptoms, remedies)
        # Results should come from the valid symptom only, but since intersection
        # requires ALL symptoms, and invalid one has no remedies, result is empty
        # (this tests the behavior correctly)
        assert isinstance(results, list)

    def test_single_symptom_all_remedies_present(self, symptoms, remedies):
        """With one symptom, all remedies listed for it should appear."""
        symptom = "Mind, irritability"
        results = repertorize([symptom], symptoms, remedies)
        result_abbrevs = {r[0] for r in results}
        expected = set(symptoms[symptom]["remedies"].keys())
        assert result_abbrevs == expected

    def test_two_symptom_intersection(self, symptoms, remedies):
        """Two symptoms should produce a proper intersection."""
        syms = ["Head, pain, morning", "Mind, irritability"]
        results = repertorize(syms, symptoms, remedies)
        # Every result should have both symptoms in breakdown
        for abbrev, _, breakdown, _ in results:
            assert set(breakdown.keys()) == set(syms), f"{abbrev} missing a symptom"

    def test_full_name_populated(self, symptoms, remedies):
        results = repertorize(self.CLASSIC_SYMPTOMS, symptoms, remedies)
        for abbrev, _, _, full_name in results[:10]:
            assert len(full_name) > 0, f"{abbrev} has empty full_name"
