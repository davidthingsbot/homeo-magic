# Kent's Materia Medica - Exploration Report

## Source Material

- **Book**: Kent's Lectures on Materia Medica (1904, 2nd edition)
- **Source**: [Archive.org](https://archive.org/details/kents-lectures-on-materia-medica)
- **Format**: OCR'd DjVu text (`_djvu.txt`), 2.6 MB, ~55,000 lines
- **Page mapping**: `_page_numbers.json` (898 pages, but page numbers are empty/null - not useful for precise page references)

## Parser Results

The parser successfully splits the book into **174 remedy chapters**.

Remedy text sizes range from 311 chars (Mercurius Cyanatus, a brief note) to 76,562 chars (Sulphur, Kent's longest lecture). The total text across all remedies is approximately 2.5 MB.

### Section Detection Method

Remedy headings appear as standalone lines (1-4 words, title case) surrounded by blank lines. We match against a known set of 174 remedy names extracted from the text. This approach has zero false positives - every detected heading is a real remedy chapter.

## Text Quality Assessment

### OCR Quality: Good

The Archive.org OCR is surprisingly clean. Key observations:

1. **Readable prose**: The text reads naturally with very few garbled characters
2. **Paragraph structure preserved**: Double blank lines consistently separate paragraphs
3. **Section headers present**: Kent uses labels like "Mind:", "Head:", "Stomach:" etc. within lectures, which our converter detects
4. **Abbreviation conventions**: Kent uses `>` for "better from" and `<` for "worse from" (homeopathic modality notation)
5. **Minor artifacts**: Occasional missing spaces (`sym ptom`), but rare enough to not affect keyword matching
6. **No page headers/footers**: The DjVu text strips these out cleanly

### Structure

Each remedy lecture follows a loose pattern:
1. Opening characterization (personality/constitution)
2. Body system sections (Mind, Head, Eyes, Face, Stomach, etc.)
3. Modalities and relationships to other remedies

Not all lectures have explicit section headers. Some (especially shorter remedies) are continuous prose.

## Extracted Text Examples

### Nux Vomica (17,753 chars)

Opening:
> Everywhere in this remedy we observe the striking oversensitiveness of the patient; it is brought out in all the symptoms. Irritable; oversensitive to noise, to light, to the least current of air, to his surroundings; extremely touchy in regard to his food; many kinds of food disturb, strong foods disturb; he is aggravated by meat; craves stimulants, pungent, bitter, succulent things, something to brace him up.

### Sulphur (76,562 chars)

Opening:
> Sulphur is such a full remedy that it is somewhat difficult to tell where to begin. It seems to contain a likeness of all the sicknesses of man, and a beginner on reading over the proving of Sulphur might naturally think that he would need no other remedy, as the image of all sickness seems to be contained in it.

### Colocynthis (8,509 chars)

Opening:
> The principal feature of Colocynth is its severe, tearing, neuralgic pains; so severe that the patient is unable to keep still. Sometimes they are > by motion - at least it appears that they are worse during rest- > by pressure and sometimes > by heat.

## Keyword Matching Results

We tested keyword matching using symptom paths from our repertory database (symptoms.json). For each remedy, we extracted keywords from the top-weighted symptoms and searched the lecture text.

| Remedy | Repertory symptoms (grade 2+) | Keywords tested | Keywords matched | Match rate |
|---|---|---|---|---|
| Nux Vomica | 4,718 | 15 | 11 | 73% |
| Sulphur | 6,063 | 15 | 12 | 80% |
| Colocynthis | 1,636 | 15 | 7 | 47% |

### Why some keywords don't match

1. **Anatomical specificity**: Repertory uses terms like "dorsal region, scapulae" while Kent writes about "the back" in general prose
2. **Latin vs English**: Repertory uses "Genitalia female" while Kent writes about "the woman" or uses colloquial descriptions
3. **Abbreviations**: Repertory uses "amel." for amelioration, Kent writes "better from"
4. **Different vocabulary**: Repertory is systematic/clinical while Kent is conversational/colloquial

### What works well

- Common symptom keywords (pain, head, back, chest, chill) match readily
- Characteristic symptoms described at length by Kent (irritability for Nux, burning for Sulphur, neuralgic pains for Colocynthis) produce rich contextual matches
- The context extraction (150 chars around match) provides meaningful passages

## Markdown Conversion

The converter produces clean, readable Markdown:
- `# Remedy Name` as the top heading
- `## Section` headers detected from Kent's labels (Mind, Head, Stomach, etc.)
- Paragraphs properly separated
- OCR artifacts cleaned (normalized whitespace, removed stray non-ASCII)

174 individual `.md` files generated in `data/kent/materia_medica/remedy_markdown/`.

## Recommendations for Full Pipeline

### 1. Two-stage matching is essential

Simple keyword matching achieves 47-80% coverage. The LLM pass (planned in the pipeline) should:
- Bridge vocabulary gaps (colloquial Kent -> systematic repertory)
- Identify symptom descriptions that use synonyms or paraphrases
- Extract modalities (worse/better from) that Kent expresses in prose form

### 2. Keyword pre-filter should use expanded synonyms

Before the LLM pass, expand keyword search with:
- Common synonyms (headache/cephalgia, stomach/gastric, nausea/vomiting)
- Body part mappings (extremities -> arms/legs/hands/feet)
- Modality terms (worse/better/aggravated/ameliorated)

### 3. Constitutional profiles are extractable

Kent consistently opens with personality/constitutional descriptions. The LLM pass can extract these reliably since they appear in the first few paragraphs of each lecture.

### 4. Page numbers are not useful

The `page_numbers.json` has empty/null page numbers for all 898 leaves. Line numbers from the raw text serve as adequate references instead.

### 5. No deduplication needed

Each remedy appears exactly once in the text. The parser produces 174 unique sections with no duplicates.

### 6. Batch processing plan

At 174 remedies, with ~2.5 MB total text, the LLM matching pass should be feasible in a single batch. Larger remedies (Sulphur at 76K chars, Belladonna at 71K, Calcarea Carbonica at 57K) may need to be processed in chunks for context window limits.
