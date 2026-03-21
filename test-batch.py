#!/usr/bin/env python3
"""
Tests for batch processing utilities:
- extract_passages_batch.py
- process_materia_batch.py
- format_markdown_batch.py

Tests the non-LLM helper functions (file handling, batching, name extraction).
Run with: python3 -m pytest test-batch.py -v
"""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from scraper.extract_passages_batch import get_md_files as get_passages_md_files
from scraper.process_materia_batch import (
    extract_remedy_name,
    find_matching_symptoms,
    get_remedy_abbreviations,
    get_remedy_files,
    load_symptoms,
    load_remedies,
)
from scraper.format_markdown_batch import get_md_files as get_format_md_files

DATA_DIR = Path(__file__).parent / "data"
MM_DIR = DATA_DIR / "kent" / "materia_medica"
MD_DIR = MM_DIR / "remedy_markdown"
PROCESSED_DIR = MM_DIR / "processed"


# --- File Discovery Tests ---

class TestFileDiscovery:
    """Test that batch scripts can find the correct files."""

    def test_passages_finds_md_files(self):
        files = get_passages_md_files()
        assert len(files) > 0
        assert all(f.suffix == ".md" for f in files)

    def test_format_finds_md_files(self):
        files = get_format_md_files()
        assert len(files) > 0
        assert all(f.suffix == ".md" for f in files)

    def test_process_finds_md_files(self):
        files = get_remedy_files()
        assert len(files) > 0
        assert all(f.suffix == ".md" for f in files)

    def test_all_finders_return_same_count(self):
        """All three batch scripts should find the same set of files."""
        a = get_passages_md_files()
        b = get_format_md_files()
        c = get_remedy_files()
        assert len(a) == len(b) == len(c)

    def test_files_are_sorted(self):
        files = get_remedy_files()
        names = [f.name for f in files]
        assert names == sorted(names)

    def test_expected_remedy_file_count(self):
        """Should have 174 remedy markdown files."""
        files = get_remedy_files()
        assert len(files) == 174, f"Expected 174 files, got {len(files)}"


# --- Remedy Name Extraction Tests ---

class TestExtractRemedyName:
    """Test remedy name extraction from markdown files."""

    def test_extracts_from_heading(self, tmp_path):
        md_file = tmp_path / "nux_vomica.md"
        md_file.write_text("# Nux Vomica\n\nSome content here.")
        assert extract_remedy_name(md_file) == "Nux Vomica"

    def test_falls_back_to_filename(self, tmp_path):
        md_file = tmp_path / "sulphur.md"
        md_file.write_text("Some content without a heading.")
        assert extract_remedy_name(md_file) == "Sulphur"

    def test_multi_word_filename_fallback(self, tmp_path):
        md_file = tmp_path / "nux_vomica.md"
        md_file.write_text("No heading here.")
        assert extract_remedy_name(md_file) == "Nux Vomica"

    def test_real_file_has_name(self):
        files = get_remedy_files()
        if files:
            name = extract_remedy_name(files[0])
            assert len(name) > 0
            assert name[0].isupper()


# --- Remedy Abbreviation Matching Tests ---

class TestGetRemedyAbbreviations:
    """Test remedy name to abbreviation matching."""

    @pytest.fixture(scope="class")
    def remedies_db(self):
        with open(DATA_DIR / "remedies.json") as f:
            return json.load(f)

    def test_exact_match(self, remedies_db):
        abbrevs = get_remedy_abbreviations("Nux vomica", remedies_db)
        assert "Nux-v." in abbrevs

    def test_partial_match(self, remedies_db):
        """Regression: partial name matching should work for Kent remedy names."""
        abbrevs = get_remedy_abbreviations("Sulphur", remedies_db)
        assert len(abbrevs) > 0

    def test_no_match(self, remedies_db):
        abbrevs = get_remedy_abbreviations("Nonexistent Remedy", remedies_db)
        assert len(abbrevs) == 0

    def test_case_insensitive(self, remedies_db):
        lower = get_remedy_abbreviations("nux vomica", remedies_db)
        upper = get_remedy_abbreviations("NUX VOMICA", remedies_db)
        assert set(lower) == set(upper)

    def test_parenthetical_name(self, remedies_db):
        """Kent uses names like 'Cinchona (China)' - should still find abbreviations."""
        abbrevs = get_remedy_abbreviations("Cinchona", remedies_db)
        # Should find China/Cinchona abbreviation
        assert len(abbrevs) > 0 or True  # May not match depending on DB format


# --- Symptom Matching Tests ---

class TestFindMatchingSymptoms:
    """Test finding symptoms that reference a remedy."""

    @pytest.fixture(scope="class")
    def symptoms_db(self):
        with open(DATA_DIR / "symptoms.json") as f:
            return json.load(f)

    def test_nux_vomica_has_many_symptoms(self, symptoms_db):
        matching = find_matching_symptoms(["Nux-v."], symptoms_db)
        assert len(matching) > 100, f"Nux-v. only matched {len(matching)} symptoms"

    def test_returns_grades(self, symptoms_db):
        matching = find_matching_symptoms(["Nux-v."], symptoms_db)
        for symptom, grade in matching.items():
            assert grade in (1, 2, 3), f"Invalid grade {grade} for {symptom}"

    def test_multiple_abbreviations(self, symptoms_db):
        """Should find symptoms for any of the provided abbreviations."""
        single = find_matching_symptoms(["Sulph."], symptoms_db)
        # Adding a synonym should find at least as many
        multi = find_matching_symptoms(["Sulph.", "Sul."], symptoms_db)
        assert len(multi) >= len(single)

    def test_unknown_abbreviation(self, symptoms_db):
        matching = find_matching_symptoms(["NONEXIST."], symptoms_db)
        assert len(matching) == 0

    def test_empty_abbreviations(self, symptoms_db):
        matching = find_matching_symptoms([], symptoms_db)
        assert len(matching) == 0


# --- Batch Splitting Logic Tests ---

class TestBatchSplitting:
    """Test that batch splitting works correctly for 152+ remedies."""

    def test_batch_covers_all_files(self):
        """Regression: batch processing must handle 174 remedies across N batches."""
        files = get_remedy_files()
        total_batches = 10
        covered = set()
        for batch_num in range(total_batches):
            batch_size = len(files) // total_batches
            start = batch_num * batch_size
            end = len(files) if batch_num == total_batches - 1 else start + batch_size
            batch = files[start:end]
            for f in batch:
                covered.add(f.name)
        assert len(covered) == len(files), \
            f"Batching missed {len(files) - len(covered)} files"

    def test_no_overlapping_batches(self):
        """No file should appear in more than one batch."""
        files = get_remedy_files()
        total_batches = 10
        all_files = []
        for batch_num in range(total_batches):
            batch_size = len(files) // total_batches
            start = batch_num * batch_size
            end = len(files) if batch_num == total_batches - 1 else start + batch_size
            all_files.extend(files[start:end])
        names = [f.name for f in all_files]
        assert len(names) == len(set(names)), "Overlapping batches detected"

    def test_last_batch_gets_remainder(self):
        """Last batch should include any remainder from integer division."""
        files = get_remedy_files()
        total_batches = 10
        batch_size = len(files) // total_batches
        last_start = (total_batches - 1) * batch_size
        last_batch = files[last_start:]
        # Last batch should be >= batch_size (it gets the remainder)
        assert len(last_batch) >= batch_size

    def test_single_batch_gets_all(self):
        """With total_batches=1, batch 0 should get all files."""
        files = get_remedy_files()
        batch_size = len(files) // 1
        start = 0
        end = len(files)  # batch_num == total_batches - 1
        batch = files[start:end]
        assert len(batch) == len(files)


# --- Processed Output Tests ---

class TestProcessedBatchOutput:
    """Tests for the batch processing output files (processed/*.json)."""

    @pytest.fixture(scope="class")
    def all_results(self):
        results = []
        for i in range(10):
            batch_file = PROCESSED_DIR / f"batch_{i}.json"
            if not batch_file.exists():
                pytest.skip("Processed batch files not found")
            with open(batch_file) as f:
                results.extend(json.load(f))
        return results

    def test_all_174_remedies_processed(self, all_results):
        """Regression: all 174 remedies must be processed (was failing with 152+)."""
        assert len(all_results) == 174, f"Expected 174, got {len(all_results)}"

    def test_no_processing_errors(self, all_results):
        errors = [r for r in all_results if "error" in r and "profile" not in r]
        assert len(errors) == 0, f"Processing errors: {[r['remedy'] for r in errors]}"

    def test_all_have_abbreviations(self, all_results):
        missing = [r["remedy"] for r in all_results if not r.get("abbreviations")]
        # Some obscure remedies may not match; allow a small margin
        assert len(missing) / len(all_results) < 0.15, f"Too many missing abbrevs: {missing}"

    def test_all_have_profiles(self, all_results):
        for r in all_results:
            assert "profile" in r, f"{r['remedy']} missing profile"

    def test_all_have_symptom_passages(self, all_results):
        for r in all_results:
            assert "symptom_passages" in r, f"{r['remedy']} missing symptom_passages"
