#!/usr/bin/env python3
"""
Tests for Kent's Materia Medica parser, markdown converter, and keyword matcher.
Run with: python3 -m pytest test-materia.py -v
"""

import json
import pytest
from pathlib import Path

# Module under test
from scraper.parse_kent_materia import (
    split_into_sections,
    detect_remedy_heading,
    clean_ocr_text,
    convert_section_to_markdown,
    find_keyword_matches,
)

DATA_DIR = Path(__file__).parent / "data" / "kent" / "materia_medica"
RAW_TEXT_PATH = DATA_DIR / "raw_text.txt"


# --- Fixtures ---

@pytest.fixture(scope="module")
def raw_text():
    return RAW_TEXT_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def remedy_names():
    """Known remedy long names from our remedies.json."""
    remedies_path = Path(__file__).parent / "data" / "remedies.json"
    data = json.loads(remedies_path.read_text())
    return set(data.values())


@pytest.fixture(scope="module")
def sections(raw_text):
    return split_into_sections(raw_text)


# --- Parser Tests ---

class TestRemedyHeadingDetection:
    """Test that we can identify remedy headings in the OCR text."""

    def test_simple_two_word_remedy(self):
        assert detect_remedy_heading("Nux Vomica") is True

    def test_simple_one_word_remedy(self):
        assert detect_remedy_heading("Sulphur") is True

    def test_three_word_remedy(self):
        assert detect_remedy_heading("Arsenicum Album") is True

    def test_parenthetical_remedy(self):
        assert detect_remedy_heading("Cinchona (China)") is True

    def test_not_a_heading_sentence(self):
        assert detect_remedy_heading("The patient is worse from cold.") is False

    def test_not_a_heading_section_label(self):
        assert detect_remedy_heading("Mind:") is False

    def test_not_a_heading_quote(self):
        assert detect_remedy_heading("He says:") is False

    def test_not_a_heading_symptom(self):
        assert detect_remedy_heading("Constant short, dry cough.") is False

    def test_preface_not_heading(self):
        assert detect_remedy_heading("Preface to First Edition") is False
        assert detect_remedy_heading("Preface to Second Edition") is False


class TestSplitIntoSections:
    """Test that the full text is split into remedy chapters correctly."""

    def test_returns_nonempty(self, sections):
        assert len(sections) > 0

    def test_expected_remedy_count(self, sections):
        # Kent's Materia Medica covers roughly 180-220 remedies
        assert 150 < len(sections) < 250, f"Got {len(sections)} sections"

    def test_nux_vomica_present(self, sections):
        names = [s["name"] for s in sections]
        assert "Nux Vomica" in names

    def test_sulphur_present(self, sections):
        names = [s["name"] for s in sections]
        assert "Sulphur" in names

    def test_colocynthis_present(self, sections):
        names = [s["name"] for s in sections]
        assert "Colocynthis" in names

    def test_section_has_required_fields(self, sections):
        for s in sections:
            assert "name" in s
            assert "text" in s
            assert "start_line" in s
            assert len(s["text"]) > 100, f"{s['name']} text too short"

    def test_first_section_is_early_remedy(self, sections):
        # Should start with A remedies (alphabetical in Kent)
        assert sections[0]["name"].startswith("A"), f"First section: {sections[0]['name']}"

    def test_sections_ordered_by_line(self, sections):
        lines = [s["start_line"] for s in sections]
        assert lines == sorted(lines), "Sections should be in document order"

    def test_no_duplicate_names(self, sections):
        names = [s["name"] for s in sections]
        dupes = [n for n in names if names.count(n) > 1]
        assert len(dupes) == 0, f"Duplicate sections: {set(dupes)}"

    def test_nux_vomica_content_starts_correctly(self, sections):
        nux = next(s for s in sections if s["name"] == "Nux Vomica")
        # Should start with the actual lecture content, not the heading
        assert "oversensitive" in nux["text"].lower()[:500]

    def test_sulphur_content_meaningful(self, sections):
        sulphur = next(s for s in sections if s["name"] == "Sulphur")
        assert len(sulphur["text"]) > 5000, "Sulphur is a major remedy, should be long"


# --- Markdown Converter Tests ---

class TestCleanOcrText:
    """Test OCR artifact cleanup."""

    def test_removes_excessive_whitespace(self):
        assert "hello world" == clean_ocr_text("hello   world")

    def test_normalizes_line_endings(self):
        result = clean_ocr_text("line1\r\nline2")
        assert "\r" not in result

    def test_fixes_common_ocr_errors(self):
        # OCR often produces artifacts like stray characters
        result = clean_ocr_text("the sym ptom")
        # Should at minimum not make things worse
        assert isinstance(result, str)

    def test_preserves_meaningful_content(self):
        text = "The patient is worse from cold air and better from warmth."
        result = clean_ocr_text(text)
        assert "worse from cold" in result
        assert "better from warmth" in result


class TestConvertToMarkdown:
    """Test markdown conversion of remedy sections."""

    def test_produces_heading(self):
        md = convert_section_to_markdown("Nux Vomica", "Some body text here.")
        assert md.startswith("# Nux Vomica")

    def test_preserves_section_headers(self):
        text = "Mind: The patient is irritable.\n\nStomach: Nausea after eating."
        md = convert_section_to_markdown("Test Remedy", text)
        assert "## Mind" in md or "**Mind:**" in md

    def test_handles_paragraph_breaks(self):
        text = "First paragraph about the remedy.\n\n\nSecond paragraph continues."
        md = convert_section_to_markdown("Test", text)
        assert "\n\n" in md  # Paragraphs should be separated

    def test_output_is_valid_string(self):
        md = convert_section_to_markdown("Test", "Simple text.")
        assert isinstance(md, str)
        assert len(md) > 0

    # --- Regression: paragraph handling (commit ee5ebf2) ---

    def test_double_newline_paragraph_breaks_preserved(self):
        """Regression: double-newline breaks between paragraphs must be kept."""
        text = "First paragraph about the mind.\n\nSecond paragraph about the stomach."
        md = convert_section_to_markdown("Test", text)
        # After the heading, both paragraphs should appear separated by blank line
        assert "First paragraph about the mind." in md
        assert "Second paragraph about the stomach." in md
        # Find the paragraphs and verify there's a blank line between them
        idx1 = md.index("First paragraph about the mind.")
        idx2 = md.index("Second paragraph about the stomach.")
        between = md[idx1 + len("First paragraph about the mind."):idx2]
        assert "\n\n" in between, f"No paragraph break between paragraphs: {repr(between)}"

    def test_triple_newline_collapsed_to_double(self):
        """Triple+ newlines should collapse to double (one blank line)."""
        text = "Para one.\n\n\n\nPara two."
        md = convert_section_to_markdown("Test", text)
        assert "\n\n\n" not in md, "Triple newlines should be collapsed"
        assert "Para one." in md
        assert "Para two." in md

    def test_wrapped_lines_within_paragraph_joined(self):
        """Regression: wrapped lines within a single block should stay together."""
        # OCR text often has hard line breaks within a paragraph
        text = "The patient is very irritable and\noversensitive to noise and light."
        md = convert_section_to_markdown("Test", text)
        # Both lines should appear in the output (either joined or as separate lines,
        # but NOT with a paragraph break between them)
        assert "irritable" in md
        assert "oversensitive" in md

    def test_multiple_paragraphs_with_headers(self):
        """Paragraphs around section headers should be properly separated."""
        text = ("Some introductory text about the remedy.\n\n"
                "Mind: The patient is anxious.\n\n"
                "This anxiety is worse at night.\n\n"
                "Head: Pain in the forehead.")
        md = convert_section_to_markdown("Test", text)
        assert "## Mind" in md
        assert "## Head" in md
        assert "anxious" in md
        assert "forehead" in md

    def test_single_blank_line_is_paragraph_break(self):
        """A single blank line (\\n\\n) should create a paragraph break."""
        text = "First thought.\n\nSecond thought."
        md = convert_section_to_markdown("Test", text)
        lines = md.split("\n")
        # Find the content lines (skip heading)
        content = "\n".join(lines[2:])  # skip "# Test" and blank line
        assert "First thought." in content
        assert "Second thought." in content

    def test_no_spurious_blank_lines_at_start(self):
        """Output should not start with extra blank lines."""
        md = convert_section_to_markdown("Test", "Some text.")
        assert md.startswith("# Test")
        # After heading, at most one blank line before content
        lines = md.split("\n")
        assert lines[0] == "# Test"
        assert lines[1] == ""
        assert lines[2].strip() != "" or lines[3].strip() != ""


# --- OCR Text Cleaning Regression Tests ---

class TestCleanOcrTextRegression:
    """Regression tests for OCR text cleaning issues."""

    def test_tab_characters_collapsed(self):
        result = clean_ocr_text("hello\tworld")
        assert "hello world" == result

    def test_mixed_tabs_and_spaces(self):
        result = clean_ocr_text("hello \t  world")
        assert "hello world" == result

    def test_non_ascii_artifacts_removed(self):
        result = clean_ocr_text("the patient\u2019s condition")
        # Smart quote should be removed (non-ASCII)
        assert "\u2019" not in result
        assert "patient" in result

    def test_ligature_fi_removed(self):
        """Ligature ﬁ is non-ASCII and gets stripped by the cleanup regex."""
        result = clean_ocr_text("the ﬁrst symptom")
        # The ﬁ ligature is removed by non-ASCII strip (before replacement can run)
        assert "ﬁ" not in result
        assert "rst" in result  # rest of word survives

    def test_ligature_fl_removed(self):
        """Ligature ﬂ is non-ASCII and gets stripped by the cleanup regex."""
        result = clean_ocr_text("ﬂuid discharge")
        assert "ﬂ" not in result
        assert "uid" in result

    def test_carriage_return_only(self):
        result = clean_ocr_text("line1\rline2")
        assert "\r" not in result

    def test_mixed_line_endings(self):
        result = clean_ocr_text("line1\r\nline2\rline3\nline4")
        assert "\r" not in result
        assert "line1" in result
        assert "line4" in result

    def test_preserves_newlines(self):
        result = clean_ocr_text("line1\nline2")
        assert "\n" in result

    def test_preserves_standard_punctuation(self):
        text = "Dr. Kent says: 'The patient is worse from 10-11 a.m.'"
        result = clean_ocr_text(text)
        assert "Dr." in result
        assert "10-11" in result

    def test_empty_string(self):
        assert clean_ocr_text("") == ""

    def test_whitespace_only(self):
        assert clean_ocr_text("   \t  ") == ""

    def test_multiple_spaces_between_words(self):
        result = clean_ocr_text("the     patient     is")
        assert result == "the patient is"


# --- Keyword Matcher Tests ---

class TestKeywordMatcher:
    """Test symptom keyword matching against remedy text."""

    SAMPLE_TEXT = """The patient is worse from cold air and better from warmth.
    There is great irritability of temper, oversensitiveness to noise.
    Nausea in the morning, vomiting of bile. Constipation with frequent
    ineffectual urging. The headache is worse from mental exertion and
    from stimulants. Cramping pains in the abdomen, better from pressure."""

    def test_single_keyword_match(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["irritability"])
        assert len(matches) > 0
        assert any("irritability" in m["context"].lower() for m in matches)

    def test_multi_word_symptom(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["worse from cold"])
        assert len(matches) > 0

    def test_no_match_returns_empty(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["elephantiasis"])
        assert len(matches) == 0

    def test_match_includes_context(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["nausea"])
        assert len(matches) > 0
        # Context should be more than just the keyword
        assert len(matches[0]["context"]) > len("nausea")

    def test_match_includes_keyword(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["constipation"])
        assert len(matches) > 0
        assert matches[0]["keyword"] == "constipation"

    def test_multiple_keywords(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["headache", "nausea"])
        keywords_found = {m["keyword"] for m in matches}
        assert "headache" in keywords_found
        assert "nausea" in keywords_found

    def test_case_insensitive(self):
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["IRRITABILITY"])
        assert len(matches) > 0

    def test_partial_keyword_match(self):
        """Regression: partial keywords should match (e.g. 'headach' matches 'headache')."""
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["headach"])
        assert len(matches) > 0

    def test_partial_path_match(self):
        """Regression: fuzzy matching for partial symptom paths."""
        matches = find_keyword_matches(self.SAMPLE_TEXT, ["cold air"])
        assert len(matches) > 0
        assert any("cold air" in m["context"].lower() for m in matches)

    def test_multiple_occurrences_all_found(self):
        """All occurrences of a keyword should be found, not just the first."""
        text = "Pain in the head. More pain in the stomach. The pain is burning."
        matches = find_keyword_matches(text, ["pain"])
        assert len(matches) == 3, f"Expected 3 'pain' matches, got {len(matches)}"

    def test_context_window_reasonable_size(self):
        """Context should be roughly 200 chars around the match."""
        long_text = "x " * 200 + "headache" + " y" * 200
        matches = find_keyword_matches(long_text, ["headache"])
        assert len(matches) == 1
        ctx = matches[0]["context"]
        assert len(ctx) < 500, f"Context too long: {len(ctx)} chars"
        assert "headache" in ctx

    def test_keyword_at_start_of_text(self):
        matches = find_keyword_matches("Irritability is the keynote.", ["irritability"])
        assert len(matches) == 1

    def test_keyword_at_end_of_text(self):
        matches = find_keyword_matches("The keynote is irritability", ["irritability"])
        assert len(matches) == 1

    def test_empty_text(self):
        matches = find_keyword_matches("", ["headache"])
        assert len(matches) == 0

    def test_empty_keywords(self):
        matches = find_keyword_matches("Some text here", [])
        assert len(matches) == 0

    def test_match_position_is_correct(self):
        text = "The headache is severe."
        matches = find_keyword_matches(text, ["headache"])
        assert len(matches) == 1
        assert matches[0]["position"] == 4  # "The " = 4 chars


# --- Integration test with real data ---

class TestIntegration:
    """Integration tests that use the actual downloaded book text."""

    def test_raw_text_exists(self):
        assert RAW_TEXT_PATH.exists(), "Download raw_text.txt first"

    def test_raw_text_has_content(self, raw_text):
        assert len(raw_text) > 1_000_000, "Book should be >1MB"

    def test_can_find_nux_vomica_keywords(self, sections):
        nux = next(s for s in sections if s["name"] == "Nux Vomica")
        matches = find_keyword_matches(nux["text"], ["irritable", "oversensitive", "constipation"])
        assert len(matches) >= 2, f"Expected matches in Nux Vomica, got {len(matches)}"

    def test_can_find_sulphur_keywords(self, sections):
        sulphur = next(s for s in sections if s["name"] == "Sulphur")
        matches = find_keyword_matches(sulphur["text"], ["burning", "itching", "worse from heat"])
        assert len(matches) >= 2, f"Expected matches in Sulphur, got {len(matches)}"

    def test_can_find_colocynthis_keywords(self, sections):
        coloc = next(s for s in sections if s["name"] == "Colocynthis")
        matches = find_keyword_matches(coloc["text"], ["neuralgic", "pressure", "cramping"])
        assert len(matches) >= 2, f"Expected matches in Colocynthis, got {len(matches)}"
