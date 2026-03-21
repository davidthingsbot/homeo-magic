#!/usr/bin/env python3
"""
Tests for OOREP SQL parser (parse_oorep.py).
Run with: python3 -m pytest test-oorep.py -v
"""

import json
import pytest
from pathlib import Path

from scraper.parse_oorep import parse_copy_block

DATA_DIR = Path(__file__).parent / "data"


# --- Unit Tests for parse_copy_block ---

class TestParseCopyBlock:
    """Test SQL COPY block extraction."""

    def test_basic_copy_block(self):
        sql = (
            "COPY public.test_table (id, name) FROM stdin;\n"
            "1\tAlice\n"
            "2\tBob\n"
            "\\.\n"
        )
        rows = parse_copy_block(sql, "test_table")
        assert len(rows) == 2
        assert rows[0] == ["1", "Alice"]
        assert rows[1] == ["2", "Bob"]

    def test_null_values(self):
        sql = (
            "COPY public.test_table (id, name, alt) FROM stdin;\n"
            "1\tAlice\t\\N\n"
            "\\.\n"
        )
        rows = parse_copy_block(sql, "test_table")
        assert len(rows) == 1
        assert rows[0] == ["1", "Alice", None]

    def test_empty_block(self):
        sql = (
            "COPY public.test_table (id, name) FROM stdin;\n"
            "\\.\n"
        )
        rows = parse_copy_block(sql, "test_table")
        assert len(rows) == 0

    def test_no_matching_table(self):
        sql = (
            "COPY public.other_table (id, name) FROM stdin;\n"
            "1\tAlice\n"
            "\\.\n"
        )
        rows = parse_copy_block(sql, "test_table")
        assert len(rows) == 0

    def test_multiple_tables(self):
        sql = (
            "COPY public.table_a (id, name) FROM stdin;\n"
            "1\tAlpha\n"
            "\\.\n"
            "\n"
            "COPY public.table_b (id, value) FROM stdin;\n"
            "10\tHello\n"
            "20\tWorld\n"
            "\\.\n"
        )
        rows_a = parse_copy_block(sql, "table_a")
        rows_b = parse_copy_block(sql, "table_b")
        assert len(rows_a) == 1
        assert rows_a[0] == ["1", "Alpha"]
        assert len(rows_b) == 2
        assert rows_b[1] == ["20", "World"]

    def test_special_characters_in_values(self):
        sql = (
            "COPY public.test_table (id, path) FROM stdin;\n"
            "1\tHead, pain, morning\n"
            "2\tMind, anxiety, night, agg.\n"
            "\\.\n"
        )
        rows = parse_copy_block(sql, "test_table")
        assert len(rows) == 2
        assert rows[0][1] == "Head, pain, morning"
        assert rows[1][1] == "Mind, anxiety, night, agg."

    def test_many_columns(self):
        sql = (
            "COPY public.rubric (abbrev, id, mother, ismother, chapterid, fullpath, path, textt) FROM stdin;\n"
            "publicum\t100\t0\tt\t5\tHead, pain\t/head/pain\tpain\n"
            "\\.\n"
        )
        rows = parse_copy_block(sql, "rubric")
        assert len(rows) == 1
        assert len(rows[0]) == 8
        assert rows[0][0] == "publicum"
        assert rows[0][5] == "Head, pain"


# --- Data Integrity Tests (require data files) ---

class TestOorepDataIntegrity:
    """Tests that verify the output data files from OOREP parsing."""

    @pytest.fixture(scope="class")
    def symptoms(self):
        path = DATA_DIR / "symptoms.json"
        if not path.exists():
            pytest.skip("symptoms.json not found")
        with open(path) as f:
            return json.load(f)

    @pytest.fixture(scope="class")
    def remedies(self):
        path = DATA_DIR / "remedies.json"
        if not path.exists():
            pytest.skip("remedies.json not found")
        with open(path) as f:
            return json.load(f)

    def test_symptoms_file_exists(self):
        assert (DATA_DIR / "symptoms.json").exists()

    def test_remedies_file_exists(self):
        assert (DATA_DIR / "remedies.json").exists()

    def test_symptoms_count(self, symptoms):
        count = len(symptoms)
        assert count == 74481, f"Expected 74,481 symptoms, got {count}"

    def test_remedies_count(self, remedies):
        count = len(remedies)
        assert count == 2432, f"Expected 2,432 remedies, got {count}"

    def test_symptom_structure(self, symptoms):
        sample = symptoms.get("Head, pain, morning")
        assert sample is not None, "Expected symptom 'Head, pain, morning'"
        assert "remedies" in sample
        assert isinstance(sample["remedies"], dict)

    def test_symptom_grades_valid(self, symptoms):
        """All remedy grades should be 1, 2, or 3."""
        for symptom_path, data in list(symptoms.items())[:500]:
            for abbrev, grade in data.get("remedies", {}).items():
                assert grade in (1, 2, 3), f"Invalid grade {grade} for {abbrev} in {symptom_path}"

    def test_common_remedies_present(self, remedies):
        for abbrev in ["Nux-v.", "Sulph.", "Puls.", "Ars.", "Lyc."]:
            assert abbrev in remedies, f"Common remedy {abbrev} missing"

    def test_remedy_names_are_strings(self, remedies):
        for abbrev, name in remedies.items():
            assert isinstance(name, str) and len(name) > 0, f"Bad name for {abbrev}"

    def test_symptoms_have_at_least_one_remedy(self, symptoms):
        empty = [s for s, d in list(symptoms.items())[:1000] if len(d.get("remedies", {})) == 0]
        assert len(empty) == 0, f"Symptoms with no remedies: {empty[:5]}"

    def test_nux_vomica_in_irritability(self, symptoms):
        """Nux Vomica should appear under Mind, irritability."""
        irritability = symptoms.get("Mind, irritability", {})
        assert "Nux-v." in irritability.get("remedies", {}), "Nux-v. should be in irritability"
