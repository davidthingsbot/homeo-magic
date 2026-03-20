#!/usr/bin/env python3
"""
Parse Kent's Lectures on Materia Medica from Archive.org OCR text.

Splits the full text into individual remedy sections, converts to Markdown,
and provides keyword matching for symptom exploration.
"""

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "kent" / "materia_medica"

# Known Kent remedy names (manually verified from the text).
# These are the heading forms as they appear in the OCR text.
KENT_REMEDIES = {
    "Abrotanum", "Acetic Acidum", "Aconitum Napellus", "Actea Racemosa",
    "Aesculus Hippocastanum", "Aethusa Cynapium", "Agaricus Muscarius",
    "Agnus Castus", "Ailanthus Glandulosa", "Allium Cepa", "Aloe", "Alumen",
    "Alumina", "Ambra Grisea", "Ammonium Carbonicum", "Ammonium Muriaticum",
    "Anacardium Orientale", "Antimonium Crudum", "Antimonium Tartaricum",
    "Apis Mellifica", "Apocynum Cannabinum", "Argentum Metallicum",
    "Argentum Nitricum", "Arnica Montana", "Arsenicum Album",
    "Arsenicum Iodatum", "Arum Triphyllum", "Asa Foetida", "Aurum Metallicum",
    "Aurum Muriaticum", "Baptisia", "Baryta Carbonica", "Baryta Muriatica",
    "Belladonna", "Benzoicum Acidum", "Berberis", "Borax", "Bromium",
    "Bryonia Alba", "Bufo", "Cactus Grandiflorus", "Cadmium Sulphuricum",
    "Caladium", "Calcarea Arsenicosa", "Calcarea Carbonica",
    "Calcarea Fluorica", "Calcarea Phosphorica", "Calcarea Sulphurica",
    "Camphor", "Cannabis Indica", "Cannabis Sativa", "Cantharis", "Capsicum",
    "Carbo Animalis", "Carbo Vegetabilis", "Carboneum Sulphuratum",
    "Carduus Marianus", "Causticum", "Chamomilla", "Chelidonium",
    "Chininum Arsenicosum", "Cicuta Virosa", "Cina", "Cinchona (China)",
    "Cinnabaris", "Cistus Canadensis", "Clematis Erecta", "Cocculus Indicus",
    "Coccus Cacti", "Coffea", "Colchicum", "Colocynthis", "Conium Maculatum",
    "Crotalus Horridus", "Croton Tiglium", "Cuprum Metallicum", "Cyclamen",
    "Drosera Rotundifolia", "Dulcamara", "Euphrasia", "Ferrum Metallicum",
    "Ferrum Phosphoricum", "Fluoricum Acidum", "Gelsemium", "Glonoinum",
    "Graphites", "Gratiola", "Guaiacum", "Helleborus Niger", "Hepar Sulphur",
    "Hydrastis Canadensis", "Hyoscyamus", "Hypericum", "Ignatia",
    "Iodum (Iodine)", "Ipecac", "Kalium Bichromicum", "Kalium Carbonicum",
    "Kalium Iodatum", "Kalium Phosphoricum", "Kalium Sulphuricum",
    "Kalmia Latifolia", "Kreosotum", "Lac Caninum", "Lac Vaccinum Defloratum",
    "Lachesis", "Laurocerasus", "Ledum Palustre", "Lycopodium",
    "Magnesia Carbonica", "Magnesia Muriatica", "Magnesia Phosphorica",
    "Manganum", "Medorrhinum", "Mercurius", "Mercurius Corrosivus",
    "Mercurius Cyanatus", "Mercurius Iodatus Flavus", "Mercurius Sulphuricus",
    "Mezereum", "Millefolium", "Moschus", "Muriaticum Acidum",
    "Natrum Arsenicosum", "Natrum Carbonicum", "Natrum Muriaticum",
    "Natrum Phosphoricum", "Natrum Sulphuricum", "Nitricum Acidum",
    "Nux Moschata", "Nux Vomica", "Opium", "Oxalicum Acidum", "Petroleum",
    "Phosphoricum Acidum", "Phosphorus", "Phytolacca", "Picricum Acidum",
    "Platinum", "Plumbum Metallicum", "Podophyllum", "Psorinum", "Pulsatilla",
    "Pyrogenium", "Ranunculus Bulbosus", "Rhododendron", "Rhus Toxicodendron",
    "Rumex Crispus", "Ruta Graveolens", "Sabadilla", "Sabina", "Sanguinaria",
    "Sarsaparilla", "Secale Cornutum", "Selenium", "Senecio Aureus", "Senega",
    "Sepia", "Silicea", "Spigelia Anthelmintica", "Squilla",
    "Stannum Metallicum", "Staphysagria", "Stramonium", "Sulphur",
    "Sulphuricum Acidum", "Syphilinum", "Tarentula Hispanica", "Theridion",
    "Thuja Occidentalis", "Tuberculinum Bovinum", "Valeriana",
    "Veratrum Album", "Zincum Metallicum",
    # Handle Eupatorium which appears as a subsection name
    "Eupatorium Perfoliatum",
}

# Subsection headers that Kent uses within remedy chapters
SECTION_HEADERS = [
    "Mind", "Head", "Eyes", "Ears", "Nose", "Face", "Mouth", "Teeth",
    "Throat", "Stomach", "Abdomen", "Rectum", "Stool", "Urinary",
    "Urine", "Genitals", "Male", "Female", "Menses", "Larynx",
    "Respiration", "Chest", "Cough", "Heart", "Back", "Extremities",
    "Limbs", "Skin", "Sleep", "Fever", "Generalities", "Modalities",
    "Digestion", "Pains", "Voice and respiration", "Cardiac",
    "Liver", "Kidneys",
]


def detect_remedy_heading(line: str) -> bool:
    """Determine if a line is a remedy chapter heading."""
    stripped = line.strip()
    if not stripped:
        return False

    # Quick reject: too long, ends with period/colon, or has commas
    if len(stripped) > 40:
        return False
    if stripped.endswith((".",":", ",", '"', "'")):
        return False
    if "," in stripped:
        return False

    # Must start with uppercase
    if not stripped[0].isupper():
        return False

    # Check against known remedy names
    if stripped in KENT_REMEDIES:
        return True

    return False


def split_into_sections(text: str) -> list[dict]:
    """Split the full OCR text into individual remedy sections.

    Returns a list of dicts with keys: name, text, start_line.
    """
    lines = text.split("\n")
    sections = []
    current_name = None
    current_start = None
    current_lines = []

    # Skip preface: find first remedy heading
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        # Check if this line is a remedy heading
        # Headings are preceded by blank lines and followed by blank lines
        is_heading = False
        if detect_remedy_heading(stripped):
            # Verify it's surrounded by blank lines (at least one before, one after)
            prev_blank = i > 0 and not lines[i - 1].strip()
            next_blank = i + 1 < len(lines) and not lines[i + 1].strip()
            if prev_blank and next_blank:
                is_heading = True

        if is_heading:
            # Save previous section
            if current_name is not None:
                section_text = "\n".join(current_lines).strip()
                if section_text:
                    sections.append({
                        "name": current_name,
                        "text": section_text,
                        "start_line": current_start,
                    })
            current_name = stripped
            current_start = i + 1  # 1-indexed
            current_lines = []
        elif current_name is not None:
            current_lines.append(line)

    # Don't forget the last section
    if current_name is not None:
        section_text = "\n".join(current_lines).strip()
        if section_text:
            sections.append({
                "name": current_name,
                "text": section_text,
                "start_line": current_start,
            })

    return sections


def clean_ocr_text(text: str) -> str:
    """Clean up common OCR artifacts in the text."""
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse multiple spaces (but not newlines)
    text = re.sub(r"[ \t]+", " ", text)
    # Remove stray non-ASCII artifacts (but keep common punctuation)
    text = re.sub(r"[^\x20-\x7E\n]", "", text)
    # Fix common OCR ligature issues
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl")
    return text.strip()


def convert_section_to_markdown(name: str, text: str) -> str:
    """Convert a remedy section's raw text to clean Markdown."""
    text = clean_ocr_text(text)
    lines = text.split("\n")
    md_lines = [f"# {name}", ""]

    # Regex for section headers like "Mind:" or "Stomach:" at start of line
    header_pattern = re.compile(
        r"^(" + "|".join(re.escape(h) for h in SECTION_HEADERS) + r")\s*[:.]?\s*(.*)",
        re.IGNORECASE,
    )

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if not line:
            # Blank line = paragraph break
            if md_lines and md_lines[-1] != "":
                md_lines.append("")
            i += 1
            continue

        # Check for section header
        m = header_pattern.match(line)
        if m and (i == 0 or not lines[i - 1].strip()):
            header = m.group(1).title()
            rest = m.group(2).strip()
            md_lines.append(f"## {header}")
            md_lines.append("")
            if rest:
                md_lines.append(rest)
            i += 1
            continue

        md_lines.append(line)
        i += 1

    # Collapse multiple blank lines
    result = "\n".join(md_lines)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip() + "\n"


def find_keyword_matches(text: str, keywords: list[str]) -> list[dict]:
    """Find keyword matches in text, returning context around each match.

    Returns list of dicts with: keyword, position, context.
    """
    matches = []
    text_lower = text.lower()

    for keyword in keywords:
        kw_lower = keyword.lower()
        start = 0
        while True:
            pos = text_lower.find(kw_lower, start)
            if pos == -1:
                break

            # Extract context: ~150 chars around the match
            ctx_start = max(0, pos - 100)
            ctx_end = min(len(text), pos + len(keyword) + 100)

            # Extend to word boundaries
            while ctx_start > 0 and text[ctx_start] not in " \n":
                ctx_start -= 1
            while ctx_end < len(text) and text[ctx_end] not in " \n":
                ctx_end += 1

            context = text[ctx_start:ctx_end].strip()

            matches.append({
                "keyword": keyword,
                "position": pos,
                "context": context,
            })

            start = pos + len(keyword)

    return matches


def save_sections_json(sections: list[dict], output_path: Path = None):
    """Save remedy sections to JSON."""
    if output_path is None:
        output_path = DATA_DIR / "remedy_sections.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Save without the full text to keep the index small
    index = []
    for s in sections:
        index.append({
            "name": s["name"],
            "start_line": s["start_line"],
            "text_length": len(s["text"]),
        })

    with open(output_path, "w") as f:
        json.dump({"remedies": index, "count": len(index)}, f, indent=2)
    print(f"Saved {len(index)} remedy sections to {output_path}")
    return index


def save_markdown(sections: list[dict], output_dir: Path = None):
    """Convert sections to Markdown and save to individual files."""
    if output_dir is None:
        output_dir = DATA_DIR / "remedy_markdown"
    output_dir.mkdir(parents=True, exist_ok=True)

    for s in sections:
        filename = s["name"].lower().replace(" ", "_").replace("(", "").replace(")", "")
        filename = re.sub(r"[^a-z0-9_]", "", filename) + ".md"
        md = convert_section_to_markdown(s["name"], s["text"])
        (output_dir / filename).write_text(md, encoding="utf-8")

    print(f"Saved {len(sections)} markdown files to {output_dir}")


def main():
    """Parse the full book and generate all outputs."""
    raw_path = DATA_DIR / "raw_text.txt"
    if not raw_path.exists():
        print(f"Error: {raw_path} not found. Download it first.")
        return

    print("Reading raw text...")
    text = raw_path.read_text(encoding="utf-8")
    print(f"  {len(text)} chars, {text.count(chr(10))} lines")

    print("Splitting into remedy sections...")
    sections = split_into_sections(text)
    print(f"  Found {len(sections)} remedy sections")

    # Show summary
    for s in sections:
        print(f"  {s['start_line']:>6}  {s['name']:<35} ({len(s['text']):>6} chars)")

    print("\nSaving remedy sections index...")
    save_sections_json(sections)

    print("Converting to Markdown...")
    save_markdown(sections)

    print("\nDone!")


if __name__ == "__main__":
    main()
