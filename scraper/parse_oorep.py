#!/usr/bin/env python3
"""
Parse OOREP SQL dump and extract symptom → remedy mappings.
Outputs JSON files for our lookup engine.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

def parse_copy_block(sql_content: str, table_name: str) -> list[list[str]]:
    """Extract rows from a COPY ... FROM stdin block."""
    pattern = rf"COPY public\.{table_name} \([^)]+\) FROM stdin;\n(.*?)\n\\."
    match = re.search(pattern, sql_content, re.DOTALL)
    if not match:
        return []
    
    rows = []
    for line in match.group(1).strip().split('\n'):
        if line and line != '\\.':
            # Split by tab, handle \N as None
            cols = [None if c == '\\N' else c for c in line.split('\t')]
            rows.append(cols)
    return rows

def main():
    sql_path = Path(__file__).parent.parent / "oorep.sql"
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)
    
    print(f"Reading {sql_path}...")
    sql_content = sql_path.read_text(encoding='utf-8', errors='replace')
    
    # Parse remedies: id, nameabbrev, namelong, namealt
    print("Parsing remedies...")
    remedy_rows = parse_copy_block(sql_content, "remedy")
    remedies = {}
    for row in remedy_rows:
        rid, abbrev, long_name, alt = row[0], row[1], row[2], row[3]
        remedies[rid] = {
            "abbrev": abbrev,
            "name": long_name,
            "alt": alt
        }
    print(f"  Found {len(remedies)} remedies")
    
    # Parse rubrics (symptoms): abbrev, id, mother, ismother, chapterid, fullpath, path, textt
    print("Parsing rubrics (symptoms)...")
    rubric_rows = parse_copy_block(sql_content, "rubric")
    rubrics = {}
    for row in rubric_rows:
        rep_abbrev, rid, mother, ismother, chapterid, fullpath, path, textt = row
        if rep_abbrev == "publicum":  # English repertory only
            rubrics[rid] = {
                "fullpath": fullpath,
                "chapter_id": chapterid,
                "text": textt
            }
    print(f"  Found {len(rubrics)} English rubrics (publicum)")
    
    # Parse rubric-remedy links: abbrev, rubricid, remedyid, weight, chapterid
    print("Parsing rubric-remedy links...")
    link_rows = parse_copy_block(sql_content, "rubricremedy")
    
    # Build symptom → remedies index
    symptoms = defaultdict(lambda: {"remedies": {}, "chapter_id": None})
    
    for row in link_rows:
        rep_abbrev, rubric_id, remedy_id, weight, chapter_id = row
        if rep_abbrev == "publicum" and rubric_id in rubrics:
            rubric = rubrics[rubric_id]
            fullpath = rubric["fullpath"]
            
            if fullpath not in symptoms:
                symptoms[fullpath]["chapter_id"] = rubric["chapter_id"]
            
            if remedy_id in remedies:
                remedy_abbrev = remedies[remedy_id]["abbrev"]
                symptoms[fullpath]["remedies"][remedy_abbrev] = int(weight)
    
    print(f"  Built {len(symptoms)} symptom entries")
    
    # Sample output
    print("\n=== Sample symptoms ===")
    for i, (symptom, data) in enumerate(list(symptoms.items())[:10]):
        print(f"  {symptom}")
        top_remedies = sorted(data["remedies"].items(), key=lambda x: -x[1])[:5]
        print(f"    → {top_remedies}")
    
    # Save outputs
    print("\nSaving outputs...")
    
    # Remedies lookup
    remedies_out = {v["abbrev"]: v["name"] for v in remedies.values()}
    with open(output_dir / "remedies.json", "w") as f:
        json.dump(remedies_out, f, indent=2)
    print(f"  Wrote remedies.json ({len(remedies_out)} entries)")
    
    # Symptoms index
    symptoms_out = dict(symptoms)
    with open(output_dir / "symptoms.json", "w") as f:
        json.dump(symptoms_out, f, indent=2)
    print(f"  Wrote symptoms.json ({len(symptoms_out)} entries)")
    
    # Stats
    total_links = sum(len(s["remedies"]) for s in symptoms.values())
    print(f"\nTotal symptom-remedy links: {total_links}")

if __name__ == "__main__":
    main()
